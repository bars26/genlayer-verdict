"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { Gavel, Loader2 } from "lucide-react";
import { useSnapshot, useVerdictWrite } from "@/lib/hooks/useVerdict";
import { useDisputeTarget } from "@/lib/hooks/useDisputeTarget";
import { useWallet } from "@/lib/genlayer/wallet";
import { MIN_STAKE_WEI, formatGen, freeBond, parseGen, sameAddress } from "@/lib/contracts/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const URL_RE = /^https:\/\/[^\s"'<>]{4,290}$/;
const EMPTY = { agent: "", claim: "", evidence: "", requested: "0", stake: "0.5" };

export function FileDisputeModal() {
  const { isConnected, address } = useWallet();
  const { agents } = useSnapshot();
  const { writeAsync, pending } = useVerdictWrite();
  const target = useDisputeTarget();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});
  const busy = pending === "file";

  useEffect(() => {
    if (target) {
      setForm((f) => ({ ...f, agent: target.agent }));
      setOpen(true);
    }
  }, [target]);
  useEffect(() => {
    if (!isConnected && open && !busy) setOpen(false);
  }, [isConnected, open, busy]);

  const agent = agents.find((a) => sameAddress(a.address, form.agent.trim()));
  const maxComp = agent?.registered ? freeBond(agent) : 0n;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors({ ...errors, [k]: "" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const stake = parseGen(form.stake);
    const requested = parseGen(form.requested || "0");
    if (!isAddress(form.agent.trim())) next.agent = "Paste the agent's wallet address (0x...)";
    else if (sameAddress(form.agent.trim(), address)) next.agent = "You cannot file a dispute against yourself";
    if (form.claim.trim().length < 20 || form.claim.trim().length > 1000) next.claim = "Describe what was promised and what happened (20 to 1000 characters)";
    if (!URL_RE.test(form.evidence.trim())) next.evidence = "A public https page validators can read";
    if (stake === null || stake < MIN_STAKE_WEI) next.stake = "At least 0.5 GEN";
    if (requested === null) next.requested = "A GEN amount, or 0";
    else if (requested > 0n && !agent?.registered) next.requested = "Compensation can only come from a registered, bonded agent";
    else if (requested > maxComp) next.requested = `At most ${formatGen(maxComp)} GEN (the agent's unreserved bond)`;
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await writeAsync({ kind: "file", agent: form.agent.trim(), claim: form.claim.trim(), evidenceUrl: form.evidence.trim(), requested: requested!, stake: stake! });
      setForm(EMPTY);
      setOpen(false);
    } catch {
      // The error toast and the transaction panel already explain what happened.
    }
  };

  const err = (k: keyof typeof EMPTY, hint?: string) =>
    errors[k] ? <p className="text-xs text-destructive">{errors[k]}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="gradient" disabled={!isConnected} aria-label="File a dispute" title="File a dispute">
          <Gavel className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">File a dispute</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">File a dispute against an agent</DialogTitle>
          <DialogDescription>
            Stake GEN behind your claim and link public evidence. The agent can answer with its own evidence; then validators read both
            sides and rule. If they uphold it you get your stake back plus the compensation you asked for, paid from the agent&apos;s bond.
            If they dismiss it, your stake goes to the agent.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="fd-agent">Agent wallet</Label>
            <Input id="fd-agent" value={form.agent} onChange={set("agent")} placeholder="0x..." className={`font-mono text-sm ${errors.agent ? "border-destructive" : ""}`} list="fd-agents" />
            <datalist id="fd-agents">
              {agents.filter((a) => a.registered).map((a) => <option key={a.address} value={a.address}>{a.name}</option>)}
            </datalist>
            {err("agent", agent ? (agent.registered ? `${agent.name}: ${formatGen(agent.bond)} GEN bond, terms registered.` : "Not registered: judged against the promise in your claim, no compensation.") : undefined)}
          </div>
          {agent?.registered && (
            <details className="text-xs rounded-md border border-border p-2" open>
              <summary className="cursor-pointer text-muted-foreground">Terms this dispute will be judged against</summary>
              <p className="mt-1">{agent.terms}</p>
            </details>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fd-claim">What did the agent promise, and what happened?</Label>
            <textarea id="fd-claim" value={form.claim} onChange={set("claim")} rows={3} maxLength={1000} className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm ${errors.claim ? "border-destructive" : "border-input"}`} placeholder="e.g. TransBot took payment for order 1001 and delivered nothing within the promised 24 hours." />
            {err("claim")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-evidence">Evidence page</Label>
            <Input id="fd-evidence" value={form.evidence} onChange={set("evidence")} placeholder="https://..." className={`font-mono text-sm ${errors.evidence ? "border-destructive" : ""}`} />
            {err("evidence", "Every validator opens this page itself. If it cannot be loaded, the ruling is Insufficient evidence and your stake comes back.")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fd-stake">Your stake (GEN)</Label>
              <Input id="fd-stake" value={form.stake} onChange={set("stake")} className={`font-mono ${errors.stake ? "border-destructive" : ""}`} />
              {err("stake", "At least 0.5 GEN.")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-req">Compensation asked (GEN)</Label>
              <Input id="fd-req" value={form.requested} onChange={set("requested")} className={`font-mono ${errors.requested ? "border-destructive" : ""}`} />
              {err("requested", agent?.registered ? `Up to ${formatGen(maxComp)} GEN, reserved from the bond until settled.` : "0 for unregistered agents.")}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="gradient" className="flex-1" disabled={busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Filing...</> : "File dispute"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
