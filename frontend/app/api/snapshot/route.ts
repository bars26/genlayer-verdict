import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

/**
 * Server-side snapshot of every agent and dispute, cached at the CDN.
 *
 * GenLayer Studio rate-limits per IP and counts contract reads (`gen_call`) in the
 * same 30-per-minute bucket as `eth_sendRawTransaction`. Reading every agent and dispute
 * from the visitor's browser would spend the budget the visitor needs for their own
 * transactions, so the registry is read here and served from the CDN.
 */

export const dynamic = "force-dynamic";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

type Snapshot = { agents: unknown[]; disputes: unknown[]; failed: string[]; fetchedAt: string };
let memo: { at: number; data: Snapshot } | null = null;
const MEMO_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function read<T>(client: any, functionName: string, args: unknown[]): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await client.readContract({ address: CONTRACT, functionName, args })) as T;
    } catch (err) {
      last = err;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw last;
}

function toJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Map ? Object.fromEntries(v) : v))
  );
}

async function readAll(client: any, fn: string, keys: string[], failed: string[]) {
  const out: unknown[] = new Array(keys.length);
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < keys.length) {
        const i = next++;
        try {
          out[i] = toJson(await read(client, fn, [keys[i]]));
        } catch {
          failed.push(keys[i]);
        }
      }
    })
  );
  return out.filter(Boolean);
}

async function load(): Promise<Snapshot> {
  const client: any = createClient({ chain: studionet, endpoint: RPC } as any);
  const [agentIds, disputeIds] = await Promise.all([
    read<string[]>(client, "list_agents", []),
    read<string[]>(client, "list_disputes", []),
  ]);
  const failed: string[] = [];
  const agents = await readAll(client, "get_agent", agentIds, failed);
  const disputes = await readAll(client, "get_dispute", disputeIds, failed);
  return { agents, disputes, failed, fetchedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    if (!memo || Date.now() - memo.at > MEMO_MS || memo.data.failed.length > 0) {
      const data = await load();
      if (!memo || data.disputes.length + data.agents.length >= memo.data.disputes.length + memo.data.agents.length) {
        memo = { at: Date.now(), data };
      }
    }
    const partial = memo.data.failed.length > 0;
    return Response.json(memo.data, {
      headers: {
        // Short on purpose: a long stale-while-revalidate serves the first visitor after a quiet
        // period a snapshot from hours ago.
        "Cache-Control": partial ? "public, s-maxage=10, stale-while-revalidate=20" : "public, s-maxage=15, stale-while-revalidate=45",
      },
    });
  } catch (err) {
    if (memo) return Response.json(memo.data, { headers: { "Cache-Control": "public, s-maxage=10" } });
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
