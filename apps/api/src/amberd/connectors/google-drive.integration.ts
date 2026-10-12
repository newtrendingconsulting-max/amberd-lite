import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { TokenPayload } from '@app-starter/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { EmailVerifiedGuard } from '../../auth/email-verified.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AmberdAccessService } from '../amberd-access.service';
import { AmberdBootstrapService } from '../amberd-bootstrap.service';
import { encryptSecret, decryptSecret, signOAuthState, verifyOAuthState } from '../security/credential-cipher';
import { ConnectionsService } from './connections.service';
import { DRIVE_SELECTED_FILES, GoogleDriveConfig } from './google-drive.connector';
import {
  BROAD_DRIVE_SCOPES,
  GOOGLE_DRIVE_SCOPE,
  READABLE_MIME_TYPES,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  getAccountEmail,
  getFile,
  isGooglePickerConfigured,
  pickerSettings,
  revokeToken,
} from './google-drive.client';

const DRIVE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

class AuthorizedDriveResourceDto {
  @IsString()
  @Matches(DRIVE_ID)
  id!: string;

  @IsString()
  @MaxLength(300)
  name!: string;

  @IsIn(['file'])
  type!: 'file';
}

export class SetAuthorizedResourcesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AuthorizedDriveResourceDto)
  resources!: AuthorizedDriveResourceDto[];
}

/**
 * Google Drive connection lifecycle: OAuth sign-in with the `drive.file`
 * scope, picking individual files in Google Picker, and disconnecting.
 */
@Injectable()
export class GoogleDriveIntegrationService {
  private readonly logger = new Logger(GoogleDriveIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AmberdAccessService,
    private readonly bootstrap: AmberdBootstrapService,
    private readonly connections: ConnectionsService,
  ) {}

  async authorizationUrl(userId: string, organizationId: string, connectionId: string): Promise<{ url: string }> {
    await this.access.requireManager(userId, organizationId, 'connect data sources');
    await this.bootstrap.ensureDefaults(organizationId, userId);
    if (!isGooglePickerConfigured()) {
      throw new BadRequestException(
        'Google Drive is not configured on the server: add GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID',
      );
    }
    const connection = await this.loadDrive(organizationId, connectionId);
    return { url: buildAuthorizationUrl(signOAuthState({ organizationId, userId, connectionId: connection.id })) };
  }

  /** Public callback; trust comes only from the signed `state`. Returns the page to send the browser to. */
  async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const fail = (message: string) => `${frontend}/connections?drive_error=${encodeURIComponent(message)}`;
    if (query.error) return fail(query.error === 'access_denied' ? 'Google sign-in was cancelled' : query.error);
    if (!query.code || !query.state) return fail('Missing authorization code');

