import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Dispute, AgentRecord, TransactionReceipt } from "./types";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
  type FeePresetEstimate,
  type FeePresetLevel,
} from "../genlayer/fees";

const ZERO_AGENT_RECORD = (address: string): AgentRecord => ({
  address,
  disputes_filed: 0,
  disputes_upheld: 0,
  disputes_dismissed: 0,
});

/**
 * Verdict contract class for interacting with the GenLayer Verdict contract —
 * an on-chain trust registry for AI agents, adjudicated from real evidence
 * instead of self-reported scores.
 */
class Verdict {
  private contractAddress: `0x${string}`;
  private client: any;
  private studioUrl?: string;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.studioUrl = studioUrl;

    const config: any = { chain: studionet };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;

    this.client = createClient(config);
  }

  updateAccount(address: string): void {
    const config: any = { chain: studionet, account: address as `0x${string}` };
    if (this.studioUrl) config.endpoint = this.studioUrl;
    this.client = createClient(config);
  }

  async estimateFileDisputeFees(
    agent: string,
    claim: string,
    evidenceUrl: string,
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "file_dispute",
        args: [agent, claim, evidenceUrl],
      },
      level
    );
  }

  async estimateResolveDisputeFees(
    disputeId: string,
    level: FeePresetLevel = "standard"
  ): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      {
        address: this.contractAddress,
        functionName: "resolve_dispute",
        args: [disputeId],
      },
      level
    );
  }

  /** Get every dispute currently awaiting resolution. */
  async listPendingDisputes(): Promise<Dispute[]> {
    try {
      const disputes: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "list_pending_disputes",
        args: [],
      });
      return Array.isArray(disputes) ? (disputes as Dispute[]) : [];
    } catch (err) {
      console.error("Error fetching pending disputes:", err);
      throw new Error("Failed to fetch pending disputes from contract");
    }
  }

  /** Get every dispute ever filed against a given agent address. */
  async listDisputesByAgent(agent: string): Promise<Dispute[]> {
    try {
      const disputes: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "list_disputes_by_agent",
        args: [agent],
      });
      return Array.isArray(disputes) ? (disputes as Dispute[]) : [];
    } catch (err) {
      console.error("Error fetching disputes for agent:", err);
      throw new Error("Failed to fetch disputes for this agent");
    }
  }

  /** Get a single dispute by id. */
  async getDispute(disputeId: string): Promise<Dispute> {
    const dispute = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_dispute",
      args: [disputeId],
    });
    return dispute as Dispute;
  }

  /** Get an agent's trust record — zero counts if it has no history. */
  async getAgentRecord(agent: string): Promise<AgentRecord> {
    if (!agent) return ZERO_AGENT_RECORD(agent);
    try {
      const record: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_agent_record",
        args: [agent],
      });
      return {
        address: record.address,
        disputes_filed: Number(record.disputes_filed) || 0,
        disputes_upheld: Number(record.disputes_upheld) || 0,
        disputes_dismissed: Number(record.disputes_dismissed) || 0,
      };
    } catch (err) {
      console.error("Error fetching agent record:", err);
      return ZERO_AGENT_RECORD(agent);
    }
  }

  /**
   * File a dispute against an agent: "this agent promised X, delivered Y" —
   * plus a link to evidence validators can independently check.
   */
  async fileDispute(
    agent: string,
    claim: string,
    evidenceUrl: string,
    feePreset?: FeePresetEstimate
  ): Promise<TransactionReceipt> {
    try {
      const fees = feePresetToTransactionFees(feePreset);
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "file_dispute",
        args: [agent, claim, evidenceUrl],
        value: BigInt(0),
        ...(fees ? { fees } : {}),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (err) {
      console.error("Error filing dispute:", err);
      throw new Error("Failed to file dispute");
    }
  }

  /** Resolve a pending dispute: validators fetch the evidence and vote. */
  async resolveDispute(disputeId: string): Promise<TransactionReceipt> {
    try {
      const feePreset = await this.estimateResolveDisputeFees(disputeId);
      const fees = feePresetToTransactionFees(feePreset);
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "resolve_dispute",
        args: [disputeId],
        value: BigInt(0),
        ...(fees ? { fees } : {}),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (err) {
      console.error("Error resolving dispute:", err);
      throw new Error("Failed to resolve dispute");
    }
  }
}

export default Verdict;
