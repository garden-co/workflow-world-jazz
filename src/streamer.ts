import type { Streamer } from '@workflow/world';
import { co, FileStream } from 'jazz-tools';
import type { Engine } from './engine.js';

const DEFAULT_CHUNK_PAGE = 100;
const MAX_CHUNK_PAGE = 1000;

/**
 * Each stream is a FileStream on its run, one Jazz chunk per written chunk,
 * so chunk boundaries and indexes survive the round trip.
 */
export function createStreamer(
  engine: Engine,
  sync: () => Promise<void>
): Streamer {
  const loadOrCreate = (runId: string, name: string): Promise<FileStream> =>
    // Serialized per stream, so two first writers cannot each create one.
    engine.withLock(`stream ${runId} ${name}`, async () => {
      const state = await engine.require(runId);
      const streams = state.doc.streams;
      const id = streams.$jazz.refs[name]?.id;
      if (id) {
        // A stream is read while it is still being written, so it must not
        // wait for its end.
        const stream = await FileStream.load(id, { allowUnfinished: true });
        if (!stream.$isLoaded) {
          throw new Error(`Stream ${name} of run ${runId} could not be loaded`);
        }
        return stream;
      }
      const stream = co.fileStream().create({ owner: streams.$jazz.owner });
      stream.start({ mimeType: 'application/octet-stream' });
      streams.$jazz.set(name, stream);
      return stream;
    });

  const toBytes = (chunk: string | Uint8Array) =>
    typeof chunk === 'string'
      ? new TextEncoder().encode(chunk)
      : new Uint8Array(chunk);

  const chunksOf = (stream: FileStream) =>
    stream.getChunks({ allowUnfinished: true })?.chunks ?? [];

  const writeMulti = async (
    runId: string,
    name: string,
    chunks: (string | Uint8Array)[]
  ) => {
    const stream = await loadOrCreate(runId, name);
    if (stream.isBinaryStreamEnded()) return;
    for (const chunk of chunks) stream.push(toBytes(chunk));
    await sync();
  };

  return {
    streams: {
      write: (runId, name, chunk) => writeMulti(runId, name, [chunk]),

      writeMulti,

      async close(runId, name) {
        const stream = await loadOrCreate(runId, name);
        if (!stream.isBinaryStreamEnded()) stream.end();
        await sync();
      },

      async get(runId, name, startIndex = 0) {
        const stream = await loadOrCreate(runId, name);
        let next =
          startIndex < 0
            ? Math.max(0, chunksOf(stream).length + startIndex)
            : startIndex;
        let unsubscribe: (() => void) | undefined;
        let closed = false;
        return new ReadableStream<Uint8Array>({
          start(controller) {
            const flush = (current: FileStream) => {
              if (closed) return;
              const chunks = chunksOf(current);
              for (; next < chunks.length; next++) {
                controller.enqueue(chunks[next]);
              }
              if (current.isBinaryStreamEnded()) {
                closed = true;
                controller.close();
                // The first callback can run before `subscribe` returns.
                queueMicrotask(() => unsubscribe?.());
              }
            };
            flush(stream);
            if (!closed) {
              unsubscribe = stream.$jazz.subscribe((current) => flush(current));
            }
          },
          cancel() {
            closed = true;
            unsubscribe?.();
          },
        });
      },

      async list(runId) {
        const state = await engine.require(runId);
        return Object.keys(state.doc.streams);
      },

      async getChunks(runId, name, options) {
        const stream = await loadOrCreate(runId, name);
        const chunks = chunksOf(stream);
        const limit = Math.min(
          Math.max(1, options?.limit ?? DEFAULT_CHUNK_PAGE),
          MAX_CHUNK_PAGE
        );
        const from = options?.cursor ? Number(options.cursor) : 0;
        const page = chunks.slice(from, from + limit);
        const end = from + page.length;
        return {
          data: page.map((data, i) => ({ index: from + i, data })),
          cursor: end < chunks.length ? String(end) : null,
          hasMore: end < chunks.length,
          done: stream.isBinaryStreamEnded(),
        };
      },

      async getInfo(runId, name) {
        const stream = await loadOrCreate(runId, name);
        return {
          tailIndex: chunksOf(stream).length - 1,
          done: stream.isBinaryStreamEnded(),
        };
      },
    },
  };
}
