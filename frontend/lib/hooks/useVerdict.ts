"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Verdict from "../contracts/Verdict";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import type { FeePresetLevel } from "../genlayer/fees";
import { useWallet } from "../genlayer/wallet";
import { success, error, configError } from "../utils/toast";
import type { Dispute, AgentRecord } from "../contracts/types";

/**
 * Hook to get the Verdict contract instance.
 *
 * Returns null if the contract address is not configured. Read-only
 * operations work without a connected wallet; write operations (fileDispute,
 * resolveDispute) require one.
 */
export function useVerdictContract(): Verdict | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  const contract = useMemo(() => {
    if (!contractAddress) {
      configError(
        "Setup Required",
        "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.",
        {
          label: "Setup Guide",
          onClick: () => window.open("/docs/setup", "_blank"),
        }
      );
      return null;
    }
    return new Verdict(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);

  return contract;
}

/** Hook to fetch every dispute currently awaiting resolution. */
export function usePendingDisputes() {
  const contract = useVerdictContract();

  return useQuery<Dispute[], Error>({
    queryKey: ["pendingDisputes"],
    queryFn: () => (contract ? contract.listPendingDisputes() : Promise.resolve([])),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/** Hook to fetch every dispute ever filed against a given agent address. */
export function useDisputesByAgent(agent: string | null) {
  const contract = useVerdictContract();

  return useQuery<Dispute[], Error>({
    queryKey: ["disputesByAgent", agent],
    queryFn: () => (contract && agent ? contract.listDisputesByAgent(agent) : Promise.resolve([])),
    enabled: !!contract && !!agent,
    staleTime: 2000,
  });
}

/** Hook to fetch an agent's trust record (zero counts if it has no history). */
export function useAgentRecord(agent: string | null) {
  const contract = useVerdictContract();

  return useQuery<AgentRecord | null, Error>({
    queryKey: ["agentRecord", agent],
    queryFn: () => (contract && agent ? contract.getAgentRecord(agent) : Promise.resolve(null)),
    enabled: !!contract && !!agent,
    staleTime: 2000,
  });
}

/** Hook to file a new dispute against an agent. */
export function useFileDispute() {
  const contract = useVerdictContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isFiling, setIsFiling] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({
      agent,
      claim,
      evidenceUrl,
      feePresetLevel,
    }: {
      agent: string;
      claim: string;
      evidenceUrl: string;
      feePresetLevel?: FeePresetLevel;
    }) => {
      if (!contract) {
        throw new Error("Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.");
      }
      if (!address) {
        throw new Error("Wallet not connected. Please connect your wallet to file a dispute.");
      }
      setIsFiling(true);
      const feePreset = await contract.estimateFileDisputeFees(
        agent,
        claim,
        evidenceUrl,
        feePresetLevel ?? "standard"
      );
      return contract.fileDispute(agent, claim, evidenceUrl, feePreset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingDisputes"] });
      queryClient.invalidateQueries({ queryKey: ["disputesByAgent"] });
      queryClient.invalidateQueries({ queryKey: ["agentRecord"] });
      setIsFiling(false);
      success("Dispute filed successfully!", {
        description: "Validators will fetch the evidence and adjudicate it once resolved.",
      });
    },
    onError: (err: any) => {
      console.error("Error filing dispute:", err);
      setIsFiling(false);
      error("Failed to file dispute", { description: err?.message || "Please try again." });
    },
  });

  return {
    ...mutation,
    isFiling,
    fileDispute: mutation.mutate,
    fileDisputeAsync: mutation.mutateAsync,
  };
}

/** Hook to resolve a pending dispute. */
export function useResolveDispute() {
  const contract = useVerdictContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (disputeId: string) => {
      if (!contract) {
        throw new Error("Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.");
      }
      if (!address) {
        throw new Error("Wallet not connected. Please connect your wallet to resolve a dispute.");
      }
      setIsResolving(true);
      setResolvingDisputeId(disputeId);
      return contract.resolveDispute(disputeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingDisputes"] });
      queryClient.invalidateQueries({ queryKey: ["disputesByAgent"] });
      queryClient.invalidateQueries({ queryKey: ["agentRecord"] });
      setIsResolving(false);
      setResolvingDisputeId(null);
      success("Dispute resolved!", {
        description: "Validators reached consensus on the evidence.",
      });
    },
    onError: (err: any) => {
      console.error("Error resolving dispute:", err);
      setIsResolving(false);
      setResolvingDisputeId(null);
      error("Failed to resolve dispute", { description: err?.message || "Please try again." });
    },
  });

  return {
    ...mutation,
    isResolving,
    resolvingDisputeId,
    resolveDispute: mutation.mutate,
    resolveDisputeAsync: mutation.mutateAsync,
  };
}
