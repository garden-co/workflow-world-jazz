import * as devalue from 'devalue';
import { getWorld } from './runtime/world.js';
import { STREAM_NAME_SYMBOL, STREAM_TYPE_SYMBOL } from './symbols.js';

/**
 * Detect if a readable stream is a byte stream.
 *
 * @param stream
 * @returns `"bytes"` if the stream is a byte stream, `undefined` otherwise
 */
export function getStreamType(stream: ReadableStream) {
  try {
    const reader = stream.getReader({ mode: 'byob' });
    reader.releaseLock();
    return 'bytes';
  } catch {
    return undefined;
  }
}

export function getSerializeStream(
  reducers: Reducers
): TransformStream<any, Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new TransformStream<any, Uint8Array>({
    transform(chunk, controller) {
      const serialized = devalue.stringify(chunk, reducers);
      controller.enqueue(encoder.encode(`${serialized}\n`));
    },
  });
  return stream;
}

export function getDeserializeStream(
  revivers: Revivers
): TransformStream<Uint8Array, any> {
  const decoder = new TextDecoder();
  let buffer = '';
  const stream = new TransformStream<Uint8Array, any>({
    transform(chunk, controller) {
      // Append new chunk to buffer
      buffer += decoder.decode(chunk, { stream: true });

      // Process all complete lines
      while (true) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          const obj = devalue.parse(line, revivers);
          controller.enqueue(obj);
        }
      }
    },
    flush(controller) {
      // Process any remaining data in the buffer at the end of the stream
      if (buffer && buffer.length > 0) {
        const obj = devalue.parse(buffer, revivers);
        controller.enqueue(obj);
      }
    },
  });
  return stream;
}

export class WorkflowServerReadableStream extends ReadableStream<Uint8Array> {
  #reader?: ReadableStreamDefaultReader<Uint8Array>;

  constructor(name: string, startIndex?: number) {
    super({
      // @ts-expect-error Not sure why TypeScript is complaining about this
      type: 'bytes',

      pull: async (controller) => {
        let reader = this.#reader;
        if (!reader) {
          const world = getWorld();
          const stream = await world.readFromStream(name, startIndex);
          reader = this.#reader = stream.getReader();
        }
        if (!reader) {
          controller.error(new Error('Failed to get reader'));
          return;
        }

        const result = await reader.read();
        if (result.done) {
          this.#reader = undefined;
          controller.close();
        } else {
          controller.enqueue(result.value);
        }
      },
    });
  }
}

export class WorkflowServerWritableStream extends WritableStream<Uint8Array> {
  constructor(name: string) {
    const world = getWorld();
    super({
      write: async (chunk: string | Uint8Array | Buffer) => {
        await world.writeToStream(name, chunk);
      },
      close: async () => {
        await world.closeStream(name);
      },
    });
  }
}

// Types that need specialized handling when serialized/deserialized
// ! If a type is added here, it MUST also be added to the `Serializable` type in `schemas.ts`
export interface SerializableSpecial {
  ArrayBuffer: string; // base64 string
  BigInt64Array: string; // base64 string
  BigUint64Array: string; // base64 string
  Date: string; // ISO string
  Float32Array: string; // base64 string
  Float64Array: string; // base64 string
  Error: Record<string, any>;
  Headers: [string, string][];
  Int8Array: string; // base64 string
  Int16Array: string; // base64 string
  Int32Array: string; // base64 string
  Map: [any, any][];
  ReadableStream: { name: string; type?: 'bytes'; startIndex?: number };
  RegExp: { source: string; flags: string };
  Request: {
    method: string;
    url: string;
    headers: SerializableSpecial['Headers'];
    body: SerializableSpecial['ReadableStream'];
    duplex: globalThis.Request['duplex'];
  };
  Response: {
    type: globalThis.Response['type'];
    url: string;
    status: number;
    statusText: string;
    headers: SerializableSpecial['Headers'];
    body: SerializableSpecial['ReadableStream'];
    redirected: boolean;
  };
  Set: any[];
  URL: string;
  URLSearchParams: string;
  Uint8Array: string; // base64 string
  Uint8ClampedArray: string; // base64 string
  Uint16Array: string; // base64 string
  Uint32Array: string; // base64 string
  WritableStream: { name: string };
}

