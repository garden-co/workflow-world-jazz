import type { Streamer } from '@vercel/workflow-world';
import { co, type FileStream } from 'jazz-tools';
import type { JazzStorageAccountResolver } from './types.js';

export const createStreamer = (
  ensureLoaded: JazzStorageAccountResolver
): Streamer => {
  const streamFactory = async (name: string): Promise<FileStream> => {
    const streams = (
      await ensureLoaded({
        root: {
          streams: true,
        },
      })
    ).root.streams;

    // Stream exists but is not loaded
    if (streams[name] === null) {
      // biome-ignore lint/style/noNonNullAssertion: ensureLoaded throws if the stream is not found
      return (await streams.$jazz.ensureLoaded({ resolve: { [name]: true } }))[
        name
      ]!;
    }

    // Stream does not exist
    if (streams[name] === undefined) {
      const fs = co.fileStream().create();
      fs.start({ mimeType: 'application/octet-stream' });
      streams.$jazz.set(name, fs);
      return fs;
    }

    // Stream exists and is loaded
    return streams[name];
  };

  return {
    async writeToStream(name: string, chunk: string | Uint8Array | Buffer) {
      const stream = await streamFactory(name);

      // Convert chunk to Uint8Array if needed
      let chunkData: Uint8Array;
      if (typeof chunk === 'string') {
        chunkData = new TextEncoder().encode(chunk);
      } else if (chunk instanceof Buffer) {
        chunkData = new Uint8Array(chunk);
      } else {
        chunkData = chunk;
      }

      stream.push(chunkData);
    },

    async closeStream(name: string) {
      const stream = await streamFactory(name);
      stream.end();
    },

    async readFromStream(
      name: string,
      startIndex = 0
    ): Promise<ReadableStream<Uint8Array>> {
      const stream = await streamFactory(name);

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
  };
};
