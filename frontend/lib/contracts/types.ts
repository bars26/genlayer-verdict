/**
 * TypeScript types for the Verdict contract
 */

export type DisputeStatus = "pending" | "upheld" | "dismissed";

export interface Dispute {
  id: string;
  agent: string;
  filer: string;
  claim: string;
  evidence_url: string;
  status: DisputeStatus;
  reasoning: string;
}

export interface AgentRecord {
  address: string;
  disputes_filed: number;
  disputes_upheld: number;
  disputes_dismissed: number;
}

export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}
