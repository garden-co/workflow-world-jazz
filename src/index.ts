import { createWorld } from './world.js';

export type * from './types.js';

export { createWorld };
/** @deprecated Use `createWorld`. */
export const createJazzWorld = createWorld;
export default createWorld;
