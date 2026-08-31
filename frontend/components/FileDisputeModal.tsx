"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, ShieldAlert, Link as LinkIcon } from "lucide-react";
import { useFileDispute } from "@/lib/hooks/useVerdict";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function FileDisputeModal() {
  const { isConnected, address, isLoading } = useWallet();
  const { fileDispute, isFiling, isSuccess } = useFileDispute();

  const [isOpen, setIsOpen] = useState(false);
  const [agent, setAgent] = useState("");
  const [claim, setClaim] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const [errors, setErrors] = useState({ agent: "", claim: "", evidenceUrl: "" });

  useEffect(() => {
    if (!isConnected && isOpen && !isFiling) {
      setIsOpen(false);
    }
  }, [isConnected, isOpen, isFiling]);

  const validateForm = (): boolean => {
    const newErrors = { agent: "", claim: "", evidenceUrl: "" };

    if (!agent.trim()) {
      newErrors.agent = "Agent address is required";
    } else if (!/^0x[0-9a-fA-F]{40}$/.test(agent.trim())) {
      newErrors.agent = "Must be a valid 0x address";
    } else if (address && agent.trim().toLowerCase() === address.toLowerCase()) {
      newErrors.agent = "You cannot file a dispute against yourself";
    }

    if (!claim.trim()) {
      newErrors.claim = "Describe what was promised and what was delivered";
    }

    if (!evidenceUrl.trim()) {
      newErrors.evidenceUrl = "A link validators can check is required";
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((e) => e !== "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      error("Please connect your wallet first");
      return;
    }

    if (!validateForm()) return;

    fileDispute({ agent: agent.trim(), claim: claim.trim(), evidenceUrl: evidenceUrl.trim() });
  };

  const resetForm = () => {
    setAgent("");
    setClaim("");
    setEvidenceUrl("");
    setErrors({ agent: "", claim: "", evidenceUrl: "" });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isFiling) resetForm();
    setIsOpen(open);
  };

  useEffect(() => {
    if (isSuccess) {
      resetForm();
      setIsOpen(false);
    }
  }, [isSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="gradient" disabled={!isConnected || !address || isLoading}>
          <Plus className="w-4 h-4 mr-2" />
          File a Dispute
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">File a Dispute</DialogTitle>
          <DialogDescription>
            Claim an AI agent broke a promise, and back it with evidence validators can check themselves.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="agent" className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 !text-white" />
              Agent Address
            </Label>
            <Input
              id="agent"
              type="text"
              placeholder="0x..."
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setErrors({ ...errors, agent: "" });
              }}
              className={`font-mono ${errors.agent ? "border-destructive" : ""}`}
            />
            {errors.agent && <p className="text-xs text-destructive">{errors.agent}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="claim">What was promised, and what actually happened?</Label>
            <textarea
              id="claim"
              placeholder='e.g. "Agent promised a working API endpoint by Friday — the URL returns a 404."'
              value={claim}
              onChange={(e) => {
                setClaim(e.target.value);
                setErrors({ ...errors, claim: "" });
              }}
              rows={3}
              className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                errors.claim ? "border-destructive" : "border-input"
              }`}
            />
            {errors.claim && <p className="text-xs text-destructive">{errors.claim}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidenceUrl" className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Evidence URL
            </Label>
            <Input
              id="evidenceUrl"
              type="url"
              placeholder="https://..."
              value={evidenceUrl}
              onChange={(e) => {
                setEvidenceUrl(e.target.value);
                setErrors({ ...errors, evidenceUrl: "" });
              }}
              className={errors.evidenceUrl ? "border-destructive" : ""}
            />
            {errors.evidenceUrl && <p className="text-xs text-destructive">{errors.evidenceUrl}</p>}
            <p className="text-xs text-muted-foreground">
              A page validators can fetch and check for themselves — a log, an API response, a delivery page.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsOpen(false)}
              disabled={isFiling}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gradient" className="flex-1" disabled={isFiling}>
              {isFiling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Filing...
                </>
              ) : (
                "File Dispute"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
