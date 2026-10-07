/**
 * Typed, user-readable errors for the Verdict frontend.
 *
 * Every failure keeps the underlying error (`cause`, `detail`) so nothing is
 * collapsed into a generic "transaction failed".
 */

export type ErrorKind =
  | "wallet_missing"
  | "wallet_rejected"
  | "wrong_network"
  | "insufficient_funds"
  | "rate_limited"
  | "rpc_unreachable"
  | "fee_estimation"
  | "contract_revert"
  | "accepted_no_effect"
  | "timeout"
  | "unknown";

export type Phase = "read" | "estimate" | "send" | "confirm" | "verify";

export interface ErrorInfo {
  kind: ErrorKind;
  title: string;
  message: string;
  hint?: string;
}

export class VerdictError extends Error {
  kind: ErrorKind;
  phase: Phase;
  txHash?: string;
  /** The raw underlying message, preserved verbatim. */
  detail: string;
  hint?: string;
  cause?: unknown;

  constructor(init: {
    kind: ErrorKind;
    phase: Phase;
    message: string;
    detail?: string;
    hint?: string;
    txHash?: string;
    cause?: unknown;
  }) {
    super(init.message);
    this.name = "VerdictError";
    this.kind = init.kind;
    this.phase = init.phase;
    this.detail = init.detail ?? init.message;
    this.hint = init.hint;
    this.txHash = init.txHash;
    this.cause = init.cause;
  }
}

/** Best-effort text of any thrown value, including viem's nested shortMessage/details/cause. */
export function rawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  const e = err as any;
  const parts = [e.shortMessage, e.details, e.message, e.cause?.message, e.data?.message, e.error?.message]
    .filter((p) => typeof p === "string" && p.length > 0);
  return [...new Set(parts)].join(" | ") || String(err);
}

const INSUFFICIENT = /insufficient (funds|balance)|exceeds (the )?balance|not enough (funds|balance)|gas \* price \+ value/i;
const RATE_LIMIT = /rate.?limit|too many requests|\b429\b|-32005|0xf22f/i;
const USER_REJECTED = /user (rejected|denied)|rejected the request|request rejected|\b4001\b|action_rejected/i;
const NO_WALLET = /no ethereum provider|wallet not connected|connect your wallet|window\.ethereum/i;
const WRONG_NETWORK = /chain (mismatch|id)|wrong network|unrecognized chain|\b4902\b|switch.*(chain|network)/i;
const UNREACHABLE = /failed to fetch|networkerror|network request failed|fetch failed|econnrefused|enotfound|unexpected token '<'|is not valid json|\b50[234]\b|bad gateway|service unavailable/i;
const TIMEOUT = /timed? ?out|timeout|retries|not (?:been )?(?:found|mined)|took too long/i;
const REVERT = /revert|usererror|could not load the page|execution.*error|simulation/i;

export function classifyError(err: unknown, phase: Phase, txHash?: string): VerdictError {
  if (err instanceof VerdictError) return err;

  const detail = rawMessage(err);
  const code = (err as any)?.code;
  const base = { phase, detail, txHash, cause: err };

  if (code === 4001 || USER_REJECTED.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "wallet_rejected",
      message: "You rejected the request in your wallet.",
      hint: "Nothing was sent. Click again and approve the prompt to continue.",
    });
  }
  if (NO_WALLET.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "wallet_missing",
      message: "No wallet is connected.",
      hint: "Connect MetaMask (top right) before registering an agent or filing a dispute.",
    });
  }
  if (INSUFFICIENT.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "insufficient_funds",
      message: "Your wallet does not have enough GEN for this transaction.",
      hint: "Click \"Test GEN\" in the header to get 50 GEN from the GenLayer Studio faucet, then try again.",
    });
  }
  if (code === -32005 || code === 429 || RATE_LIMIT.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "rate_limited",
      message: "The GenLayer Studio RPC is rate limiting requests from your IP.",
      hint:
        "Studio allows about 30 contract calls and transactions per minute per IP (reads retry automatically). " +
        "Nothing was sent; wait up to a minute and try again.",
    });
  }
  if (code === 4902 || WRONG_NETWORK.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "wrong_network",
      message: "Your wallet is not on the GenLayer Studio network.",
      hint: "Switch MetaMask to GenLayer Studio (chain id 61999) and try again.",
    });
  }
  if (UNREACHABLE.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "rpc_unreachable",
      message: "Could not reach the GenLayer Studio RPC (it returned an error page or no response).",
      hint: "The endpoint may be restarting. Try again in a minute; nothing was written.",
    });
  }
  if (phase === "estimate") {
    // The fee estimate simulates the call, so a contract revert shows up here first.
    const reverted = REVERT.test(detail);
    return new VerdictError({
      ...base,
      kind: reverted ? "contract_revert" : "fee_estimation",
      message: reverted
        ? "The dry-run of this call was rejected by the contract, so no transaction was sent."
        : "Fee estimation failed before anything was sent.",
      hint: reverted
        ? "The contract would reject this call as sent; check the inputs and the dispute's current state."
        : "Try again; if it persists the Studio node may be busy.",
    });
  }
  if (phase === "confirm" && TIMEOUT.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "timeout",
      message: "The transaction was sent but validators did not reach consensus in time.",
      hint: txHash
        ? "It may still complete. Check the transaction hash below, then refresh the list."
        : "It may still complete. Refresh the list in a minute.",
    });
  }
  if (REVERT.test(detail)) {
    return new VerdictError({
      ...base,
      kind: "contract_revert",
      message: "The contract rejected this call.",
      hint: "See the underlying error below.",
    });
  }
  return new VerdictError({
    ...base,
    kind: "unknown",
    message: `Unexpected error while ${describePhase(phase)}.`,
    hint: "See the underlying error below; it is preserved exactly as returned.",
  });
}

export function describePhase(phase: Phase): string {
  switch (phase) {
    case "read":
      return "reading from the contract";
    case "estimate":
      return "estimating fees";
    case "send":
      return "sending the transaction";
    case "confirm":
      return "waiting for validator consensus";
    case "verify":
      return "verifying the result";
  }
}

export function toErrorInfo(err: unknown): ErrorInfo & { detail: string; txHash?: string; phase?: Phase } {
  const e = err instanceof VerdictError ? err : classifyError(err, "read");
  return {
    kind: e.kind,
    title: e.message,
    message: e.message,
    hint: e.hint,
    detail: e.detail,
    txHash: e.txHash,
    phase: e.phase,
  };
}

export const EXPLORER_TX_URL = (hash: string) => `https://explorer-studio.genlayer.com/tx/${hash}`;
