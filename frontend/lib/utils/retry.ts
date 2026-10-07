import { classifyError, type Phase } from "./errors";

export interface BackoffOptions {
  phase: Phase;
  /** Total attempts including the first one. */
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  /** Called before each wait so the UI can tell the user what is happening. */
  onRetry?: (info: { attempt: number; attempts: number; waitMs: number; reason: string }) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an RPC call with exponential backoff and jitter, but only for failures
 * that are transient (rate limiting, an unreachable RPC). Wallet rejections,
 * wrong networks and contract reverts are never retried.
 */
export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 1500;
  const maxMs = opts.maxMs ?? 12000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const classified = classifyError(err, opts.phase);
      const transient = classified.kind === "rate_limited" || classified.kind === "rpc_unreachable";
      if (!transient || attempt === attempts) throw classified;

      const waitMs = Math.min(maxMs, baseMs * 2 ** (attempt - 1)) + Math.round(Math.random() * 400);
      opts.onRetry?.({ attempt, attempts, waitMs, reason: classified.kind });
      await sleep(waitMs);
    }
  }
  throw classifyError(lastErr, opts.phase);
}

/** Run async work over `items` with at most `limit` in flight, so a page load never bursts the RPC. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}
