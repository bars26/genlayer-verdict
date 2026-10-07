"use client";

import { useState } from "react";
import { ExternalLink, Loader2, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { useSnapshot } from "@/lib/hooks/useVerdict";
import { openDisputeAgainst } from "@/lib/hooks/useDisputeTarget";
import { useWallet } from "@/lib/genlayer/wallet";
import { availableBond, formatGen, sameAddress, wei, type Agent } from "@/lib/contracts/types";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";

/** The registry: each agent's terms, bond and adjudicated record. */
export function AgentsPanel() {
  const { agents, disputes, isLoading } = useSnapshot();
  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-accent" /> Loading agents...
      </div>
    );
  }
  const sorted = [...agents].sort((a, b) => Number(b.registered) - Number(a.registered) || Number(wei(b.bond) - wei(a.bond)));
  if (agents.length === 0) {
    return (
      <div className="brand-card p-8 text-center text-sm text-muted-foreground">
        <UserRound className="w-10 h-10 mx-auto mb-2 opacity-30" />
        No agents yet. Register yours with &quot;My agent&quot;.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sorted.map((a) => (
        <AgentCard key={a.address} agent={a} open={disputes.filter((d) => sameAddress(d.agent, a.address) && d.state !== "settled").length} />
      ))}
    </div>
  );
}

function AgentCard({ agent: a, open }: { agent: Agent; open: number }) {
  const { address } = useWallet();
  const [more, setMore] = useState(false);
  const upheld = Number(wei(a.disputes_upheld));
  const clean = a.registered && upheld === 0;
  const stat = (label: string, value: string | number, cls = "") => (
    <div className="rounded-md border border-border px-2 py-1.5 text-center">
      <div className={`text-sm font-bold ${cls}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div className="brand-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold flex items-center gap-1.5">
            {clean ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className={`w-4 h-4 ${a.registered ? "text-red-400" : "text-muted-foreground"}`} />}
            {a.name || "Unregistered agent"}
          </p>
          <AddressDisplay address={a.address} />
        </div>
        <div className="text-right">
          <p className="text-sm font-mono font-bold text-accent">{formatGen(a.bond)} GEN</p>
          <p className="text-[11px] text-muted-foreground">bond · {formatGen(availableBond(a))} available</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {stat("upheld", upheld, upheld ? "text-red-400" : "")}
        {stat("dismissed", Number(wei(a.disputes_dismissed)), "text-emerald-400")}
        {stat("no evidence", Number(wei(a.disputes_insufficient)), "text-amber-300")}
        {stat("open", open, open ? "text-sky-300" : "")}
      </div>
      {a.registered ? (
        <div className="text-xs">
          <p className={more ? "" : "line-clamp-2"}><span className="text-muted-foreground">Terms: </span>{a.terms}</p>
          <div className="mt-1 flex items-center gap-3">
            <button type="button" className="text-muted-foreground hover:text-accent" onClick={() => setMore((v) => !v)}>{more ? "Less" : "Full terms"}</button>
            {a.endpoint && (
              <a href={a.endpoint} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-muted-foreground hover:text-accent">
                endpoint <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {wei(a.compensation_paid) > 0n && <span className="text-red-300">{formatGen(a.compensation_paid)} GEN paid in compensation</span>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Never registered terms or a bond; it was disputed by address.</p>
      )}
      {!sameAddress(address, a.address) && (
        <Button size="sm" variant="secondary" onClick={() => openDisputeAgainst(a.address)}>File a dispute against this agent</Button>
      )}
    </div>
  );
}
