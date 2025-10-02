import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decodeTime } from 'ulid';
import { z } from 'zod';
import type { PaginatedResponse } from '@vercel/workflow-world';

const Ulid = z.ulid();

export function ulidToDate(maybeUlid: string): Date | null {
  const ulid = Ulid.safeParse(maybeUlid);
  if (!ulid.success) {
    return null;
  }

  return new Date(decodeTime(ulid.data));
}

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (_error) {
    // Ignore if already exists
  }
}

export async function writeJSON(filePath: string, data: any): Promise<void> {
  return write(filePath, JSON.stringify(data, null, 2));
}

export async function write(
  filePath: string,
  data: string | Buffer
): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

export async function readJSON<T>(
  filePath: string,
  decoder: z.ZodType<T>
): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return decoder.parse(JSON.parse(content));
  } catch (error) {
    if ((error as any).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readBuffer(filePath: string): Promise<Buffer> {
  const content = await fs.readFile(filePath);
  return content;
}

export async function deleteJSON(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as any).code !== 'ENOENT') throw error;
  }
}

export async function listJSONFiles(dirPath: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dirPath);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch (error) {
    if ((error as any).code === 'ENOENT') return [];
    throw error;
  }
}

interface PaginatedFileSystemQueryConfig<T> {
  directory: string;
  schema: z.ZodType<T>;
  filePrefix?: string;
  filter?: (item: T) => boolean;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
  getCreatedAt(filename: string): Date | null;
}
export async function paginatedFileSystemQuery<T extends { createdAt: Date }>(
  config: PaginatedFileSystemQueryConfig<T>
): Promise<PaginatedResponse<T>> {
  const {
    directory,
    schema,
    filePrefix,
    filter,
    sortOrder = 'desc',
    limit = 20,
    cursor,
    getCreatedAt,
  } = config;

  // 1. Get all JSON files in directory
  const fileIds = await listJSONFiles(directory);

  // 2. Filter by prefix if provided
  const relevantFileIds = filePrefix
    ? fileIds.filter((fileId) => fileId.startsWith(filePrefix))
    : fileIds;

  // 3. ULID Optimization: Filter by cursor using filename timestamps before loading JSON
  const cursorDate = cursor ? new Date(cursor) : null;
  let candidateFileIds = relevantFileIds;

  if (cursorDate) {
    candidateFileIds = relevantFileIds.filter((fileId) => {
      const filenameDate = getCreatedAt(`${fileId}.json`);
      if (filenameDate) {
        // Use filename timestamp for cursor filtering
        return sortOrder === 'desc'
          ? filenameDate < cursorDate
          : filenameDate > cursorDate;
      }
      // Skip files where we can't extract timestamp - no optimization benefit
      return false;
    });
  } else {
    // Even without cursor, skip files where getCreatedAt returns null for consistency
    candidateFileIds = relevantFileIds.filter((fileId) => {
      return getCreatedAt(`${fileId}.json`) !== null;
    });
  }

  // 4. Load files individually and collect valid items
  const validItems: T[] = [];

  for (const fileId of candidateFileIds) {
    const filePath = path.join(directory, `${fileId}.json`);
    const item = await readJSON(filePath, schema);

    if (item) {
      // Apply custom filter early if provided
      if (filter && !filter(item)) continue;

      // Double-check cursor filtering with actual createdAt from JSON
      // (in case ULID timestamp differs from stored createdAt)
      if (cursorDate) {
        const passesFilter =
          sortOrder === 'desc'
            ? item.createdAt < cursorDate
            : item.createdAt > cursorDate;
        if (!passesFilter) continue;
      }

      validItems.push(item);
    }
  }

  // 5. Sort by createdAt
  validItems.sort((a, b) => {
    const aTime = a.createdAt.getTime();
    const bTime = b.createdAt.getTime();
    return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
  });

  // 6. Apply pagination
  const hasMore = validItems.length > limit;
  const items = hasMore ? validItems.slice(0, limit) : validItems;
  const nextCursor = hasMore
    ? items[items.length - 1]?.createdAt?.toISOString()
    : null;

  return {
    data: items,
    cursor: nextCursor,
    hasMore,
  };
}
