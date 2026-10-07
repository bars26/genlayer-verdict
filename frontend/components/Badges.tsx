import { STATE_LABEL, STATE_STYLE, VERDICT_STYLE, type DisputeState, type VerdictValue } from "@/lib/contracts/types";

export function VerdictBadge({ verdict }: { verdict: VerdictValue }) {
  if (!verdict) return <span className="text-xs text-muted-foreground">-</span>;
  const v = VERDICT_STYLE[verdict];
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${v.cls}`} title={v.help}>
      {v.label}
    </span>
  );
}

export function StateBadge({ state }: { state: DisputeState }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATE_STYLE[state]}`}>
      {STATE_LABEL[state]}
    </span>
  );
}
