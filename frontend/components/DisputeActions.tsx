"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useVerdictWrite } from "@/lib/hooks/useVerdict";
import { useWallet } from "@/lib/genlayer/wallet";
import {
  CONTEST_WINDOW_SECONDS,
  RESPONSE_WINDOW_SECONDS,
  formatGen,
  loserOf,
  sameAddress,
  secondsSince,
  wei,
  type Dispute,
} from "@/lib/contracts/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const URL_RE = /^https:\/\/[^\s"'<>]{4,290}$/;

/** What the connected wallet can do with this dispute right now, and why other actions are not offered. */
export function DisputeActions({ dispute }: { dispute: Dispute }) {
  const { address, isConnected } = useWallet();
  const { write, pending } = useVerdictWrite();
  const [response, setResponse] = useState("");
  const [counter, setCounter] = useState("");
  const busy = (kind: string) => pending === `${kind}:${dispute.id}`;

  if (dispute.state === "settled") return null;
  if (!isConnected) return <p className="text-sm text-muted-foreground">Connect a wallet to respond, rule, contest or settle.</p>;

  const isAgent = sameAddress(address, dispute.agent);
  const responseLeft = Math.max(0, RESPONSE_WINDOW_SECONDS - secondsSince(dispute.filed_at));
  const contestLeft = Math.max(0, CONTEST_WINDOW_SECONDS - secondsSince(dispute.ruled_at));
  const btn = (kind: string, label: string, onClick: () => void, variant: "gradient" | "secondary" = "gradient", disabled = false) => (
    <Button size="sm" variant={variant} onClick={onClick} disabled={!!pending || disabled}>
      {busy(kind) ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
      {label}
    </Button>
  );

  if (dispute.state === "open") {
    const canRule = dispute.responded || responseLeft === 0;
    const responseOk = response.trim().length >= 10 && response.trim().length <= 1000 && (!counter.trim() || URL_RE.test(counter.trim()));
    return (
      <div className="space-y-3 max-w-xl">
        {isAgent && !dispute.responded && responseLeft > 0 && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-semibold">Answer this dispute ({Math.ceil(responseLeft / 60)} min left)</p>
            <p className="text-xs text-muted-foreground">Validators read your answer and the page you link next to the client&apos;s evidence. You can answer once.</p>
            <div className="space-y-1.5">
              <Label htmlFor={`resp-${dispute.id}`}>Your response</Label>
              <textarea
                id={`resp-${dispute.id}`}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
                maxLength={1000}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="e.g. The order was delivered 8 hours after payment; the receipt is linked."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`counter-${dispute.id}`}>Your evidence (optional https URL)</Label>
              <Input id={`counter-${dispute.id}`} value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="https://..." className="font-mono text-sm" />
            </div>
            {btn("respond", "Submit response", () => write({ kind: "respond", id: dispute.id, response: response.trim(), counterUrl: counter.trim() }), "gradient", !responseOk)}
          </div>
        )}
        {canRule ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {dispute.responded ? "The agent has answered." : "The agent's response window has passed."} Anyone can now ask validators to rule.
            </p>
            {btn("resolve", "Ask validators to rule", () => write({ kind: "resolve", id: dispute.id }))}
          </div>
        ) : (
          !isAgent && <p className="text-sm text-muted-foreground">Waiting for the agent&apos;s response: {Math.ceil(responseLeft / 60)} min left, then anyone can ask validators to rule.</p>
        )}
      </div>
    );
  }

  // ruled
  const loser = loserOf(dispute);
  const isLoser = sameAddress(address, loser);
  const windowOpen = !dispute.contested && contestLeft > 0;
  const canSettle = !windowOpen || isLoser;
  return (
    <div className="space-y-2">
      {windowOpen && (
        <p className="text-sm text-muted-foreground">
          Contest window: <strong>{Math.ceil(contestLeft / 60)} min</strong> left. The {sameAddress(loser, dispute.agent) ? "agent" : "client"} can stake{" "}
          {formatGen(dispute.stake)} GEN for one independent re-assessment, or settle now to accept the ruling.
        </p>
      )}
      {dispute.contested && <p className="text-sm text-muted-foreground">Contested once ({dispute.contest_changed ? "the re-assessment changed the outcome" : "the re-assessment confirmed it"}). Anyone can settle.</p>}
      <div className="flex flex-wrap gap-2">
        {windowOpen && isLoser && btn("contest", `Contest (${formatGen(dispute.stake)} GEN)`, () => write({ kind: "contest", id: dispute.id, stake: wei(dispute.stake) }), "secondary")}
        {canSettle && btn("settle", windowOpen ? "Accept ruling and settle" : "Settle", () => write({ kind: "settle", id: dispute.id }))}
      </div>
      {!canSettle && <p className="text-xs text-muted-foreground">Only the side the ruling went against can settle before the window closes; anyone can after.</p>}
    </div>
  );
}