    try {
      const state = verifyOAuthState(query.state);
      await this.access.requireManager(state.userId, state.organizationId, 'connect data sources');
      const connection = await this.loadDrive(state.organizationId, state.connectionId);

      const tokens = await exchangeAuthorizationCode(query.code);
      if (!tokens.refresh_token) return fail('Google did not return a refresh token — please try connecting again');
      const granted = (tokens.scope ?? '').split(' ');
      if (granted.some((scope) => BROAD_DRIVE_SCOPES.includes(scope))) {
        // Never keep a token that could read the whole Drive.
        await revokeToken(tokens.refresh_token).catch(() => undefined);
        return fail('Google granted broader Drive access than requested, so Amberd Lite discarded it. Remove Amberd Lite at myaccount.google.com/permissions and connect again.');
      }
      if (!granted.includes(GOOGLE_DRIVE_SCOPE)) {
        await revokeToken(tokens.refresh_token).catch(() => undefined);
        return fail('The Google Drive file permission was not granted — tick it when signing in');
      }
      const accountEmail = await getAccountEmail(tokens.access_token);

      const previous = (connection.config ?? {}) as unknown as GoogleDriveConfig;
      const config: GoogleDriveConfig = {
        provider: 'google-drive',
        accountEmail,
        encryptedRefreshToken: encryptSecret(tokens.refresh_token),
        // Reconnecting the same account keeps the folders chosen earlier.
        resourceNames: previous.accountEmail === accountEmail ? previous.resourceNames ?? {} : {},
      };
      await this.prisma.dataConnection.update({
        where: { id: connection.id },
        data: {
          status: 'CONNECTED',
          isSimulated: false,
          description: `Google Drive (selected files only) connected as ${accountEmail}.`,
          config: config as unknown as Prisma.InputJsonValue,
          authorizedResources:
            previous.accountEmail === accountEmail ? connection.authorizedResources.filter(Boolean) : [],
          permissions: ['list', 'read'],
          lastActivityAt: new Date(),
        },
      });
      await this.access.log(state.organizationId, state.userId, 'info', 'connections', `Google Drive connected as ${accountEmail}`, {
        connectionId: connection.id,
      });
      return `${frontend}/connections?drive=connected`;
    } catch (error) {
      this.logger.warn(`Google Drive OAuth callback failed: ${(error as Error).message}`);
      return fail((error as Error).message);
    }
  }

  /**
   * Settings for Google Picker in the user's browser. The access token is
   * short-lived and limited to `drive.file`, so even in the browser it can only
   * reach files the user picks (or uploads) through the Picker.
   */
  async pickerSession(userId: string, organizationId: string, connectionId: string) {
    await this.access.requireManager(userId, organizationId, 'choose files from data sources');
    if (!isGooglePickerConfigured()) {
      throw new BadRequestException(
        'Google Picker is not configured on the server: add GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID',
      );
    }
    const connection = await this.loadDrive(organizationId, connectionId);
    const accessToken = await this.connections.googleDrive.accessToken(connection.config as Record<string, unknown>);
    return { accessToken, ...pickerSettings() };
  }

  async setAuthorizedResources(
    userId: string,
    organizationId: string,
    connectionId: string,
    resources: SetAuthorizedResourcesDto['resources'],
  ) {
    await this.access.requireManager(userId, organizationId, 'change data source permissions');
    const connection = await this.loadDrive(organizationId, connectionId);
    const config = (connection.config ?? {}) as unknown as GoogleDriveConfig;
    const token = await this.connections.googleDrive.accessToken(connection.config as Record<string, unknown>);

    // Confirm each file with Drive itself rather than trusting the client.
    // Under drive.file this only succeeds for files the user actually picked.
    const resourceNames: NonNullable<GoogleDriveConfig['resourceNames']> = {};
    for (const resource of resources) {
      const file = await getFile(token, resource.id);
      if (!READABLE_MIME_TYPES[file.mimeType]) {
        throw new BadRequestException(`"${file.name}" is not a supported document type (PDF, Excel, CSV, Google Sheets/Docs)`);
      }
      resourceNames[file.id] = { name: file.name, type: 'file' };
    }
    const fileIds = Object.keys(resourceNames);

    await this.prisma.dataConnection.update({
      where: { id: connection.id },
      data: {
        authorizedResources: fileIds.length ? [DRIVE_SELECTED_FILES, ...fileIds] : [],
        config: { ...config, resourceNames } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.access.log(organizationId, userId, 'info', 'connections', 'Google Drive authorized resources updated', {
      connectionId,
      files: Object.values(resourceNames).map((r) => r.name),
    });
    return this.connections.list(userId, organizationId);
  }

  async disconnect(userId: string, organizationId: string, connectionId: string) {
    await this.access.requireManager(userId, organizationId, 'disconnect data sources');
    const connection = await this.loadDrive(organizationId, connectionId);
    const config = (connection.config ?? {}) as unknown as GoogleDriveConfig;
    if (config.encryptedRefreshToken) {
      this.connections.googleDrive.forget(connection.config as Record<string, unknown>);
      await revokeToken(decryptSecret(config.encryptedRefreshToken)).catch(() => undefined);
    }
    await this.prisma.dataConnection.update({
      where: { id: connection.id },
      data: {
        status: 'NOT_CONNECTED',
        config: { provider: 'google-drive' } as Prisma.InputJsonValue,
        authorizedResources: [],
        permissions: [],
        description: 'Google Drive (selected files only). Not connected.',
      },
    });
    await this.access.log(organizationId, userId, 'warn', 'connections', 'Google Drive disconnected', { connectionId });
    return this.connections.list(userId, organizationId);
  }

  private async loadDrive(organizationId: string, connectionId: string) {
    const connection = await this.connections.loadScoped(organizationId, connectionId);
    if (connection.type !== 'GOOGLE_DRIVE') throw new BadRequestException('Not a Google Drive connection');
    return connection;
  }
}

type AuthedRequest = { user: TokenPayload };

@ApiTags('amberd')
@Controller('organizations/:organizationId/amberd/connections/:connectionId/google-drive')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class GoogleDriveConnectionController {
  constructor(private readonly drive: GoogleDriveIntegrationService) {}

  @Get('authorize')
  @ApiOperation({ summary: 'Start Google Drive OAuth (returns the Google sign-in URL)' })
  authorize(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.drive.authorizationUrl(req.user.sub, organizationId, connectionId);
  }

  @Get('picker-session')
  @ApiOperation({ summary: 'Short-lived drive.file token and settings for Google Picker' })
  pickerSession(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.drive.pickerSession(req.user.sub, organizationId, connectionId);
  }

  @Put('resources')
  setResources(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Body() body: SetAuthorizedResourcesDto,
  ) {
    return this.drive.setAuthorizedResources(req.user.sub, organizationId, connectionId, body.resources);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  disconnect(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.drive.disconnect(req.user.sub, organizationId, connectionId);
  }
}

/** Google redirects the browser here; no Amberd Lite session header is present. */
@ApiTags('amberd')
@Controller('amberd/integrations/google-drive')
export class GoogleDriveCallbackController {
  constructor(private readonly drive: GoogleDriveIntegrationService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(await this.drive.handleCallback({ code, state, error }));
  }
}
