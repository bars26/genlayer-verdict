/** Types and display helpers for the Verdict v2 contract. */

export type VerdictValue = "UPHELD" | "DISMISSED" | "INSUFFICIENT_EVIDENCE" | "";
export type DisputeState = "open" | "ruled" | "settled";
type Wei = string | number | bigint;

export interface Agent {
  address: string;
  registered: boolean;
  name: string;
  terms: string;
  endpoint: string;
  registered_at: string;
  bond: Wei;
  locked: Wei;
  withdrawal_pending: Wei;
  withdrawal_at: string;
  disputes_filed: Wei;
  disputes_upheld: Wei;
  disputes_dismissed: Wei;
  disputes_insufficient: Wei;
  compensation_paid: Wei;
  disputes_json: string;
  history_json: string;
}

export interface Dispute {
  id: string;
  agent: string;
  filer: string;
  claim: string;
  evidence_url: string;
  terms_snapshot: string;
  stake: Wei;
  requested: Wei;
  filed_at: string;
  state: DisputeState;
  responded: boolean;
  response: string;
  counter_evidence_url: string;
  verdict: VerdictValue;
  code: string;
  ruled_at: string;
  contested: boolean;
  contest_by: string;
  contest_stake: Wei;
  contest_changed: boolean;
  payout_json: string;
  history_json: string;
}

export interface HistoryEntry {
  at: string;
  event: string;
  [key: string]: unknown;
}

export interface TransactionReceipt {
  status: string;
  hash: string;
  [key: string]: any;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const RESPONSE_WINDOW_SECONDS = 600;
export const CONTEST_WINDOW_SECONDS = 600;
export const UNBOND_SECONDS = 600;
export const MIN_STAKE_WEI = 5n * 10n ** 17n;
export const MIN_BOND_WEI = 10n ** 17n;

export function wei(v: Wei | undefined): bigint {
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
}

export function formatGen(v: Wei | undefined, digits = 2): string {
  const w = wei(v);
  const whole = w / 10n ** 18n;
  const frac = Number((w % 10n ** 18n) / 10n ** 14n) / 10_000;
  return (Number(whole) + frac).toFixed(digits);
}

export function parseGen(input: string): bigint | null {
  const m = input.trim().match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (!m) return null;
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

export function parseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function secondsSince(iso: string): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 1000;
}

export const freeBond = (a: Agent) => {
  const f = wei(a.bond) - wei(a.locked);
  return f > 0n ? f : 0n;
};

/** Bond that is neither reserved by open disputes nor being withdrawn (what is_trusted checks). */
export const availableBond = (a: Agent) => {
  const f = freeBond(a) - wei(a.withdrawal_pending);
  return f > 0n ? f : 0n;
};

/** The side a ruling goes against; INSUFFICIENT_EVIDENCE counts against the filer. */
export const loserOf = (d: Dispute) => (d.verdict === "UPHELD" ? d.agent : d.filer);

export const VERDICT_STYLE: Record<Exclude<VerdictValue, "">, { label: string; cls: string; help: string }> = {
  UPHELD: {
    label: "Upheld",
    cls: "bg-red-500/15 text-red-300 border-red-500/40",
    help: "The evidence shows the agent broke its terms. The client gets the stake back plus the compensation asked for, paid from the agent's bond.",
  },
  DISMISSED: {
    label: "Dismissed",
    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    help: "The evidence does not show a breach, or the agent showed it kept its promise. The client's stake goes to the agent.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    help: "The evidence could not be read or does not relate to the claim. Nobody is penalised; the stake goes back.",
  },
};

export const STATE_STYLE: Record<DisputeState, string> = {
  open: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  ruled: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  settled: "bg-white/5 text-muted-foreground border-white/10",
};

export const STATE_LABEL: Record<DisputeState, string> = {
  open: "awaiting response",
  ruled: "ruled",
  settled: "settled",
};

export const CODE_TEXT: Record<string, string> = {
  judged: "validators read both sides' evidence and judged it against the agent's terms",
  evidence_unreachable: "the client's evidence page could not be loaded, so the dispute was decided in code",
};
