"use client";

import { Loader2, Gavel, Clock, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { usePendingDisputes, useResolveDispute, useVerdictContract } from "@/lib/hooks/useVerdict";
import { useWallet } from "@/lib/genlayer/wallet";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { Dispute } from "@/lib/contracts/types";

export function DisputesTable() {
  const contract = useVerdictContract();
  const { data: disputes, isLoading, isError } = usePendingDisputes();
  const { address, isConnected } = useWallet();
  const { resolveDispute, isResolving, resolvingDisputeId } = useResolveDispute();

  const handleResolve = (disputeId: string) => {
    resolveDispute(disputeId);
  };

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading pending disputes...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-400 opacity-60" />
          <h3 className="text-xl font-bold">Setup Required</h3>
          <p className="text-muted-foreground">
            Please set{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code>{" "}
            in your .env file.
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="brand-card p-8">
        <p className="text-center text-destructive">Failed to load disputes. Please try again.</p>
      </div>
    );
  }

  if (!disputes || disputes.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Gavel className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No Pending Disputes</h3>
          <p className="text-muted-foreground">
            Every filed dispute has been resolved. Be the first to file a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-card p-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Claim
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filed By
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {disputes.map((dispute) => (
              <DisputeRow
                key={dispute.id}
                dispute={dispute}
                isConnected={isConnected}
                onResolve={handleResolve}
                isResolving={isResolving && resolvingDisputeId === dispute.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DisputeRowProps {
  dispute: Dispute;
  isConnected: boolean;
  onResolve: (disputeId: string) => void;
  isResolving: boolean;
}

function statusBadge(status: Dispute["status"]) {
  if (status === "upheld") {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        <XCircle className="w-3 h-3 mr-1" />
        Upheld
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Dismissed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  );
}

function DisputeRow({ dispute, isConnected, onResolve, isResolving }: DisputeRowProps) {
  return (
    <tr className="group hover:bg-white/5 transition-colors animate-fade-in">
      <td className="px-4 py-4">
        <AddressDisplay address={dispute.agent} maxLength={10} showCopy={true} />
      </td>
      <td className="px-4 py-4 max-w-md">
        <span className="text-sm">{dispute.claim}</span>
        <a
          href={dispute.evidence_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-accent hover:underline mt-1 truncate"
        >
          {dispute.evidence_url}
        </a>
      </td>
      <td className="px-4 py-4">
        <AddressDisplay address={dispute.filer} maxLength={10} />
      </td>
      <td className="px-4 py-4">{statusBadge(dispute.status)}</td>
      <td className="px-4 py-4">
        {isConnected && (
          <Button onClick={() => onResolve(dispute.id)} disabled={isResolving} size="sm" variant="gradient">
            {isResolving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Resolving...
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        )}
      </td>
    </tr>
  );
}
