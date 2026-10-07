"use client";

import { useState } from "react";
import { getAddress } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { Droplets, Loader2 } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { getStudioUrl } from "@/lib/genlayer/client";
import { fetchGenBalance, useGenBalance } from "@/lib/hooks/useGenBalance";
import { formatGen } from "@/lib/contracts/types";
import { error, success } from "@/lib/utils/toast";
import { Button } from "./ui/button";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wallet GEN balance plus a button for the GenLayer Studio faucet (sim_fundAccount); bonds and dispute stakes need test GEN. */
export function FaucetButton() {
  const { address, isConnected } = useWallet();
  const { data: balance } = useGenBalance(address);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!isConnected || !address) return null;

  const fund = async () => {
    setBusy(true);
    try {
      const before = await fetchGenBalance(address).catch(() => null);
      const res = await fetch(getStudioUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Studio keys faucet balances by the checksummed address: funding the lowercase form
        // (what MetaMask returns) succeeds but the GEN never shows up on the wallet.
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sim_fundAccount", params: [getAddress(address), 50 * 1e18] }),
      });
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);

      // Wait until the faucet transaction lands so the user sees a confirmed number, not a promise.
      let after: bigint | null = null;
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        after = await fetchGenBalance(address).catch(() => null);
        if (after !== null && before !== null && after > before) break;
      }
      qc.setQueryData(["genBalance", address], after ?? undefined);
      if (after !== null && before !== null && after > before) {
        success(`+${formatGen(after - before)} GEN from the Studio faucet`, {
          description: `On-chain balance is now ${formatGen(after)} GEN. MetaMask can take a minute to show it.`,
          duration: 8000,
        });
      } else {
        success("Faucet request sent", { description: "It has not landed yet; the balance next to the button updates automatically." });
      }
    } catch (e: any) {
      error("Faucet failed", { description: e?.message || "Try again in a minute." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {balance !== undefined && (
        <span className="hidden sm:inline text-sm font-mono text-muted-foreground" title="On-chain balance on GenLayer Studio">
          {formatGen(balance)} GEN
        </span>
      )}
      <Button variant="secondary" size="sm" onClick={fund} disabled={busy} title="Get 50 test GEN on GenLayer Studio">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Droplets className="w-4 h-4" />}
        <span className="ml-1 hidden sm:inline">{busy ? "Funding..." : "Test GEN"}</span>
      </Button>
    </div>
  );
}
