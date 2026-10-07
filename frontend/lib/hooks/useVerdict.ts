"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Verdict, { type TxProgress, type TxResult } from "../contracts/Verdict";
import { loserOf, sameAddress, type Agent, type Dispute } from "../contracts/types";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { VerdictError, classifyError } from "../utils/errors";
import { mapWithConcurrency } from "../utils/retry";
import { error, success } from "../utils/toast";
import { startTx, updateTx, type TxKind } from "./useTxLog";

export function useVerdictContract(): Verdict | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();
  return useMemo(
    () => (contractAddress ? new Verdict(contractAddress, address, studioUrl) : null),
    [contractAddress, address, studioUrl]
  );
}

type Snapshot = { agents: Agent[]; disputes: Dispute[]; failed: string[]; fetchedAt?: string };

async function fetchJson(url: string, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

/**
 * Every agent and dispute, from the CDN-cached server snapshot (app/api/snapshot), so page
 * loads spend none of the visitor's Studio rate-limit budget. Falls back to slow direct reads.
 */
export function useSnapshot() {
  const contract = useVerdictContract();
  const query = useQuery<Snapshot, Error>({
    queryKey: ["snapshot"],
    queryFn: async () => {
      try {
        const body = await fetchJson("/api/snapshot");
        if (!Array.isArray(body.agents) || !Array.isArray(body.disputes)) throw new Error("Malformed snapshot");
        return body as Snapshot;
      } catch (snapshotErr) {
        if (!contract) throw classifyError(snapshotErr, "read");
        const [agentIds, disputeIds] = await Promise.all([contract.listAgents(), contract.listDisputes()]);
        const failed: string[] = [];
        const agents = await mapWithConcurrency(agentIds, 2, (a) => contract.getAgent(a).catch(() => (failed.push(a), null)));
        const disputes = await mapWithConcurrency(disputeIds, 2, (d) => contract.getDispute(d).catch(() => (failed.push(d), null)));
        return {
          agents: agents.filter(Boolean) as Agent[],
          disputes: disputes.filter(Boolean) as Dispute[],
          failed,
          fetchedAt: new Date().toISOString(),
        };
      }
    },
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  return {
    agents: query.data?.agents ?? [],
    disputes: query.data?.disputes ?? [],
    failed: query.data?.failed ?? [],
    fetchedAt: query.data?.fetchedAt,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Re-read the agent and/or dispute a write touched and merge them into the cached snapshot. */
async function mergeFresh(qc: ReturnType<typeof useQueryClient>, contract: Verdict, agent?: string, disputeId?: string) {
  try {
    const [a, d] = await Promise.all([
      agent ? contract.getAgent(agent) : Promise.resolve(null),
      disputeId ? contract.getDispute(disputeId) : Promise.resolve(null),
    ]);
    qc.setQueryData<Snapshot>(["snapshot"], (prev) => {
      const agents = [...(prev?.agents ?? [])];
      const disputes = [...(prev?.disputes ?? [])];
      if (a) {
        const i = agents.findIndex((x) => sameAddress(x.address, a.address));
        if (i >= 0) agents[i] = a;
        else agents.push(a);
      }
      if (d) {
        const i = disputes.findIndex((x) => x.id === d.id);
        if (i >= 0) disputes[i] = d;
        else disputes.push(d);
      }
      return { agents, disputes, failed: prev?.failed ?? [], fetchedAt: prev?.fetchedAt };
    });
  } catch {
    // Already confirmed on chain; the next snapshot refresh picks it up.
  }
}

export type WriteVars =
  | { kind: "register"; name: string; terms: string; endpoint: string }
  | { kind: "bond"; value: bigint }
  | { kind: "request_withdrawal"; amount: bigint }
  | { kind: "complete_withdrawal" }
  | { kind: "file"; agent: string; claim: string; evidenceUrl: string; requested: bigint; stake: bigint }
  | { kind: "respond"; id: string; response: string; counterUrl: string }
  | { kind: "resolve"; id: string }
  | { kind: "contest"; id: string; stake: bigint }
  | { kind: "settle"; id: string };

export const WRITE_LABEL: Record<WriteVars["kind"], string> = {
  register: "Register agent",
  bond: "Post bond",
  request_withdrawal: "Request withdrawal",
  complete_withdrawal: "Withdraw bond",
  file: "File dispute",
  respond: "Respond",
  resolve: "Ask validators to rule",
  contest: "Contest",
  settle: "Settle",
};

const VERDICT_TEXT: Record<string, string> = {
  UPHELD: "Validators upheld the dispute: the evidence shows a breach of the agent's terms.",
  DISMISSED: "Validators dismissed the dispute: the evidence does not show a breach.",
  INSUFFICIENT_EVIDENCE: "Validators found the evidence insufficient; nobody is penalised.",
};

const gen = (v: unknown) => (Number(String(v ?? "0")) / 1e18).toFixed(2);

/** One mutation for every Verdict write, with a transaction-log entry and typed errors. */
export function useVerdictWrite() {
  const contract = useVerdictContract();
  const { address } = useWallet();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (vars: WriteVars) => {
      const id = "id" in vars ? vars.id : "";
      const target = id || ("agent" in vars ? vars.agent : address ?? "");
      const logId = startTx(vars.kind as TxKind, target);
      setPending(id ? `${vars.kind}:${id}` : vars.kind);
      const onProgress = (p: TxProgress) =>
        updateTx(logId, {
          state: p.step === "awaiting_wallet" ? "awaiting_wallet" : p.step === "accepted" ? "accepted" : "confirming",
          txHash: p.txHash,
          progress: p.message,
        });
      let agentTouched: string | undefined;
      let disputeTouched: string | undefined = id || undefined;
      try {
        if (!contract) throw new VerdictError({ kind: "unknown", phase: "send", message: "The contract address is not configured." });
        if (!address) throw new VerdictError({ kind: "wallet_missing", phase: "send", message: "No wallet is connected." });
        const refuse = (message: string): never => {
          throw new VerdictError({ kind: "contract_revert", phase: "estimate", message, hint: "The data was refreshed; nothing was sent." });
        };
        // Re-read right before sending so a stale page never sends a call the contract would refuse.
        const fresh = id ? await contract.getDispute(id) : null;

        let result: TxResult;
        let note = "Done.";
        switch (vars.kind) {
          case "register":
            agentTouched = address;
            result = await contract.registerAgent(vars.name, vars.terms, vars.endpoint, onProgress);
            note = "Agent registered; its terms are now on chain.";
            break;
          case "bond":
            agentTouched = address;
            result = await contract.postBond(vars.value, onProgress);
            break;
          case "request_withdrawal":
            agentTouched = address;
            result = await contract.requestWithdrawal(vars.amount, onProgress);
            note = "Unbonding started; the GEN stays claimable by disputes until the notice period ends.";
            break;
          case "complete_withdrawal":
            agentTouched = address;
            result = await contract.completeWithdrawal(onProgress);
            note = `Withdrew ${gen(result.returned)} GEN.`;
            break;
          case "file": {
            agentTouched = vars.agent;
            const before = await contract.listDisputes();
            result = await contract.fileDispute(vars.agent, vars.claim, vars.evidenceUrl, vars.requested, vars.stake, onProgress);
            disputeTouched = typeof result.returned === "string" && result.returned.startsWith("dispute_") ? result.returned : undefined;
            note = disputeTouched ? `Dispute ${disputeTouched} filed.` : `Dispute filed (${before.length} before).`;
            break;
          }
          case "respond":
            if (fresh!.state !== "open" || fresh!.responded) refuse("This dispute can no longer be answered.");
            agentTouched = fresh!.agent;
            result = await contract.respond(vars.id, vars.response, vars.counterUrl, onProgress);
            break;
          case "resolve":
            if (fresh!.state !== "open") refuse("This dispute has already been ruled.");
            agentTouched = fresh!.agent;
            result = await contract.resolve(vars.id, onProgress);
            note = VERDICT_TEXT[String(result.returned)] ?? "Ruled.";
            break;
          case "contest":
            if (fresh!.state !== "ruled" || fresh!.contested) refuse("This ruling can no longer be contested.");
            if (!sameAddress(loserOf(fresh!), address)) refuse("Only the side the ruling went against can contest it.");
            agentTouched = fresh!.agent;
            result = await contract.contest(vars.id, vars.stake, onProgress);
            note = `Re-assessed: ${String(result.returned)}.`;
            break;
          case "settle": {
            if (fresh!.state !== "ruled") refuse("This dispute is not waiting for settlement.");
            agentTouched = fresh!.agent;
            result = await contract.settle(vars.id, onProgress);
            const p = (result.returned ?? {}) as Record<string, unknown>;
            note = `Paid ${gen(p.to_filer)} GEN to the client and ${gen(p.to_agent)} GEN to the agent.`;
            break;
          }
        }
        updateTx(logId, {
          state: "accepted",
          txHash: result.txHash,
          status: result.status,
          executionResult: result.executionResult,
          siteId: disputeTouched,
          progress: note,
        });
        return { txHash: result.txHash, kind: vars.kind, note, agentTouched, disputeTouched };
      } catch (err) {
        const e = classifyError(err, "send");
        if (contract) mergeFresh(qc, contract, agentTouched, disputeTouched);
        updateTx(logId, {
          state: "failed",
          txHash: e.txHash,
          error: { kind: e.kind, message: e.message, hint: e.hint, detail: e.detail, phase: e.phase },
        });
        error(`${WRITE_LABEL[vars.kind]} failed`, { description: [e.message, e.hint].filter(Boolean).join(" "), duration: 12000 });
        throw err;
      } finally {
        setPending(null);
      }
    },
    onSuccess: ({ txHash, kind, note, agentTouched, disputeTouched }) => {
      if (contract) mergeFresh(qc, contract, agentTouched, disputeTouched);
      qc.invalidateQueries({ queryKey: ["genBalance"] });
      success(`${WRITE_LABEL[kind]} confirmed`, {
        description: `${note} Tx ${txHash.slice(0, 10)}... is ACCEPTED by validator consensus.`,
        duration: 8000,
      });
    },
  });

  return { write: mutation.mutate, writeAsync: mutation.mutateAsync, pending, isPending: mutation.isPending };
}
