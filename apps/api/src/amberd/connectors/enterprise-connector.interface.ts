/**
 * Contract every Amberd Lite data connector implements.
 *
 * Connectors only ever receive non-secret configuration plus a resource id that
 * has already passed the platform's authorization checks; credentials (when a
 * connector needs them) are read from environment variables inside the
 * connector and never returned to callers or sent to a model.
 */
export interface ConnectorResource {
  id: string;
  collection: string;
  documentId: string;
  title: string;
  sizeBytes: number;
  updatedAt: Date;
}

export interface ConnectorDocument extends ConnectorResource {
  /** Plain text extracted from the source file. */
  content: string;
  /** MIME type of the source file as stored (e.g. application/pdf). */
  mediaType: string;
  /** Link back to the document in its source system, when there is one. */
  sourceUrl?: string;
}

export interface EnterpriseConnector {
  readonly type: string;
  listResources(config: Record<string, unknown>, collection: string): Promise<ConnectorResource[]>;
  /** Returns null when the resource does not exist. */
  readResource(config: Record<string, unknown>, resourceId: string): Promise<ConnectorDocument | null>;
}

/**
 * `<collection>/<document>`. Collections are local folder names or remote
 * folder/file ids (Google Drive ids mix case and use `_` and `-`).
 */
export const RESOURCE_ID_PATTERN = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/;

export const parseResourceId = (
  resourceId: string,
): { collection: string; documentId: string } | null => {
  const match = RESOURCE_ID_PATTERN.exec(resourceId);
  if (!match || match[2].includes('..')) return null;
  return { collection: match[1], documentId: match[2] };
};
