import type { Streamer } from '@vercel/workflow-world';
import { co, type FileStream } from 'jazz-tools';
import { type JazzStorageAccountResolver, JazzStream } from './types.js';

export const createStreamer = (
  ensureLoaded: JazzStorageAccountResolver
): Streamer => {
  const loadOrCreateStream = async (name: string): Promise<FileStream> => {
    const root = (await ensureLoaded({ root: true })).root;

    const unique = `stream/${name}`;
    let js = await JazzStream.loadUnique(unique, root.$jazz.owner.$jazz.id, {
      resolve: {
        stream: true,
      },
    });
    if (js) {
      return js.stream;
    }

    js = JazzStream.create(
      { name, stream: co.fileStream().create() },
      { unique, owner: root.$jazz.owner }
    );
    js.stream.start({ mimeType: 'application/octet-stream' });
    return js.stream;
  };

  return {
    async writeToStream(name: string, chunk: string | Uint8Array | Buffer) {
      const stream = await loadOrCreateStream(name);

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
      const stream = await loadOrCreateStream(name);
      stream.end();
    },

    async readFromStream(
      name: string,
      startIndex = 0
    ): Promise<ReadableStream<Uint8Array>> {
      const stream = await loadOrCreateStream(name);

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