type Reducers = {
  [K in keyof SerializableSpecial]: (
    value: any
  ) => SerializableSpecial[K] | false;
};

type Revivers = {
  [K in keyof SerializableSpecial]: (value: SerializableSpecial[K]) => any;
};

function revive(str: string) {
  // biome-ignore lint/security/noGlobalEval: Eval is safe here - we are only passing value from `devalue.stringify()`
  // biome-ignore lint/complexity/noCommaOperator: This is how you do global scope eval
  return (0, eval)(`(${str})`);
}

function getCommonReducers(global: Record<string, any> = globalThis) {
  const abToBase64 = (value: ArrayBuffer, offset: number, length: number) =>
    Buffer.from(value, offset, length).toString('base64');
  const viewToBase64 = (value: ArrayBufferView) =>
    abToBase64(value.buffer, value.byteOffset, value.byteLength);

  return {
    ArrayBuffer: (value) =>
      value instanceof global.ArrayBuffer &&
      abToBase64(value, 0, value.byteLength),
    BigInt64Array: (value) =>
      value instanceof global.BigInt64Array && viewToBase64(value),
    BigUint64Array: (value) =>
      value instanceof global.BigUint64Array && viewToBase64(value),
    Date: (value) => {
      if (!(value instanceof global.Date)) return false;
      const valid = !Number.isNaN(value.getDate());
      return valid ? value.toISOString() : '';
    },
    Error: (value) => {
      if (!(value instanceof global.Error)) return false;
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    },
    Float32Array: (value) =>
      value instanceof global.Float32Array && viewToBase64(value),
    Float64Array: (value) =>
      value instanceof global.Float64Array && viewToBase64(value),
    Headers: (value) => value instanceof global.Headers && Array.from(value),
    Int8Array: (value) =>
      value instanceof global.Int8Array && viewToBase64(value),
    Int16Array: (value) =>
      value instanceof global.Int16Array && viewToBase64(value),
    Int32Array: (value) =>
      value instanceof global.Int32Array && viewToBase64(value),
    Map: (value) => value instanceof global.Map && Array.from(value),
    RegExp: (value) =>
      value instanceof global.RegExp && {
        source: value.source,
        flags: value.flags,
      },
    Request: (value) => {
      if (!(value instanceof global.Request)) return false;
      return {
        method: value.method,
        url: value.url,
        headers: value.headers,
        body: value.body,
        duplex: value.duplex,
      };
    },
    Response: (value) => {
      if (!(value instanceof global.Response)) return false;
      return {
        type: value.type,
        url: value.url,
        status: value.status,
        statusText: value.statusText,
        headers: value.headers,
        body: value.body,
        redirected: value.redirected,
      };
    },
    Set: (value) => value instanceof global.Set && Array.from(value),
    URL: (value) => value instanceof global.URL && value.href,
    URLSearchParams: (value) =>
      value instanceof global.URLSearchParams && String(value),
    Uint8Array: (value) =>
      value instanceof global.Uint8Array && viewToBase64(value),
    Uint8ClampedArray: (value) =>
      value instanceof global.Uint8ClampedArray && viewToBase64(value),
    Uint16Array: (value) =>
      value instanceof global.Uint16Array && viewToBase64(value),
    Uint32Array: (value) =>
      value instanceof global.Uint32Array && viewToBase64(value),
  } as const satisfies Partial<Reducers>;
}

/**
 * Reducers for serialization boundary from the client side, passing arguments
 * to the workflow handler.
 *
 * @param global
 * @param ops
 * @returns
 */
export function getExternalReducers(
  global: Record<string, any> = globalThis,
  ops: Promise<any>[]
): Reducers {
  return {
    ...getCommonReducers(global),

    ReadableStream: (value) => {
      if (!(value instanceof global.ReadableStream)) return false;

      // Stream must not be locked when passing across execution boundary
      if (value.locked) {
        throw new Error('ReadableStream is locked');
      }

      const name = global.crypto.randomUUID();
      const type = getStreamType(value);

      const writable = new WorkflowServerWritableStream(name);
      if (type === 'bytes') {
        ops.push(value.pipeTo(writable));
      } else {
        ops.push(
          value
            .pipeThrough(getSerializeStream(getExternalReducers(global, ops)))
            .pipeTo(writable)
        );
      }

      const s: SerializableSpecial['ReadableStream'] = { name };
      if (type) s.type = type;
      return s;
    },

    WritableStream: (value) => {
      if (!(value instanceof global.WritableStream)) return false;
      const name = global.crypto.randomUUID();
      ops.push(
        new WorkflowServerReadableStream(name)
          .pipeThrough(getDeserializeStream(getExternalRevivers(global, ops)))
          .pipeTo(value)
      );
      return { name };
    },
  };
}

