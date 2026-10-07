"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useVerdictContract } from "@/lib/hooks/useVerdict";
import { parseGen } from "@/lib/contracts/types";
import { classifyError } from "@/lib/utils/errors";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/** The one call a marketplace or another contract makes before handing an agent money or a task. */
export function TrustCheck() {
  const contract = useVerdictContract();
  const [agent, setAgent] = useState("");
  const [minBond, setMinBond] = useState("5");
  const [maxUpheld, setMaxUpheld] = useState("0");
  const [result, setResult] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const bond = parseGen(minBond);
    if (!contract || bond === null || !/^\d+$/.test(maxUpheld.trim())) return;
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      setResult(await contract.isTrusted(agent.trim(), bond, BigInt(maxUpheld.trim())));
    } catch (e) {
      const c = classifyError(e, "read");
      setErr(c.kind === "rate_limited" || c.kind === "rpc_unreachable" ? `${c.message} ${c.hint ?? ""}` : "That is not a wallet address.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-card p-6 space-y-3">
      <h3 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-accent" /> Integrator check</h3>
      <p className="text-sm text-muted-foreground">
        Reads <code className="text-xs">is_trusted(agent, min_bond, max_upheld)</code>: true if the agent registered terms, has at least that much bond that is
        neither reserved nor being withdrawn, and has no more upheld disputes than allowed.
      </p>
      <form onSubmit={check} className="space-y-2">
        <Input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Agent 0x..." className="font-mono text-sm" aria-label="Agent address" />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="tc-bond" className="text-xs">Min bond (GEN)</Label>
            <Input id="tc-bond" value={minBond} onChange={(e) => setMinBond(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tc-up" className="text-xs">Max upheld</Label>
            <Input id="tc-up" value={maxUpheld} onChange={(e) => setMaxUpheld(e.target.value)} className="font-mono" />
          </div>
        </div>
        <Button type="submit" variant="gradient" className="w-full" disabled={loading || !/^0x[0-9a-fA-F]{40}$/.test(agent.trim())}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check"}
        </Button>
      </form>
      {result !== null && (
        <p className={`text-sm ${result ? "text-emerald-400" : "text-red-400"}`}>
          is_trusted → {String(result)}. {result ? "Safe to hand this agent work under these limits." : "This agent does not meet these limits."}
        </p>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
