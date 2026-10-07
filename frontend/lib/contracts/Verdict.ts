import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Agent, Dispute, TransactionReceipt } from "./types";
import { VerdictError, classifyError, rawMessage } from "../utils/errors";
import { withBackoff } from "../utils/retry";

export type TxStep = "awaiting_wallet" | "submitted" | "retrying" | "accepted";

export interface TxProgress {
  step: TxStep;
  txHash?: string;
  message?: string;
}

export interface TxResult {
  txHash: string;
  status: string;
  executionResult: string;
  receipt: TransactionReceipt;
  /** The contract method's return value (dispute id, verdict, payout, ...). */
  returned?: unknown;
}

/**
 * Pull the contract-execution outcome out of a consensus receipt.
 *   result.status "rollback" -> the contract raised; payload is its message.
 *   result.status "return"   -> payload.readable is the JSON-encoded return value.
 */
export function executionOutcome(receipt: any): { result: string; message: string; returned: unknown } {
  const lr = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(lr) ? lr[0] : lr;
  const result = String(first?.execution_result ?? receipt?.execution_result ?? "UNKNOWN");
  const r = first?.result ?? {};
  let returned: unknown = undefined;
  if (r?.status === "return") {
    const readable = r?.payload?.readable;
    try {
      returned = typeof readable === "string" ? JSON.parse(readable) : readable;
    } catch {
      returned = readable;
    }
  }
  const g = first?.genvm_result ?? {};
  const message = [
    r?.status === "rollback" && typeof r?.payload === "string" ? r.payload : "",
    g.error_description,
    g.stderr,
    Array.isArray(g.raw_error?.causes) ? g.raw_error.causes.join(",") : "",
  ]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(" | ");
  return { result, message, returned };
}

const WRITE_EFFECT: Record<string, string> = {
  register_agent: "the agent was not registered",
  post_bond: "the bond did not change",
  request_withdrawal: "no withdrawal was requested",
  complete_withdrawal: "nothing was withdrawn",
  file_dispute: "no dispute was filed",
  respond: "the response was not recorded",
  resolve: "no ruling was recorded (validators may have failed to load the evidence or to agree)",
  contest: "the contest was not recorded",
  settle: "nothing was paid out",
};