/**
 * Reducers for serialization boundary from within the workflow execution
 * environment, passing return value to the client side and into step arguments.
 *
 * @param global
 * @returns
 */
export function getWorkflowReducers(
  global: Record<string, any> = globalThis
): Reducers {
  return {
    ...getCommonReducers(global),

    // Readable/Writable streams from within the workflow execution environment
    // are simply "handles" that can be passed around to other steps.
    ReadableStream: (value) => {
      if (!(value instanceof global.ReadableStream)) return false;
      const name = value[STREAM_NAME_SYMBOL];
      if (!name) {
        throw new Error('ReadableStream `name` is not set');
      }
      const s: SerializableSpecial['ReadableStream'] = { name };
      const type = value[STREAM_TYPE_SYMBOL];
      if (type) s.type = type;
      return s;
    },
    WritableStream: (value) => {
      if (!(value instanceof global.WritableStream)) return false;
      const name = value[STREAM_NAME_SYMBOL];
      if (!name) {
        throw new Error('WritableStream `name` is not set');
      }
      return { name };
    },
  };
}

/**
 * Reducers for serialization boundary from within the step execution
 * environment, passing return value to the workflow handler.
 *
 * @param global
 * @param ops
 * @returns
 */
function getStepReducers(
  global: Record<string, any> = globalThis,
  ops: Promise<any>[]
): Reducers {
  return {
    ...getCommonReducers(global),

    ReadableStream: (value) => {
      if (!(value instanceof global.ReadableStream)) return false;

      // Stream must not be locked when passing across execution boundary
      if (value.locked) {
        throw new Error('ReadableStream is locked');
      }

      // Check if the stream already has the name symbol set, in which case
      // it's already being sunk to the server and we can just return the
      // name and type.
      let name = value[STREAM_NAME_SYMBOL];
      let type = value[STREAM_TYPE_SYMBOL];

      if (!name) {
        name = global.crypto.randomUUID();
        type = getStreamType(value);

        const writable = new WorkflowServerWritableStream(name);
        if (type === 'bytes') {
          ops.push(value.pipeTo(writable));
        } else {
          ops.push(
            value
              .pipeThrough(getSerializeStream(getStepReducers(global, ops)))
              .pipeTo(writable)
          );
        }
      }

      const s: SerializableSpecial['ReadableStream'] = { name };
      if (type) s.type = type;
      return s;
    },

    WritableStream: (value) => {
      if (!(value instanceof global.WritableStream)) return false;

      let name = value[STREAM_NAME_SYMBOL];
      if (!name) {
        name = global.crypto.randomUUID();
        ops.push(
          new WorkflowServerReadableStream(name)
            .pipeThrough(getDeserializeStream(getStepRevivers(global, ops)))
            .pipeTo(value)
        );
      }

      return { name };
    },
  };
}

function getCommonRevivers(global: Record<string, any> = globalThis) {
  function reviveArrayBuffer(value: string) {
    const buffer = Buffer.from(value, 'base64');
    const arrayBuffer = new global.ArrayBuffer(buffer.length);
    const uint8Array = new global.Uint8Array(arrayBuffer);
    uint8Array.set(buffer);
    return arrayBuffer;
  }
  return {
    ArrayBuffer: reviveArrayBuffer,
    BigInt64Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.BigInt64Array(ab);
    },
    BigUint64Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.BigUint64Array(ab);
    },
    Date: (value) => new global.Date(value),
    Error: (value) => {
      const error = new global.Error(value.message);
      error.name = value.name;
      error.stack = value.stack;
      return error;
    },
    Float32Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Float32Array(ab);
    },
    Float64Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Float64Array(ab);
    },
    Headers: (value) => new global.Headers(value),
    Int8Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Int8Array(ab);
    },
    Int16Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Int16Array(ab);
    },
    Int32Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Int32Array(ab);
    },
    Map: (value) => new global.Map(value),
    RegExp: (value) => new global.RegExp(value.source, value.flags),
    Set: (value) => new global.Set(value),
    URL: (value) => new global.URL(value),
    URLSearchParams: (value) => new global.URLSearchParams(value),
    Uint8Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Uint8Array(ab);
    },
    Uint8ClampedArray: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Uint8ClampedArray(ab);
    },
    Uint16Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Uint16Array(ab);
    },
    Uint32Array: (value: string) => {
      const ab = reviveArrayBuffer(value);
      return new global.Uint32Array(ab);
    },
  } as const satisfies Partial<Revivers>;
}

