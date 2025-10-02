import type { Streamer } from '@vercel/workflow-world';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStreamer } from './streamer.js';
import { createJazzTestAccountResolver } from './testUtils.js';

describe('Jazz Streamer', () => {
  let streamer: Streamer;

  async function newStreamer(): Promise<Streamer> {
    const ensureLoaded = createJazzTestAccountResolver();
    return createStreamer(ensureLoaded);
  }

  beforeEach(async () => {
    streamer = await newStreamer();
  });

  describe('readFromStream', () => {
    it('should read chunks from a completed stream', async () => {
      const streamName = 'read-stream';
      const chunk1 = 'hello ';
      const chunk2 = 'world';

      await streamer.writeToStream(streamName, chunk1);
      await streamer.writeToStream(streamName, chunk2);
      await streamer.closeStream(streamName);

      const stream = await streamer.readFromStream(streamName);
      const reader = stream.getReader();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(result.value);
        }
      }

      const combined = Buffer.concat(chunks).toString();
      expect(combined).toBe('hello world');
    });

    it('should read binary data correctly', async () => {
      const streamName = 'binary-stream';
      const binaryData1 = new Uint8Array([1, 2, 3]);
      const binaryData2 = new Uint8Array([4, 5, 6]);

      await streamer.writeToStream(streamName, binaryData1);
      await streamer.writeToStream(streamName, binaryData2);
      await streamer.closeStream(streamName);

      const stream = await streamer.readFromStream(streamName);
      const reader = stream.getReader();

      const chunks: Uint8Array[] = [];
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(result.value);
        }
      }

      const combined = new Uint8Array(
        chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      );
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      expect(Array.from(combined)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete write-close-read cycle', async () => {
      const streamName = 'integration-stream';

      // Write chunks with proper timing
      await streamer.writeToStream(streamName, 'start ');
      await new Promise((resolve) => setTimeout(resolve, 2));
      await streamer.writeToStream(streamName, 'middle ');
      await new Promise((resolve) => setTimeout(resolve, 2));
      await streamer.writeToStream(streamName, 'end');

      // Close the stream
      await streamer.closeStream(streamName);

      // Read complete stream
      const completeStream = await streamer.readFromStream(streamName);
      const completeReader = completeStream.getReader();
      const completeChunks: Uint8Array[] = [];
      let completeDone = false;

      while (!completeDone) {
        const completeResult = await completeReader.read();
        completeDone = completeResult.done;
        if (completeResult.value) {
          completeChunks.push(completeResult.value);
        }
      }

      const completeContent = Buffer.concat(completeChunks).toString();
      expect(completeContent).toBe('start middle end');
    });
  });

  it('should handle reading before write is complete', async () => {});
});
