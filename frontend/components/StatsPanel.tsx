"use client";

import { Scale } from "lucide-react";
import { useSnapshot } from "@/lib/hooks/useVerdict";
import { formatGen, wei } from "@/lib/contracts/types";

export function StatsPanel() {
  const { agents, disputes } = useSnapshot();
  const bonded = agents.reduce((s, a) => s + wei(a.bond), 0n);
  const compensation = agents.reduce((s, a) => s + wei(a.compensation_paid), 0n);
  const count = (v: string) => disputes.filter((d) => d.verdict === v && d.state === "settled").length;
  const cell = (label: string, value: string | number, cls = "") => (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
  return (
    <div className="brand-card p-6 space-y-4">
      <h3 className="text-xl font-bold flex items-center gap-2"><Scale className="w-5 h-5 text-accent" /> Registry</h3>
      <div className="text-3xl font-bold">{formatGen(bonded)} <span className="text-base text-muted-foreground">GEN bonded by {agents.filter((a) => a.registered).length} agent(s)</span></div>
      <div className="grid grid-cols-3 gap-3">
        {cell("Upheld", count("UPHELD"), "text-red-400")}
        {cell("Dismissed", count("DISMISSED"), "text-emerald-400")}
        {cell("No evidence", count("INSUFFICIENT_EVIDENCE"), "text-amber-300")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cell("Open or in contest", disputes.filter((d) => d.state !== "settled").length, "text-sky-300")}
        {cell("Paid to clients", `${formatGen(compensation, 1)} GEN`)}
      </div>
    </div>
  );
}