/**
 * Revivers for deserialization boundary from the client side,
 * receiving the return value from the workflow handler.
 *
 * @param global
 * @param ops
 */
export function getExternalRevivers(
  global: Record<string, any> = globalThis,
  ops: Promise<any>[]
): Revivers {
  return {
    ...getCommonRevivers(global),

    Request: (value) => {
      return new global.Request(value.url, {
        method: value.method,
        headers: new global.Headers(value.headers),
        body: value.body,
        duplex: value.duplex,
      });
    },
    Response: (value) => {
      return new global.Response(value.body, {
        type: value.type,
        url: value.url,
        redirected: value.redirected,
        status: value.status,
        statusText: value.statusText,
        headers: new global.Headers(value.headers),
      });
    },
    ReadableStream: (value) => {
      const readable = new WorkflowServerReadableStream(
        value.name,
        value.startIndex
      );
      if (value.type === 'bytes') {
        return readable;
      } else {
        const transform = getDeserializeStream(
          getExternalRevivers(global, ops)
        );
        ops.push(readable.pipeTo(transform.writable));
        return transform.readable;
      }
    },
    WritableStream: (value) => {
      const serialize = getSerializeStream(getExternalReducers(global, ops));
      ops.push(
        serialize.readable.pipeTo(new WorkflowServerWritableStream(value.name))
      );
      return serialize.writable;
    },
  };
}

/**
 * Revivers for deserialization boundary from within the workflow execution
 * environment, receiving arguments from the client side, and return values
 * from the steps.
 *
 * @param global
 * @returns
 */
export function getWorkflowRevivers(
  global: Record<string, any> = globalThis
): Revivers {
  return {
    ...getCommonRevivers(global),
    Request: (value) => {
      Object.setPrototypeOf(value, global.Request.prototype);
      return value;
    },
    Response: (value) => {
      Object.setPrototypeOf(value, global.Response.prototype);
      return value;
    },
    ReadableStream: (value) => {
      return Object.create(global.ReadableStream.prototype, {
        [STREAM_NAME_SYMBOL]: {
          value: value.name,
          writable: false,
        },
        [STREAM_TYPE_SYMBOL]: {
          value: value.type,
          writable: false,
        },
      });
    },
    WritableStream: (value) => {
      return Object.create(global.WritableStream.prototype, {
        [STREAM_NAME_SYMBOL]: {
          value: value.name,
          writable: false,
        },
      });
    },
  };
}

/**
 * Revivers for deserialization boundary from within the step execution
 * environment, receiving arguments from the workflow handler.
 *
 * @param global
 * @param ops
 * @returns
 */
function getStepRevivers(
  global: Record<string, any> = globalThis,
  ops: Promise<any>[]
): Revivers {
  return {
    ...getCommonRevivers(global),

    Request: (value) => {
      return new global.Request(value.url, {
        method: value.method,
        headers: new global.Headers(value.headers),
        body: value.body,
        duplex: value.duplex,
      });
    },
    Response: (value) => {
      return new global.Response(value.body, {
        type: value.type,
        url: value.url,
        redirected: value.redirected,
        status: value.status,
        statusText: value.statusText,
        headers: new global.Headers(value.headers),
      });
    },
    ReadableStream: (value) => {
      const readable = new WorkflowServerReadableStream(value.name);
      if (value.type === 'bytes') {
        return readable;
      } else {
        const transform = getDeserializeStream(getStepRevivers(global, ops));
        ops.push(readable.pipeTo(transform.writable));
        return transform.readable;
      }
    },
    WritableStream: (value) => {
      const serialize = getSerializeStream(getStepReducers(global, ops));
      ops.push(
        serialize.readable.pipeTo(new WorkflowServerWritableStream(value.name))
      );
      return serialize.writable;
    },
  };
}

