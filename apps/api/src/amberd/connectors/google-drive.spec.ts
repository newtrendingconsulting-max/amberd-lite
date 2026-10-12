import { encryptSecret, signOAuthState } from '../security/credential-cipher';
import { DRIVE_SELECTED_FILES, GoogleDriveConnector } from './google-drive.connector';
import { GoogleDriveError, buildAuthorizationUrl } from './google-drive.client';
import { GoogleDriveIntegrationService } from './google-drive.integration';

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) }) as Response;

describe('Google Drive — file-scoped access', () => {
  const originalEnv = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'x'.repeat(40),
      GOOGLE_DRIVE_CLIENT_ID: 'client-id',
      GOOGLE_DRIVE_CLIENT_SECRET: 'client-secret',
      GOOGLE_DRIVE_API_KEY: 'api-key',
      GOOGLE_DRIVE_APP_ID: '1234',
    };
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchMock.mockRestore();
  });

  it('requests only the drive.file scope', () => {
    const actual = new URL(buildAuthorizationUrl('state'));

    expect(actual.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.file');
    expect(actual.searchParams.has('include_granted_scopes')).toBe(false);
  });

  it('refuses to read a file the user did not pick, without calling Google', async () => {
    const connector = new GoogleDriveConnector();
    const inputConfig = {
      provider: 'google-drive',
      encryptedRefreshToken: encryptSecret('refresh'),
      resourceNames: { pickedFile1: { name: 'PO.pdf', type: 'file' } },
    };

    await expect(connector.readResource(inputConfig, `${DRIVE_SELECTED_FILES}/someOtherFile`)).rejects.toBeInstanceOf(
      GoogleDriveError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards and revokes a token that carries broad Drive access', async () => {
    const prisma: any = {
      dataConnection: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const access: any = { requireManager: jest.fn(), log: jest.fn() };
    const connections: any = {
      loadScoped: jest.fn(async () => ({ id: 'conn-1', type: 'GOOGLE_DRIVE', config: {}, authorizedResources: [] })),
    };
    const service = new GoogleDriveIntegrationService(prisma, access, {} as any, connections);
    fetchMock.mockImplementation(async (url: string | URL) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return jsonResponse({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          scope: 'openid email https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file',
        });
      }
      return jsonResponse({});
    });

    const actualRedirect = await service.handleCallback({
      code: 'code',
      state: signOAuthState({ organizationId: 'org', userId: 'user', connectionId: 'conn-1' }),
    });

    expect(actualRedirect).toContain('drive_error=');
    expect(prisma.dataConnection.update).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('oauth2.googleapis.com/revoke'))).toBe(true);
  });

  it('rejects a tampered OAuth state', async () => {
    const service = new GoogleDriveIntegrationService({} as any, {} as any, {} as any, {} as any);
    const state = signOAuthState({ organizationId: 'org', userId: 'user', connectionId: 'conn-1' });

    const actualRedirect = await service.handleCallback({ code: 'code', state: `${state.slice(0, -2)}xx` });

    expect(actualRedirect).toContain('drive_error=');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
