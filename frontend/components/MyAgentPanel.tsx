"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import { useSnapshot, useVerdictWrite } from "@/lib/hooks/useVerdict";
import { useWallet } from "@/lib/genlayer/wallet";
import { MIN_BOND_WEI, UNBOND_SECONDS, availableBond, formatGen, freeBond, parseGen, sameAddress, secondsSince, wei } from "@/lib/contracts/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const URL_RE = /^https:\/\/[^\s"'<>]{4,290}$/;

/** Register the connected wallet as an agent, post a bond behind its terms, and unbond. */
export function MyAgentPanel() {
  const { address, isConnected } = useWallet();
  const { agents } = useSnapshot();
  const { write, pending } = useVerdictWrite();
  const me = agents.find((a) => sameAddress(a.address, address));
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [bond, setBond] = useState("5");
  const [withdraw, setWithdraw] = useState("");
  const [, tick] = useState(0);

  useEffect(() => {
    if (me?.registered) {
      setName(me.name);
      setTerms(me.terms);
      setEndpoint(me.endpoint);
    }
  }, [me?.registered, me?.name, me?.terms, me?.endpoint]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const btn = (kind: string, label: string, onClick: () => void, disabled = false, variant: "gradient" | "secondary" = "gradient") => (
    <Button size="sm" variant={variant} onClick={onClick} disabled={!!pending || disabled}>
      {pending === kind ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
      {label}
    </Button>
  );

  const termsOk = name.trim().length >= 1 && name.trim().length <= 80 && terms.trim().length >= 20 && terms.trim().length <= 1500 && (!endpoint.trim() || URL_RE.test(endpoint.trim()));
  const bondWei = parseGen(bond);
  const withdrawWei = parseGen(withdraw);
  const unbondLeft = me && wei(me.withdrawal_pending) > 0n ? Math.max(0, UNBOND_SECONDS - secondsSince(me.withdrawal_at)) : 0;

  return (
    <div className="brand-card p-6 space-y-4">
      <h3 className="text-xl font-bold flex items-center gap-2"><Bot className="w-5 h-5 text-accent" /> My agent</h3>
      {!isConnected ? (
        <p className="text-sm text-muted-foreground">Connect the wallet your agent transacts from to register its terms and post a bond.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {me?.registered
              ? "Your terms are on chain. Updating them only affects disputes filed afterwards."
              : "Register what your agent promises. Disputes are judged against these terms, and a bond behind them is what marketplaces check."}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="ma-name">Agent name</Label>
            <Input id="ma-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="TransBot" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ma-terms">Terms of service</Label>
            <textarea id="ma-terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} maxLength={1500} className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" placeholder="What the agent delivers, by when, and what happens if it fails." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ma-endpoint">Endpoint (optional)</Label>
            <Input id="ma-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://..." className="font-mono text-sm" />
          </div>
          {btn("register", me?.registered ? "Update terms" : "Register agent", () => write({ kind: "register", name: name.trim(), terms: terms.trim(), endpoint: endpoint.trim() }), !termsOk)}

          {me?.registered && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border border-border p-2"><div className="font-bold text-accent">{formatGen(me.bond)}</div>bond</div>
                <div className="rounded-md border border-border p-2"><div className="font-bold">{formatGen(me.locked)}</div>reserved</div>
                <div className="rounded-md border border-border p-2"><div className="font-bold">{formatGen(availableBond(me))}</div>available</div>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ma-bond">Add to bond (GEN)</Label>
                  <Input id="ma-bond" value={bond} onChange={(e) => setBond(e.target.value)} className="w-28 font-mono" />
                </div>
                {btn("bond", "Post bond", () => write({ kind: "bond", value: bondWei! }), bondWei === null || bondWei < MIN_BOND_WEI)}
              </div>
              {wei(me.withdrawal_pending) > 0n ? (
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Unbonding {formatGen(me.withdrawal_pending)} GEN.{" "}
                    {unbondLeft > 0 ? `${Math.ceil(unbondLeft / 60)} min of notice left; disputes can still claim it until then.` : "The notice period is over."}
                  </p>
                  {btn("complete_withdrawal", "Withdraw now", () => write({ kind: "complete_withdrawal" }), unbondLeft > 0, "secondary")}
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ma-wd">Unbond (GEN)</Label>
                    <Input id="ma-wd" value={withdraw} onChange={(e) => setWithdraw(e.target.value)} placeholder={formatGen(freeBond(me))} className="w-28 font-mono" />
                  </div>
                  {btn("request_withdrawal", "Start unbonding", () => write({ kind: "request_withdrawal", amount: withdrawWei! }), withdrawWei === null || withdrawWei <= 0n || withdrawWei > freeBond(me), "secondary")}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Unbonding takes {UNBOND_SECONDS / 60} minutes on this demo deployment (days in production); the GEN stays claimable by disputes until then.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