/**
 * Called from the `start()` function to serialize the workflow arguments
 * into a format that can be saved to the database and then hydrated from
 * within the workflow execution environment.
 *
 * @param value
 * @param global
 * @returns The dehydrated value, ready to be inserted into the database
 */
export function dehydrateWorkflowArguments(
  value: unknown,
  ops: Promise<any>[],
  global: Record<string, any> = globalThis
) {
  const str = devalue.stringify(value, getExternalReducers(global, ops));
  return revive(str);
}

/**
 * Called from workflow execution environment to hydrate the workflow
 * arguments from the database at the start of workflow execution.
 *
 * @param value
 * @param ops
 * @param global
 * @returns The hydrated value
 */
export function hydrateWorkflowArguments(
  value: Parameters<typeof devalue.unflatten>[0],
  global: Record<string, any> = globalThis,
  extraRevivers: Record<string, (value: any) => any> = {}
) {
  const obj = devalue.unflatten(value, {
    ...getWorkflowRevivers(global),
    ...extraRevivers,
  });
  return obj;
}

/**
 * Called at the end of a completed workflow execution to serialize the
 * return value into a format that can be saved to the database.
 *
 * @param value
 * @param global
 * @returns The dehydrated value, ready to be inserted into the database
 */
export function dehydrateWorkflowReturnValue(
  value: unknown,
  global: Record<string, any> = globalThis
) {
  const str = devalue.stringify(value, getWorkflowReducers(global));
  return revive(str);
}

/**
 * Called from the client side (i.e. the execution environment where
 * the workflow run was initiated from) to hydrate the workflow
 * return value of a completed workflow run.
 *
 * @param value
 * @param global
 * @returns The hydrated return value, ready to be consumed by the client
 */
export function hydrateWorkflowReturnValue(
  value: Parameters<typeof devalue.unflatten>[0],
  ops: Promise<any>[],
  global: Record<string, any> = globalThis,
  extraRevivers: Record<string, (value: any) => any> = {}
) {
  const obj = devalue.unflatten(value, {
    ...getExternalRevivers(global, ops),
    ...extraRevivers,
  });
  return obj;
}

/**
 * Called from the workflow handler when a step is being created.
 * Dehydrates values from within the workflow execution environment
 * into a format that can be saved to the database.
 *
 * @param value
 * @param global
 * @returns The dehydrated value, ready to be inserted into the database
 */
export function dehydrateStepArguments(
  value: unknown,
  global: Record<string, any>
) {
  const str = devalue.stringify(value, getWorkflowReducers(global));
  return revive(str);
}

/**
 * Called from the step handler to hydrate the arguments of a step
 * from the database at the start of the step execution.
 *
 * @param value
 * @param global
 * @returns The hydrated value, ready to be consumed by the step user-code function
 */
export function hydrateStepArguments(
  value: Parameters<typeof devalue.unflatten>[0],
  ops: Promise<any>[],
  global: Record<string, any> = globalThis,
  extraRevivers: Record<string, (value: any) => any> = {}
) {
  const obj = devalue.unflatten(value, {
    ...getStepRevivers(global, ops),
    ...extraRevivers,
  });
  return obj;
}

/**
 * Called from the step handler when a step has completed.
 * Dehydrates values from within the step execution environment
 * into a format that can be saved to the database.
 *
 * @param value
 * @param global
 * @returns The dehydrated value, ready to be inserted into the database
 */
export function dehydrateStepReturnValue(
  value: unknown,
  ops: Promise<any>[],
  global: Record<string, any> = globalThis
) {
  const str = devalue.stringify(value, getStepReducers(global, ops));
  return revive(str);
}

/**
 * Called from the workflow handler when replaying the event log of a `step_completed` event.
 * Hydrates the return value of a step from the database.
 *
 * @param value
 * @param global
 * @returns The hydrated return value of a step, ready to be consumed by the workflow handler
 */
export function hydrateStepReturnValue(
  value: Parameters<typeof devalue.unflatten>[0],
  global: Record<string, any> = globalThis,
  extraRevivers: Record<string, (value: any) => any> = {}
) {
  const obj = devalue.unflatten(value, {
    ...getWorkflowRevivers(global),
    ...extraRevivers,
  });
  return obj;
}
