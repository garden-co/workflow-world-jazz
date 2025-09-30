import { co, FileStream } from 'jazz-tools';
import type { Streamer } from '../world/interfaces.js';
import { JazzStorageRoot } from './types.js';

export const createStreamer = (
  rootPromise: Promise<JazzStorageRoot>
): Streamer => ({
  async writeToStream(name: string, chunk: string | Uint8Array | Buffer) {
    const streams = (
      await (
        await rootPromise
      ).$jazz.ensureLoaded({
        resolve: {
          streams: true,
        },
      })
    ).streams;

    // Convert chunk to Uint8Array if needed
    let chunkData: Uint8Array;
    if (typeof chunk === 'string') {
      chunkData = new TextEncoder().encode(chunk);
    } else if (chunk instanceof Buffer) {
      chunkData = new Uint8Array(chunk);
    } else {
      chunkData = chunk;
    }

    let fileStream = streams[name];
    if (!fileStream) {
      fileStream = co.fileStream().create();
      fileStream.start({
        mimeType: 'application/octet-stream',
      });
      streams.$jazz.set(name, fileStream);
    }

    fileStream.push(chunkData);
  },

  async closeStream(name: string) {
    const stream = (
      await (
        await rootPromise
      ).$jazz
        .ensureLoaded({
          resolve: {
            streams: {
              [name]: true,
            },
          },
        })
        .catch(() => {
          throw new Error(`Stream ${name} not found`);
        })
    ).streams[name]!;

    stream.end();
  },

  async readFromStream(
    name: string,
    startIndex: number = 0
  ): Promise<ReadableStream<Uint8Array>> {
    const stream = (
      await (
        await rootPromise
      ).$jazz
        .ensureLoaded({
          resolve: {
            streams: {
              [name]: true,
            },
          },
        })
        .catch(() => {
          throw new Error(`Stream ${name} not found`);
        })
    ).streams[name]!;

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
