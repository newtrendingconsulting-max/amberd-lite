import { SUPPORTED_MIME_TYPES } from './document-text';

/**
 * Minimal Google OAuth 2.0 + Drive v3 REST client.
 *
 * Uses only the `drive.file` scope: Amberd Lite can open exactly the files the user
 * picks in Google Picker (or uploads through it) and nothing else in their
 * Drive. Client credentials come from the server environment; the refresh
 * token is decrypted by the caller and never sent to the browser.
 */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const OAUTH_SCOPES = ['openid', 'email', GOOGLE_DRIVE_SCOPE];

/** Scopes that would expose the user's whole Drive. Amberd Lite refuses tokens carrying them. */
export const BROAD_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
];

export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

/** Drive files the agent can read, mapped to the format Amberd Lite downloads them in. */
export const READABLE_MIME_TYPES: Record<string, string> = {
  [SUPPORTED_MIME_TYPES.pdf]: SUPPORTED_MIME_TYPES.pdf,
  [SUPPORTED_MIME_TYPES.xlsx]: SUPPORTED_MIME_TYPES.xlsx,
  [SUPPORTED_MIME_TYPES.csv]: SUPPORTED_MIME_TYPES.csv,
  [SUPPORTED_MIME_TYPES.text]: SUPPORTED_MIME_TYPES.text,
  [GOOGLE_SHEET_MIME]: SUPPORTED_MIME_TYPES.xlsx,
  [GOOGLE_DOC_MIME]: SUPPORTED_MIME_TYPES.text,
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
}

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const googleDriveRedirectUri = (): string =>
  `${(process.env.APP_URL || process.env.API_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/amberd/integrations/google-drive/callback`;

export const isGoogleDriveConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() && process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim());

/** Google Picker also needs a browser API key and the Cloud project number. */
export const isGooglePickerConfigured = (): boolean =>
  isGoogleDriveConfigured() &&
  Boolean(process.env.GOOGLE_DRIVE_API_KEY?.trim() && process.env.GOOGLE_DRIVE_APP_ID?.trim());

export const pickerSettings = () => ({
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
  apiKey: process.env.GOOGLE_DRIVE_API_KEY!.trim(),
  appId: process.env.GOOGLE_DRIVE_APP_ID!.trim(),
});

const clientCredentials = () => {
  if (!isGoogleDriveConfigured()) {
    throw new GoogleDriveError('Google Drive OAuth client is not configured on the server');
  }
  return {
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!.trim(),
  };
};

export const buildAuthorizationUrl = (state: string): string => {
  const params = new URLSearchParams({
    client_id: clientCredentials().client_id,
    redirect_uri: googleDriveRedirectUri(),
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    // Forces a refresh token on every consent, so reconnecting always works.
    // No include_granted_scopes: the token must carry only what is asked here.
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

const postToken = async (body: Record<string, string>) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...clientCredentials(), ...body }).toString(),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new GoogleDriveError(`Google token exchange failed: ${json.error_description ?? json.error ?? response.status}`, response.status);
  }
  return json as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
};

export const exchangeAuthorizationCode = (code: string) =>
  postToken({ code, grant_type: 'authorization_code', redirect_uri: googleDriveRedirectUri() });

export const refreshAccessToken = (refreshToken: string) =>
  postToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });

export const revokeToken = async (token: string): Promise<void> => {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
};

const driveFetch = async (accessToken: string, path: string, init?: { raw?: boolean }) => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const json = (await response.json()) as { error?: { message?: string } };
      detail = json.error?.message ?? detail;
    } catch {
      // Non-JSON error body.
    }
    throw new GoogleDriveError(`Google Drive request failed: ${detail}`, response.status);
  }
  return init?.raw ? Buffer.from(await response.arrayBuffer()) : response.json();
};

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,parents,webViewLink';

export const getAccountEmail = async (accessToken: string): Promise<string> => {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new GoogleDriveError(`Could not read the Google account email (${response.status})`, response.status);
  const info = (await response.json()) as { email?: string };
  return info.email ?? 'unknown';
};

export const getFile = async (accessToken: string, fileId: string): Promise<DriveFile> =>
  (await driveFetch(accessToken, `files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}&supportsAllDrives=true`)) as DriveFile;

/** Download a file's bytes, exporting Google-native formats to a readable type. */
export const downloadFile = async (accessToken: string, file: DriveFile): Promise<{ data: Buffer; mimeType: string }> => {
  const targetMime = READABLE_MIME_TYPES[file.mimeType];
  if (!targetMime) throw new GoogleDriveError(`Unsupported file type in Drive: ${file.mimeType}`);
  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    const data = (await driveFetch(
      accessToken,
      `files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(targetMime)}`,
      { raw: true },
    )) as Buffer;
    return { data, mimeType: targetMime };
  }
  const data = (await driveFetch(accessToken, `files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, {
    raw: true,
  })) as Buffer;
  return { data, mimeType: targetMime };
};
