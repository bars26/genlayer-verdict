"use client";

import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useVerdictContract } from "@/lib/hooks/useVerdict";
import { useTxLog, updateTx, type TxEntry } from "@/lib/hooks/useTxLog";
import { EXPLORER_TX_URL } from "@/lib/utils/errors";
import { Button } from "./ui/button";

const STATE_LABEL: Record<TxEntry["state"], string> = {
  estimating: "Estimating fees",
  awaiting_wallet: "Waiting for wallet",
  confirming: "Waiting for validators",
  accepted: "Done",
  failed: "Failed",
};

const KIND_LABEL: Record<TxEntry["kind"], string> = {
  register: "Register agent",
  bond: "Post bond",
  request_withdrawal: "Request withdrawal",
  complete_withdrawal: "Withdraw bond",
  file: "File dispute",
  respond: "Respond",
  resolve: "Rule",
  contest: "Contest",
  settle: "Settle",
};

function shortHash(h: string) {
  return `${h.slice(0, 10)}...${h.slice(-8)}`;
}

function TxRow({ tx }: { tx: TxEntry }) {
  const contract = useVerdictContract();
  const [checking, setChecking] = useState(false);
  const busy = tx.state === "estimating" || tx.state === "awaiting_wallet" || tx.state === "confirming";

  const checkFinality = async () => {
    if (!contract || !tx.txHash) return;
    setChecking(true);
    try {
      updateTx(tx.id, { status: await contract.getTransactionStatus(tx.txHash) });
    } catch {
      updateTx(tx.id, { progress: "Could not read the status right now (RPC busy). Try again in a moment." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">
          {KIND_LABEL[tx.kind]} <span className="font-mono text-xs text-muted-foreground">{tx.target}</span>
        </span>
        <span
          className={`flex items-center gap-1 text-xs whitespace-nowrap ${
            tx.state === "failed" ? "text-red-400" : tx.state === "accepted" ? "text-green-400" : "text-yellow-300"
          }`}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {tx.state === "failed" && <AlertTriangle className="w-3 h-3" />}
          {tx.state === "accepted" && <CheckCircle2 className="w-3 h-3" />}
          {STATE_LABEL[tx.state]}
        </span>
      </div>

      {tx.progress && !tx.error && <p className="text-xs text-muted-foreground">{tx.progress}</p>}

      {tx.txHash && (
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span title={tx.txHash}>{shortHash(tx.txHash)}</span>
          <button
            type="button"
            aria-label="Copy transaction hash"
            className="hover:text-accent"
            onClick={() => navigator.clipboard?.writeText(tx.txHash!)}
          >
            <Copy className="w-3 h-3" />
          </button>
          <a
            href={EXPLORER_TX_URL(tx.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open transaction in the explorer"
            className="hover:text-accent"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {tx.status && (
        <p className="text-xs">
          Consensus status: <strong>{tx.status}</strong>
          {tx.executionResult && (
            <>
              {" "}
              · contract execution: <strong>{tx.executionResult}</strong>
            </>
          )}
          {tx.status === "ACCEPTED" && (
            <span className="text-muted-foreground"> · reads already reflect it; it finalizes after the appeal window.</span>
          )}
        </p>
      )}

      {tx.txHash && tx.state !== "estimating" && (
        <Button type="button" size="sm" variant="secondary" onClick={checkFinality} disabled={checking}>
          {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Check finality"}
        </Button>
      )}

      {tx.error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 space-y-1 text-xs">
          <p className="font-semibold text-red-400">{tx.error.message}</p>
          {tx.error.hint && <p>{tx.error.hint}</p>}
          <details>
            <summary className="cursor-pointer text-muted-foreground">
              Underlying error ({tx.error.kind}
              {tx.error.phase ? `, during ${tx.error.phase}` : ""})
            </summary>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{tx.error.detail}</pre>
          </details>
        </div>
      )}
    </li>
  );
}

/** Transaction log: hash, consensus status, contract outcome and the exact failure for every write. */
export function TransactionPanel() {
  const entries = useTxLog();

  return (
    <div className="brand-card p-6 space-y-3">
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Your transactions
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Every write shows up here with its hash and status. <strong>ACCEPTED</strong> means validators
          reached consensus on the transaction; the contract outcome (SUCCESS or ERROR) is shown separately because a
          reverted call is still ACCEPTED.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet. Connect a wallet, get test GEN and register an agent or file a dispute.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((tx) => (
            <TxRow key={tx.id} tx={tx} />
          ))}
        </ul>
      )}
    </div>
  );
}
