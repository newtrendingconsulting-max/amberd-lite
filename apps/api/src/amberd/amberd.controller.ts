import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TokenPayload } from '@app-starter/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { AgentsService } from './agents.service';
import { RunsService } from './runs.service';
import { PlatformService } from './platform.service';
import { ConnectionsService } from './connectors/connections.service';
import { ExecutionEngineService } from './engine/execution-engine.service';
import {
  AgentDefinitionDto,
  ApprovalDecisionDto,
  ExecuteAgentDto,
  SetAgentStatusDto,
  UpdatePolicyDto,
} from './dto/amberd.dto';

type AuthedRequest = { user: TokenPayload };

/**
 * Amberd Lite platform routes. The organization id is part of every path so tenant
 * scoping is visible at the route level, as in ProjectsController.
 */
@ApiTags('amberd')
@Controller('organizations/:organizationId/amberd')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class AmberdController {
  constructor(
    private readonly agents: AgentsService,
    private readonly runs: RunsService,
    private readonly platform: PlatformService,
    private readonly connections: ConnectionsService,
    private readonly engine: ExecutionEngineService,
  ) {}

  // ---- Agents -------------------------------------------------------------

  @Get('agents')
  @ApiOperation({ summary: 'List agents' })
  listAgents(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.agents.list(req.user.sub, organizationId);
  }

  @Post('agents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an agent from a definition (visual builder or JSON)' })
  createAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: AgentDefinitionDto,
  ) {
    return this.agents.create(req.user.sub, organizationId, body.definition, 'builder');
  }

  @Post('agents/import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Import an agent from an exported JSON definition' })
  importAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: AgentDefinitionDto,
  ) {
    return this.agents.create(req.user.sub, organizationId, body.definition, 'JSON import');
  }

  @Post('agents/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a definition without saving it' })
  validateAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: AgentDefinitionDto,
    @Query('agentId') agentId?: string,
  ) {
    return this.agents.validate(req.user.sub, organizationId, body.definition, agentId);
  }

  @Get('agents/:agentId')
  getAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agents.get(req.user.sub, organizationId, agentId);
  }

  @Put('agents/:agentId')
  updateAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Body() body: AgentDefinitionDto,
  ) {
    return this.agents.update(req.user.sub, organizationId, agentId, body.definition);
  }

  @Post('agents/:agentId/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicateAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agents.duplicate(req.user.sub, organizationId, agentId);
  }

  @Patch('agents/:agentId/status')
  setAgentStatus(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Body() body: SetAgentStatusDto,
  ) {
    return this.agents.setStatus(req.user.sub, organizationId, agentId, body.status);
  }

  @Delete('agents/:agentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.agents.archive(req.user.sub, organizationId, agentId);
  }

  @Post('agents/:agentId/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute an agent now (manual trigger)' })
  executeAgent(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Body() body: ExecuteAgentDto,
  ) {
    return this.engine.execute(req.user.sub, organizationId, agentId, body.inputs ?? {}, 'MANUAL', {
      emailRecipients: body.emailRecipients,
    });
  }

  // ---- Runs ---------------------------------------------------------------

  @Get('runs')
  listRuns(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.runs.list(req.user.sub, organizationId, agentId);
  }

  @Get('runs/:runId')
  getRun(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
  ) {
    return this.runs.get(req.user.sub, organizationId, runId);
  }

  @Get('runs/:runId/report.pdf')
  @ApiOperation({ summary: 'Download the run report as a PDF' })
  async downloadReport(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.runs.reportPdf(req.user.sub, organizationId, runId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('integrations-status')
  @ApiOperation({ summary: 'Which integrations are configured on this server (no secrets returned)' })
  integrationsStatus(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.integrationsStatus(req.user.sub, organizationId);
  }

  @Post('runs/:runId/actions/:actionId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject an approval-required action (OWNER/ADMIN)' })
  decide(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('runId') runId: string,
    @Param('actionId') actionId: string,
    @Body() body: ApprovalDecisionDto,
  ) {
    return this.runs.decide(req.user.sub, organizationId, runId, actionId, body.decision, body.note);
  }

  // ---- Connections --------------------------------------------------------

  @Get('connections')
  listConnections(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.connections.list(req.user.sub, organizationId);
  }

  @Get('connections/:connectionId/resources')
  listResources(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Query('collection') collection: string,
  ) {
    return this.connections.listResources(req.user.sub, organizationId, connectionId, collection ?? '');
  }

  @Get('connections/:connectionId/resources/:collection/:documentId')
  previewResource(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Param('connectionId') connectionId: string,
    @Param('collection') collection: string,
    @Param('documentId') documentId: string,
  ) {
    return this.connections.preview(req.user.sub, organizationId, connectionId, `${collection}/${documentId}`);
  }

  // ---- Platform -----------------------------------------------------------

  @Get('overview')
  overview(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.overview(req.user.sub, organizationId);
  }

  @Get('costs')
  costs(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.costs(req.user.sub, organizationId);
  }

  @Get('models')
  models(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.models(req.user.sub, organizationId);
  }

  @Get('templates')
  templates(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.templates(req.user.sub, organizationId);
  }

  @Get('policies')
  getPolicy(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.getPolicy(req.user.sub, organizationId);
  }

  @Put('policies')
  updatePolicy(
    @Request() req: AuthedRequest,
    @Param('organizationId') organizationId: string,
    @Body() body: UpdatePolicyDto,
  ) {
    return this.platform.updatePolicy(req.user.sub, organizationId, body);
  }

  @Get('logs')
  logs(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.logs(req.user.sub, organizationId);
  }

  @Get('gpu')
  gpu(@Request() req: AuthedRequest, @Param('organizationId') organizationId: string) {
    return this.platform.gpu(req.user.sub, organizationId);
  }
}
