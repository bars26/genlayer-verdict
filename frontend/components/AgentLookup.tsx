"use client";

import { useState } from "react";
import { Search, ShieldCheck, ShieldX, ShieldQuestion, Loader2 } from "lucide-react";
import { useAgentRecord, useDisputesByAgent } from "@/lib/hooks/useVerdict";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function AgentLookup() {
  const [input, setInput] = useState("");
  const [queried, setQueried] = useState<string | null>(null);

  const { data: record, isLoading: isRecordLoading } = useAgentRecord(queried);
  const { data: disputes, isLoading: isDisputesLoading } = useDisputesByAgent(queried);

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (ADDRESS_RE.test(trimmed)) {
      setQueried(trimmed);
    }
  };

  const isValid = input.trim() === "" || ADDRESS_RE.test(input.trim());
  const total = record ? record.disputes_upheld + record.disputes_dismissed : 0;
  const trustLabel =
    total === 0 ? "no track record yet" : `${record!.disputes_dismissed} of ${total} disputes dismissed`;

  return (
    <div className="brand-card p-6 space-y-4">
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <ShieldQuestion className="w-5 h-5 text-accent" />
          Look Up an Agent
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Check an agent&apos;s adjudicated track record before trusting it with money or a task.
        </p>
      </div>

      <form onSubmit={handleLookup} className="flex gap-2">
        <Input
          type="text"
          placeholder="0x..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className={`font-mono ${!isValid ? "border-destructive" : ""}`}
        />
        <Button type="submit" variant="secondary" disabled={!ADDRESS_RE.test(input.trim())}>
          <Search className="w-4 h-4" />
        </Button>
      </form>
      {!isValid && <p className="text-xs text-destructive">Must be a valid 0x address</p>}

      {queried && (
        <div className="pt-2 border-t border-white/10 space-y-4">
          {isRecordLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading record...
            </div>
          ) : record ? (
            <>
              <div className="flex items-center justify-between">
                <AddressDisplay address={queried} maxLength={16} showCopy={true} />
                {total === 0 ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    No history
                  </Badge>
                ) : record.disputes_upheld === 0 ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    Clean record
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <ShieldX className="w-3 h-3 mr-1" />
                    {record.disputes_upheld} upheld
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="text-2xl font-bold">{record.disputes_filed}</div>
                  <div className="text-xs text-muted-foreground mt-1">Filed</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="text-2xl font-bold text-green-400">{record.disputes_dismissed}</div>
                  <div className="text-xs text-muted-foreground mt-1">Dismissed</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="text-2xl font-bold text-red-400">{record.disputes_upheld}</div>
                  <div className="text-xs text-muted-foreground mt-1">Upheld</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">{trustLabel}</p>

              {isDisputesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading history...
                </div>
              ) : disputes && disputes.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {disputes.map((d) => (
                    <div key={d.id} className="rounded-lg border border-white/10 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{d.claim}</span>
                        <Badge
                          variant={d.status === "pending" ? "outline" : undefined}
                          className={
                            d.status === "upheld"
                              ? "bg-red-500/20 text-red-400 border-red-500/30 shrink-0"
                              : d.status === "dismissed"
                                ? "bg-green-500/20 text-green-400 border-green-500/30 shrink-0"
                                : "text-yellow-400 border-yellow-500/30 shrink-0"
                          }
                        >
                          {d.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
