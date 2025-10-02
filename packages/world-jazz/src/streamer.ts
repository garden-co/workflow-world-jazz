import type { Streamer } from '@vercel/workflow-world';
import { co, type FileStream } from 'jazz-tools';
import type { JazzStorageAccountResolver } from './types.js';

export const createStreamer = (
  ensureLoaded: JazzStorageAccountResolver
): Streamer => ({
  async writeToStream(name: string, chunk: string | Uint8Array | Buffer) {
    const streams = (
      await ensureLoaded({
        root: {
          streams: true,
        },
      })
    ).root.streams;

    // biome-ignore lint/style/noNonNullAssertion: ensureLoaded throws if the stream is not found
    const fileStream = (
      await streams.$jazz
        .ensureLoaded({
          resolve: {
            [name]: true,
          },
        })
        .catch(() => {
          const fs = co.fileStream().create();
          fs.start({ mimeType: 'application/octet-stream' });
          streams.$jazz.set(name, fs);
          return { [name]: fs };
        })
    )[name]!;

    // Convert chunk to Uint8Array if needed
    let chunkData: Uint8Array;
    if (typeof chunk === 'string') {
      chunkData = new TextEncoder().encode(chunk);
    } else if (chunk instanceof Buffer) {
      chunkData = new Uint8Array(chunk);
    } else {
      chunkData = chunk;
    }

    fileStream.push(chunkData);
  },

  async closeStream(name: string) {
    // biome-ignore lint/style/noNonNullAssertion: ensureLoaded throws if the stream is not found
    const stream = (
      await ensureLoaded({
        root: {
          streams: {
            [name]: true,
          },
        },
      }).catch((error) => {
        throw new Error(`Stream ${name} not found`, { cause: error });
      })
    ).root.streams[name]!;

    stream.end();
  },

  async readFromStream(
    name: string,
    startIndex = 0
  ): Promise<ReadableStream<Uint8Array>> {
    // biome-ignore lint/style/noNonNullAssertion: ensureLoaded throws if the stream is not found
    const stream = (
      await ensureLoaded({
        root: {
          streams: {
            [name]: true,
          },
        },
      }).catch((error) => {
        throw new Error(`Stream ${name} not found`, { cause: error });
      })
    ).root.streams[name]!;

    let unsubscribe: () => void;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let lastIndex = startIndex;

        unsubscribe = stream.$jazz.subscribe((fileStream: FileStream) => {
          const chunks = fileStream.getChunks({ allowUnfinished: true });
          if (chunks) {
            for (let i = lastIndex; i < chunks.chunks.length; i++) {
              controller.enqueue(chunks.chunks[i]);
            }
            lastIndex = chunks.chunks.length;
          }

          if (fileStream.isBinaryStreamEnded()) {
            controller.close();
            unsubscribe();
          }
        });
      },
      cancel() {
        unsubscribe();
      },
    });
  },
});
