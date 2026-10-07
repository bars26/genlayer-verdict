"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCw, Scale, Search } from "lucide-react";
import { useSnapshot } from "@/lib/hooks/useVerdict";
import { CODE_TEXT, formatGen, parseJson, sameAddress, wei, type Agent, type Dispute, type DisputeState, type HistoryEntry } from "@/lib/contracts/types";
import { toErrorInfo } from "@/lib/utils/errors";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { StateBadge, VerdictBadge } from "./Badges";
import { DisputeActions } from "./DisputeActions";
import { AddressDisplay } from "./AddressDisplay";

const STATES: (DisputeState | "any")[] = ["any", "open", "ruled", "settled"];

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
      {children} <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  );
}

export function DisputesTable() {
  const { agents, disputes, failed, fetchedAt, isLoading, isFetching, isError, error, refetch } = useSnapshot();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<DisputeState | "any">("any");
  const nameOf = (addr: string) => agents.find((a) => sameAddress(a.address, addr))?.name || "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...disputes]
      .sort((a, b) => Number(b.id.split("_")[1]) - Number(a.id.split("_")[1]))
      .filter(
        (d) =>
          (state === "any" || d.state === state) &&
          (!q || d.id === q || d.claim.toLowerCase().includes(q) || d.agent.toLowerCase() === q || nameOf(d.agent).toLowerCase().includes(q))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputes, agents, query, state]);

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-accent" /> Loading disputes...
      </div>
    );
  }
  if (isError && disputes.length === 0) {
    const e = toErrorInfo(error);
    return (
      <div className="brand-card p-8 space-y-3 text-center">
        <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
        <p className="text-destructive font-semibold">{e.message}</p>
        {e.hint && <p className="text-sm text-muted-foreground">{e.hint}</p>}
        <Button variant="gradient" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  if (disputes.length === 0) {
    return (
      <div className="brand-card p-12 text-center space-y-3">
        <Scale className="w-14 h-14 mx-auto text-muted-foreground opacity-30" />
        <h3 className="text-xl font-bold">No disputes yet</h3>
        <p className="text-muted-foreground">An agent&apos;s record starts clean. File the first dispute if one broke its terms.</p>
      </div>
    );
  }

  return (
    <div className="brand-card p-6 overflow-hidden">
      {failed.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm">
          <span>{failed.length} record(s) could not be read just now because the Studio RPC was busy.</span>
          <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>Retry</Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search claim, agent name or address, dispute id..." className="pl-9" aria-label="Search disputes" />
        </div>
        <select value={state} onChange={(e) => setState(e.target.value as DisputeState | "any")} aria-label="Filter by state" className="rounded-md border border-input bg-transparent px-3 text-sm">
          {STATES.map((s) => (
            <option key={s} value={s} className="bg-background">{s === "any" ? "Any state" : s}</option>
          ))}
        </select>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{fetchedAt ? `Read from the contract at ${fetchedAt.slice(11, 19)} UTC.` : "Read from the contract."} Your own writes update their row at once.</span>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1 hover:text-accent disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No disputes match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Dispute", "Agent", "Stake", "State", "Verdict"].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((d) => <DisputeRow key={d.id} dispute={d} agentName={nameOf(d.agent)} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DisputeRow({ dispute: d, agentName }: { dispute: Dispute; agentName: string }) {
  const [open, setOpen] = useState(false);
  const history = parseJson<HistoryEntry[]>(d.history_json, []);
  const payout = parseJson<Record<string, string>>(d.payout_json, {});
  return (
    <Fragment>
      <tr className="hover:bg-white/5 transition-colors">
        <td className="px-3 py-4 max-w-[22rem]">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-start gap-2 text-left">
            {open ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>
              <span className="block text-sm font-medium line-clamp-2">{d.claim}</span>
              <span className="block text-xs font-mono text-muted-foreground mt-1">{d.id}</span>
            </span>
          </button>
        </td>
        <td className="px-3 py-4 text-sm">
          <span className="block font-semibold">{agentName || "Unregistered agent"}</span>
          <AddressDisplay address={d.agent} />
        </td>
        <td className="px-3 py-4 text-sm font-mono whitespace-nowrap">
          {formatGen(d.stake)} GEN
          {wei(d.requested) > 0n && <span className="block text-xs text-muted-foreground">asks {formatGen(d.requested)}</span>}
        </td>
        <td className="px-3 py-4"><StateBadge state={d.state} /></td>
        <td className="px-3 py-4"><VerdictBadge verdict={d.verdict} /></td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={5} className="px-3 pb-6 pt-2">
            <div className="ml-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Client&apos;s claim</p>
                  <blockquote className="border-l-2 border-accent/50 pl-3">{d.claim}</blockquote>
                  <p className="mt-1 text-xs">Evidence: <Link href={d.evidence_url}>{d.evidence_url}</Link></p>
                  <p className="mt-1 text-xs text-muted-foreground">Filed by <AddressDisplay address={d.filer} /> · stake {formatGen(d.stake)} GEN · compensation asked {formatGen(d.requested)} GEN</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Agent&apos;s answer</p>
                  {d.responded ? (
                    <>
                      <blockquote className="border-l-2 border-emerald-500/50 pl-3">{d.response}</blockquote>
                      {d.counter_evidence_url && <p className="mt-1 text-xs">Evidence: <Link href={d.counter_evidence_url}>{d.counter_evidence_url}</Link></p>}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No answer {d.state === "open" ? "yet" : "was given"}.</p>
                  )}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Agent terms this dispute is judged against</summary>
                  <p className="mt-1">{d.terms_snapshot || "The agent had not registered terms; validators judge against the promise described in the claim."}</p>
                </details>
                {d.verdict && (
                  <p className="text-xs text-muted-foreground">
                    Ruling: <strong className="text-foreground">{d.verdict}</strong>: {CODE_TEXT[d.code] ?? d.code}.
                    {d.state === "settled" && ` Paid ${formatGen(payout.to_filer)} GEN to the client and ${formatGen(payout.to_agent)} GEN to the agent (compensation ${formatGen(payout.compensation)} GEN).`}
                  </p>
                )}
                <DisputeActions dispute={d} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">On-chain history</p>
                <ol className="space-y-1.5">
                  {[...history].reverse().map((h, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-mono text-muted-foreground">{h.at.replace("T", " ")}</span>{" "}
                      <strong className="capitalize">{h.event}</strong>
                      {typeof h.verdict === "string" && <> · {h.verdict}</>}
                      {typeof h.code === "string" && <> ({h.code})</>}
                      {h.event === "contested" && <> · by {String(h.by)}, {h.changed ? "changed the outcome" : "confirmed"}</>}
                      {h.event === "filed" && <> · stake {formatGen(h.stake as string)} GEN, asks {formatGen(h.requested as string)}</>}
                      {h.event === "settled" && <> · client +{formatGen(h.to_filer as string)}, agent +{formatGen(h.to_agent as string)} GEN</>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export type { Agent };
