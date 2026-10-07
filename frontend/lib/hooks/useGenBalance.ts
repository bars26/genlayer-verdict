"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";
import { getStudioUrl } from "../genlayer/client";

/** Read a wallet's GEN balance straight from Studio (eth_getBalance is in the 300/min read bucket). */
export async function fetchGenBalance(address: string): Promise<bigint> {
  const res = await fetch(getStudioUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [getAddress(address), "latest"] }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return BigInt(body.result);
}

/** The connected wallet's balance, shown in the app because MetaMask can lag behind Studio. */
export function useGenBalance(address: string | null) {
  return useQuery<bigint, Error>({
    queryKey: ["genBalance", address],
    queryFn: () => fetchGenBalance(address!),
    enabled: !!address,
    refetchInterval: 20_000,
    staleTime: 5_000,
  });
}