/** Typed wrapper around the Verdict v2 Intelligent Contract. */
class Verdict {
  private contractAddress: `0x${string}`;
  private client: any;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    const config: any = { chain: studionet };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;
    this.client = createClient(config);
  }

  private read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    return withBackoff(
      () => this.client.readContract({ address: this.contractAddress, functionName, args }) as Promise<T>,
      { phase: "read", attempts: 5 }
    );
  }

  listAgents = () => this.read<string[]>("list_agents").then((v) => (Array.isArray(v) ? v : []));
  listDisputes = () => this.read<string[]>("list_disputes").then((v) => (Array.isArray(v) ? v : []));
  getAgent = (address: string) => this.read<Agent>("get_agent", [address]);
  getDispute = (id: string) => this.read<Dispute>("get_dispute", [id]);
  trustSummary = (address: string) => this.read<Record<string, unknown>>("trust_summary", [address]);
  isTrusted = async (address: string, minBond: bigint, maxUpheld: bigint) =>
    Boolean(await this.read<boolean>("is_trusted", [address, minBond, maxUpheld]));

  async getTransactionStatus(txHash: string): Promise<string> {
    const tx: any = await withBackoff(() => this.client.getTransaction({ hash: txHash as `0x${string}` }), {
      phase: "read",
    });
    return String(tx?.statusName ?? tx?.status_name ?? tx?.status ?? "UNKNOWN");
  }

  registerAgent(name: string, terms: string, endpoint: string, onProgress?: (p: TxProgress) => void) {
    return this.write("register_agent", [name, terms, endpoint], 0n, onProgress);
  }
  postBond(valueWei: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("post_bond", [], valueWei, onProgress);
  }
  requestWithdrawal(amountWei: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("request_withdrawal", [amountWei], 0n, onProgress);
  }
  completeWithdrawal(onProgress?: (p: TxProgress) => void) {
    return this.write("complete_withdrawal", [], 0n, onProgress);
  }
  fileDispute(agent: string, claim: string, evidenceUrl: string, requested: bigint, stake: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("file_dispute", [agent, claim, evidenceUrl, requested], stake, onProgress);
  }
  respond(id: string, response: string, counterUrl: string, onProgress?: (p: TxProgress) => void) {
    return this.write("respond", [id, response, counterUrl], 0n, onProgress);
  }
  resolve(id: string, onProgress?: (p: TxProgress) => void) {
    return this.write("resolve", [id], 0n, onProgress);
  }
  contest(id: string, stake: bigint, onProgress?: (p: TxProgress) => void) {
    return this.write("contest", [id], stake, onProgress);
  }
  settle(id: string, onProgress?: (p: TxProgress) => void) {
    return this.write("settle", [id], 0n, onProgress);
  }

  /**
   * Send a write and wait for consensus. Sends are never auto-retried (each attempt would
   * prompt the wallet again); receipt polling is, because the hash is already known.
   * A call the contract reverted is still ACCEPTED by consensus, so the receipt's
   * execution_result is checked and a revert is reported as such.
   */
  private async write(
    functionName: string,
    args: unknown[],
    value: bigint,
    onProgress?: (p: TxProgress) => void
  ): Promise<TxResult> {
    onProgress?.({ step: "awaiting_wallet", message: "Approve the transaction in your wallet." });
    let txHash: string;
    try {
      txHash = (await this.client.writeContract({ address: this.contractAddress, functionName, args, value })) as string;
    } catch (err) {
      throw classifyError(err, "send");
    }
    onProgress?.({ step: "submitted", txHash, message: "Transaction sent. Waiting for validators." });

    let receipt: any;
    try {
      receipt = await withBackoff(
        () => this.client.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED" as any, retries: 60, interval: 5000 }),
        {
          phase: "confirm",
          onRetry: (i) =>
            onProgress?.({ step: "retrying", txHash, message: `RPC busy while confirming; retrying in ${Math.round(i.waitMs / 1000)}s` }),
        }
      );
    } catch (err) {
      throw classifyError(err, "confirm", txHash);
    }

    const status = String(receipt?.statusName ?? receipt?.status_name ?? "ACCEPTED");
    const outcome = executionOutcome(receipt);
    onProgress?.({ step: "accepted", txHash, message: `Consensus status: ${status}` });
    // Payable methods refuse by refunding and returning "REFUNDED: <reason>" instead of reverting,
    // because GenLayer keeps a reverted call's value in the contract.
    if (typeof outcome.returned === "string" && outcome.returned.startsWith("REFUNDED:")) {
      throw new VerdictError({
        kind: "contract_revert",
        phase: "verify",
        txHash,
        message: `The contract refused this call and is sending your GEN back: ${outcome.returned.slice(9).trim()}`,
        hint: "Nothing changed on the contract. The refund lands in your wallet once the transaction finalizes.",
        detail: String(outcome.returned),
      });
    }
    if (outcome.result === "ERROR") {
      throw new VerdictError({
        kind: "accepted_no_effect",
        phase: "verify",
        txHash,
        message: `The transaction was ACCEPTED, but the contract rejected the call, so ${WRITE_EFFECT[functionName] ?? "nothing changed"}.`,
        hint: outcome.message ? `Contract message: ${outcome.message}` : "Open the transaction in the explorer for details.",
        detail: outcome.message || rawMessage(receipt?.result) || "execution_result: ERROR",
      });
    }
    return { txHash, status, executionResult: outcome.result, receipt, returned: outcome.returned };
  }
}

export default Verdict;
