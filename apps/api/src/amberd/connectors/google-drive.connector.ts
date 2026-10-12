import { createHash } from 'crypto';
import { decryptSecret } from '../security/credential-cipher';
import { extractDocumentText } from './document-text';
import {
  ConnectorDocument,
  ConnectorResource,
  EnterpriseConnector,
  parseResourceId,
} from './enterprise-connector.interface';
import {
  DriveFile,
  GoogleDriveError,
  READABLE_MIME_TYPES,
  downloadFile,
  getFile,
  refreshAccessToken,
} from './google-drive.client';

/**
 * Virtual collection meaning "every file the user picked for this connection".
 * Agents bind to it so the Run screen can offer each picked file.
 */
export const DRIVE_SELECTED_FILES = 'selected-files';

export interface GoogleDriveConfig {
  provider: 'google-drive';
  accountEmail?: string;
  encryptedRefreshToken?: string;
  /** The files the user picked in Google Picker, keyed by Drive file id. */
  resourceNames?: Record<string, { name: string; type: 'file' }>;
}

/**
 * Google Drive connector, file-scoped.
 *
 * With the `drive.file` scope Google itself only lets Amberd Lite open files the
 * user picked. Amberd Lite adds its own check on top: a document is readable only
 * if its id is in this connection's picked-file list.
 */
export class GoogleDriveConnector implements EnterpriseConnector {
  readonly type = 'GOOGLE_DRIVE';

  private readonly accessTokens = new Map<string, { token: string; expiresAt: number }>();

  async listResources(config: Record<string, unknown>, collection: string): Promise<ConnectorResource[]> {
    const picked = this.pickedIds(config);
    const ids = collection === DRIVE_SELECTED_FILES ? picked : picked.filter((id) => id === collection);
    const token = await this.accessToken(config);
    const files = await Promise.all(ids.map((id) => getFile(token, id)));
    return files
      .filter((file) => Boolean(READABLE_MIME_TYPES[file.mimeType]))
      .map((file) => this.toResource(collection, file))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async readResource(config: Record<string, unknown>, resourceId: string): Promise<ConnectorDocument | null> {
    const parsed = parseResourceId(resourceId);
    if (!parsed) return null;

    const isPicked = this.pickedIds(config).includes(parsed.documentId);
    const fitsCollection = parsed.collection === DRIVE_SELECTED_FILES || parsed.collection === parsed.documentId;
    if (!isPicked || !fitsCollection) {
      throw new GoogleDriveError('This file was not selected for Amberd Lite in Google Drive', 403);
    }

    const token = await this.accessToken(config);
    let file: DriveFile;
    try {
      file = await getFile(token, parsed.documentId);
    } catch (error) {
      if (error instanceof GoogleDriveError && error.status === 404) return null;
      throw error;
    }

    const { data, mimeType } = await downloadFile(token, file);
    const content = await extractDocumentText(data, mimeType);
    return {
      ...this.toResource(parsed.collection, file),
      content,
      mediaType: file.mimeType,
      sourceUrl: file.webViewLink,
    };
  }

  /** Short-lived access token, cached in memory only. */
  async accessToken(config: Record<string, unknown>): Promise<string> {
    const encrypted = (config as unknown as GoogleDriveConfig).encryptedRefreshToken;
    if (!encrypted) throw new GoogleDriveError('Google Drive is not connected — sign in from Data Connections', 401);
    const cacheKey = createHash('sha256').update(encrypted).digest('hex');
    const cached = this.accessTokens.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    const refreshed = await refreshAccessToken(decryptSecret(encrypted));
    this.accessTokens.set(cacheKey, { token: refreshed.access_token, expiresAt: Date.now() + refreshed.expires_in * 1000 });
    return refreshed.access_token;
  }

  forget(config: Record<string, unknown>): void {
    const encrypted = (config as unknown as GoogleDriveConfig).encryptedRefreshToken;
    if (encrypted) this.accessTokens.delete(createHash('sha256').update(encrypted).digest('hex'));
  }

  private pickedIds(config: Record<string, unknown>): string[] {
    return Object.keys((config as unknown as GoogleDriveConfig).resourceNames ?? {});
  }

  private toResource(collection: string, file: DriveFile): ConnectorResource {
    return {
      id: `${collection}/${file.id}`,
      collection,
      documentId: file.id,
      title: file.name,
      sizeBytes: Number(file.size ?? 0),
      updatedAt: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
    };
  }
}
