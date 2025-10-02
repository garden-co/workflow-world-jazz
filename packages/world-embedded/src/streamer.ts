import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { Streamer } from '@vercel/workflow-world';
import { listJSONFiles, readBuffer, write } from './fs.js';
import { generateLexiProcessTime } from './lexi-process-time.js';

/**
 * A chunk consists of a boolean `eof` indicating if it's the last chunk,
 * and a `chunk` which is a Buffer of data.
 * The serialized format is:
 * - 1 byte for `eof` (0 or 1)
 * - and the rest is the chunk data.
 */
export interface Chunk {
  eof: boolean;
  chunk: Buffer;
}

export function serializeChunk(chunk: Chunk) {
  const eofByte = Buffer.from([chunk.eof ? 1 : 0]);
  return Buffer.concat([eofByte, chunk.chunk]);
}

export function deserializeChunk(serialized: Buffer) {
  const eof = serialized[0] === 1;
  const chunk = serialized.subarray(1);
  return { eof, chunk };
}

export function createStreamer(basedir: string): Streamer {
  const streamEmitter = new EventEmitter<{
    [key: `chunk:${string}`]: [
      {
        streamName: string;
        chunkData: Uint8Array;
      },
    ];
    [key: `close:${string}`]: [
      {
        streamName: string;
      },
    ];
  }>();

  return {
    async writeToStream(name, chunk) {
      const chunkId = `strm_${generateLexiProcessTime()}`;

      if (typeof chunk === 'string') {
        chunk = new TextEncoder().encode(chunk);
      }
      const serialized = serializeChunk({
        chunk: Buffer.from(chunk),
        eof: false,
      });

      const chunkPath = path.join(
        basedir,
        'streams',
        'chunks',
        `${name}-${chunkId}.json`
      );

      await write(chunkPath, serialized);

      // Emit real-time event
      const chunkData =
        typeof chunk === 'string'
          ? new TextEncoder().encode(chunk)
          : chunk instanceof Buffer
            ? new Uint8Array(chunk)
            : chunk;

      streamEmitter.emit(`chunk:${name}` as const, {
        streamName: name,
        chunkData,
      });
    },

    async closeStream(name) {
      const chunkId = `strm_${generateLexiProcessTime()}`;
      const chunkPath = path.join(
        basedir,
        'streams',
        'chunks',
        `${name}-${chunkId}.json`
      );

      await write(
        chunkPath,
        serializeChunk({ chunk: Buffer.from([]), eof: true })
      );

      streamEmitter.emit(`close:${name}` as const, { streamName: name });
    },

    async readFromStream(name, startIndex = 0) {
      // Load all existing chunks
      const chunksDir = path.join(basedir, 'streams', 'chunks');
      const files = await listJSONFiles(chunksDir);
      const chunkFiles = files
        .filter((file) => file.startsWith(`${name}-`))
        .sort(); // ULID lexicographic sort = chronological order

      // const existingChunks = await Promise.all(
      //   chunkFiles.map(async (file) =>
      //     deserializeChunk(
      //       await readBuffer(path.join(chunksDir, `${file}.json`))
      //     )
      //   )
      // );

      // Check if stream is complete by looking for eof chunk
      // const isComplete = existingChunks.some((chunk) => chunk?.eof === true);
      let removeListeners = () => {};

      return new ReadableStream<Uint8Array>({
        async start(controller) {
          let isComplete = false;
          for (let i = startIndex; i < chunkFiles.length; i++) {
            const file = chunkFiles[i];
            const chunk = deserializeChunk(
              await readBuffer(path.join(chunksDir, `${file}.json`))
            );
            if (chunk?.eof === true) {
              isComplete = true;
              break;
            }
            if (chunk.chunk.byteLength) {
              controller.enqueue(chunk.chunk);
            }
          }

          if (isComplete) {
            controller.close();
            return;
          }

          // Store listener functions for cleanup
          const chunkListener = (event: {
            streamName: string;
            chunkData: Uint8Array;
          }) => {
            controller.enqueue(event.chunkData);
          };

          const closeListener = () => {
            // Remove listeners before closing
            streamEmitter.off(`chunk:${name}` as const, chunkListener);
            streamEmitter.off(`close:${name}` as const, closeListener);
            controller.close();
          };
          removeListeners = closeListener;

          // Add listeners
          streamEmitter.on(`chunk:${name}` as const, chunkListener);
          streamEmitter.on(`close:${name}` as const, closeListener);
        },

        cancel() {
          removeListeners();
        },
      });
    },
  };
}
