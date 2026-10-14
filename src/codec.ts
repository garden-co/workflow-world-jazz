import { Encoder } from 'cbor-x';
import { co, type Group } from 'jazz-tools';

// Event and queue payloads carry `Uint8Array`s and `Date`s, which JSON
// cannot round-trip, so everything this World persists is CBOR.
const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: true,
  tagUint8Array: false,
});

/**
 * Encoded values up to this size are stored inline in the CoList entry.
 * Larger ones go to their own FileStream, which Jazz syncs in chunks instead
 * of as one oversized transaction.
 */
const INLINE_LIMIT_BYTES = 8 * 1024;

const INLINE_PREFIX = 'b:';
const FILE_PREFIX = 'f:';

export function encodeBytes(value: unknown): Uint8Array {
  return encoder.encode(value);
}

export function decodeBytes<T>(bytes: Uint8Array): T {
  return toPlain(encoder.decode(bytes)) as T;
}

export function encodeInline(value: unknown): string {
  return Buffer.from(encodeBytes(value)).toString('base64');
}

export function decodeInline<T>(encoded: string): T {
  return decodeBytes<T>(Buffer.from(encoded, 'base64'));
}

/**
 * Encodes a value into a string entry, synchronously. Large values are
 * written to a new FileStream owned by `owner` and referenced from the entry.
 */
export function encodeEntry(value: unknown, owner: Group): string {
  const bytes = encodeBytes(value);
  if (bytes.byteLength <= INLINE_LIMIT_BYTES) {
    return INLINE_PREFIX + Buffer.from(bytes).toString('base64');
  }
  const stream = co.fileStream().create({ owner });
  stream.start({ mimeType: 'application/cbor', totalSizeBytes: bytes.length });
  stream.push(bytes);
  stream.end();
  return FILE_PREFIX + stream.$jazz.id;
}

export async function decodeEntry<T>(entry: string): Promise<T> {
  if (entry.startsWith(INLINE_PREFIX)) {
    return decodeInline<T>(entry.slice(INLINE_PREFIX.length));
  }
  if (entry.startsWith(FILE_PREFIX)) {
    const id = entry.slice(FILE_PREFIX.length);
    const stream = await co.fileStream().load(id);
    if (!stream.$isLoaded) {
      throw new Error(`Event payload ${id} could not be loaded`);
    }
    const chunks = stream.getChunks();
    if (!chunks) {
      throw new Error(`Event payload ${id} is incomplete`);
    }
    return decodeBytes<T>(Buffer.concat(chunks.chunks));
  }
  throw new Error(`Unrecognized event entry: ${entry.slice(0, 16)}`);
}

/** cbor-x decodes byte strings as Buffers. Hand back plain Uint8Arrays. */
function toPlain(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.isBuffer(value) ? new Uint8Array(value) : value;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = toPlain(entry);
    return out;
  }
  return value;
}
