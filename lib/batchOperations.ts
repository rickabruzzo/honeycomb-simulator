/**
 * Batch KV Operations
 * Helpers to reduce KV round-trips by batching reads and writes
 */

import { kv } from "@vercel/kv";
import { useKv } from "./kvConfig";

export interface BatchReadResult<T = any> {
  [key: string]: T | null;
}

/**
 * Batch read multiple keys in a single KV operation
 * Returns a map of key -> value (null if not found)
 */
export async function batchRead<T = any>(
  keys: string[]
): Promise<BatchReadResult<T>> {
  if (keys.length === 0) {
    return {};
  }

  if (!useKv()) {
    // In dev/in-memory mode, reads are already fast
    // No need to batch, but maintain same interface
    const result: BatchReadResult<T> = {};
    for (const key of keys) {
      result[key] = null; // In-memory stores handle their own caching
    }
    return result;
  }

  // Use mget for efficient batch read
  const values = await kv.mget<T[]>(...keys);

  const result: BatchReadResult<T> = {};
  keys.forEach((key, index) => {
    result[key] = values[index] ?? null;
  });

  return result;
}

/**
 * Batch write multiple key-value pairs in a single pipeline
 */
export async function batchWrite(
  operations: Array<{ key: string; value: any }>
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  if (!useKv()) {
    // In dev/in-memory mode, individual stores handle writes
    return;
  }

  // Use pipeline for efficient batch write
  const pipeline = kv.pipeline();

  for (const op of operations) {
    pipeline.set(op.key, op.value);
  }

  await pipeline.exec();
}

/**
 * Execute a function with timing and return duration
 */
export async function withTiming<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}
