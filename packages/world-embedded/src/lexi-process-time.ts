import { ulid } from 'ulid';
import z from 'zod';

/**
 * LexiProcessTime is like a ULID with nanosecond precision.
 * The idea is that the 0 time is the process start time, and it
 * also encodes the nanoseconds since the last millisecond.
 *
 * The time part is _microseconds_, which makes it much more dense
 * and sortable than a regular ULID.
 */
export const LexiProcessTime = z.string().brand('LexiProcessTime');
export type LexiProcessTime = z.infer<typeof LexiProcessTime>;

export function generateLexiProcessTime(): LexiProcessTime {
  const time = process.hrtime.bigint();
  const timePart = Number(time / 1000n);
  return ulid(timePart) as LexiProcessTime;
}
