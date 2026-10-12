import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ConnectorDocument,
  ConnectorResource,
  EnterpriseConnector,
  parseResourceId,
} from './enterprise-connector.interface';

const SUPPORTED_EXTENSIONS = ['.txt'];

/** Root of the simulated repository. Overridable so tests can point elsewhere. */
export const resolveDocumentRoot = (): string =>
  path.resolve(process.env.AMBERD_DOCUMENT_ROOT ?? path.join(process.cwd(), 'enterprise-docs'));

/**
 * Local Enterprise Document Connector.
 *
 * Reads documents from a directory on the API host that stands in for an
 * enterprise repository. It is a real, working connector — but a simulated
 * integration: it is not Google Drive.
 */
export class LocalDocumentConnector implements EnterpriseConnector {
  readonly type = 'LOCAL_DOCUMENTS';

  constructor(private readonly root: string = resolveDocumentRoot()) {}

  async listResources(_config: Record<string, unknown>, collection: string): Promise<ConnectorResource[]> {
    const directory = this.resolveInsideRoot(collection);
    if (!directory) return [];

    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch {
      return [];
    }

    const resources = await Promise.all(
      entries
        .filter((entry) => SUPPORTED_EXTENSIONS.includes(path.extname(entry)))
        .map(async (entry) => {
          const documentId = path.basename(entry, path.extname(entry));
          const stats = await fs.stat(path.join(directory, entry));
          return {
            id: `${collection}/${documentId}`,
            collection,
            documentId,
            title: documentId,
            sizeBytes: stats.size,
            updatedAt: stats.mtime,
          };
        }),
    );
    return resources.sort((a, b) => a.documentId.localeCompare(b.documentId));
  }

  async readResource(_config: Record<string, unknown>, resourceId: string): Promise<ConnectorDocument | null> {
    const parsed = parseResourceId(resourceId);
    if (!parsed) return null;

    for (const extension of SUPPORTED_EXTENSIONS) {
      const filePath = this.resolveInsideRoot(`${parsed.collection}/${parsed.documentId}${extension}`);
      if (!filePath) return null;
      try {
        const [content, stats] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
        return {
          id: resourceId,
          collection: parsed.collection,
          documentId: parsed.documentId,
          title: parsed.documentId,
          sizeBytes: stats.size,
          updatedAt: stats.mtime,
          content,
          mediaType: 'text/plain',
        };
      } catch {
        // Try the next supported extension.
      }
    }
    return null;
  }

  /** Defence in depth: ids are pattern-checked upstream, but never trust a path. */
  private resolveInsideRoot(relative: string): string | null {
    const resolved = path.resolve(this.root, relative);
    return resolved.startsWith(this.root + path.sep) ? resolved : null;
  }
}
