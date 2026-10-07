// Live end-to-end demo of Verdict v2 on GenLayer Studio.
//
//   node scripts/demo.mjs <contract-address>
//
// Creates throwaway Studio accounts (an agent and two clients), funds them from the Studio
// faucet, registers and bonds the agent, then runs four disputes through their whole
// lifecycle against public evidence pages (docs/demo-evidence). Prints each transaction
// hash, consensus status and the contract's own execution result.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { writeFileSync } from "fs";

const CONTRACT = process.argv[2];
if (!CONTRACT) {
  console.error("usage: node scripts/demo.mjs <contract-address>");
  process.exit(1);
}
const RPC = "https://studio.genlayer.com/api";
const GEN = 10n ** 18n;
const STAKE = GEN / 2n;
const EVIDENCE = "https://raw.githubusercontent.com/bars26/genlayer-verdict/main/docs/demo-evidence";

function client(account) {
  return createClient({ chain: studionet, endpoint: RPC, account });
}

async function rpc(method, params) {
  // Studio sometimes answers with an HTML error page; plain reads are safe to retry.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      return body.result;
    } catch (err) {
      if (attempt >= 6 || !/Unexpected token|not valid JSON|fetch failed|ECONNRESET|50[234]|rate limit/i.test(String(err?.message))) throw err;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

const TRANSIENT = /rate limit|Unexpected token '<'|not valid JSON|fetch failed|ECONNRESET|socket hang up|50[234]/i;

async function write(c, who, functionName, args, value = 0n) {
  const from = c.account.address;
  for (let attempt = 1; ; attempt++) {
    const nonceBefore = BigInt(await rpc("eth_getTransactionCount", [from, "latest"]));
    try {
      let hash;
      try {
        hash = await c.writeContract({ address: CONTRACT, functionName, args, value });
      } catch (err) {
        // The RPC sometimes answers a send with an HTML error page. Only resend if the
        // nonce did not move; otherwise the first send went through and we pick it up.
        if (!TRANSIENT.test(String(err?.message || err))) throw err;
        await sleep(15000);
        const nonceAfter = BigInt(await rpc("eth_getTransactionCount", [from, "latest"]));
        if (nonceAfter === nonceBefore) throw err;
        const txs = await rpc("sim_getTransactionsForAddress", [from]);
        hash = txs.filter((t) => (t.from_address || "").toLowerCase() === from.toLowerCase()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0].hash;
        console.log(`  send answered with an error page but the tx exists: ${hash}`);
      }
      // Once a hash exists, only the wait is retried; the transaction is never sent twice.
      let receipt;
      for (let wait = 1; ; wait++) {
        try {
          receipt = await c.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 60, interval: 5000 });
          break;
        } catch (err) {
          if (!TRANSIENT.test(String(err?.message || err)) || wait >= 6) throw Object.assign(err, { sent: true });
          await sleep(10000 * wait);
        }
      }
      const lr = receipt?.consensus_data?.leader_receipt;
      const first = Array.isArray(lr) ? lr[0] : lr;
      const exec = first?.execution_result ?? "?";
      let returned = first?.result?.payload?.readable;
      try { returned = JSON.parse(returned); } catch {}
      const row = { who, call: `${functionName}(${args.map((a) => (typeof a === "bigint" ? `${Number(a) / 1e18} GEN` : JSON.stringify(a)).slice(0, 40)).join(", ")})`, value: (Number(value) / 1e18).toString(), hash, status: receipt.statusName ?? receipt.status_name ?? "ACCEPTED", exec, returned: typeof returned === "string" ? returned : undefined };
      log.push(row);
      console.log(`${row.who.padEnd(10)} ${row.call.padEnd(52)} ${row.status.padEnd(9)} ${row.exec.padEnd(7)} ${hash}${row.returned?.startsWith?.("REFUNDED") ? "  -> " + row.returned : ""}`);
      if (exec !== "SUCCESS") throw new Error(`${functionName} executed with ${exec}`);
      return receipt;
    } catch (err) {
      const msg = String(err?.message || err);
      if (TRANSIENT.test(msg) && attempt < 5 && !err?.sent) {
        console.log(`  transient RPC error (${msg.slice(0, 60)}), waiting ${15 * attempt}s`);
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

async function read(c, functionName, args = []) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await c.readContract({ address: CONTRACT, functionName, args });
    } catch (err) {
      if ((/rate limit/i.test(String(err?.message)) || TRANSIENT.test(String(err?.message))) && attempt < 6) {
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

const balance = async (addr) => BigInt(await rpc("eth_getBalance", [addr, "latest"]));
const fmt = (wei) => (Number(wei) / 1e18).toFixed(2);
const field = (obj, name) => (obj instanceof Map ? obj.get(name) : obj[name]);

const keys = { agent: generatePrivateKey(), client1: generatePrivateKey(), client2: generatePrivateKey() };
if (process.env.DEMO_KEYS) writeFileSync(process.env.DEMO_KEYS, JSON.stringify(keys));
const agent = createAccount(keys.agent);
const c1 = createAccount(keys.client1);
const c2 = createAccount(keys.client2);
const A = client(agent);
const C1 = client(c1);
const C2 = client(c2);

console.log("contract", CONTRACT);
console.log("agent   ", agent.address);
console.log("client-1", c1.address);
console.log("client-2", c2.address);
for (const a of [agent, c1, c2]) await rpc("sim_fundAccount", [a.address, Number(50n * GEN)]);
await sleep(3000);
const start = { agent: await balance(agent.address), c1: await balance(c1.address), c2: await balance(c2.address) };
console.log(`funded: agent ${fmt(start.agent)}, client-1 ${fmt(start.c1)}, client-2 ${fmt(start.c2)} GEN\n`);

const TERMS =
  "TransBot translates documents from English to Turkish. Every order is delivered within 24 hours of payment as a human-reviewed file; if an order is late the client is refunded.";
await write(A, "agent", "register_agent", ["TransBot", TERMS, "https://transbot.example/api"]);
await write(A, "agent", "post_bond", [], 10n * GEN);
await write(A, "agent", "post_bond", [], GEN / 100n); // below 0.1 GEN: refunded, not kept

const first = Number((await read(A, "list_disputes")).length);
const id = (n) => `dispute_${first + n}`;
const show = async (d) => {
  const x = await read(A, "get_dispute", [d]);
  console.log(`  -> ${d}: ${field(x, "verdict")} (${field(x, "code")})${field(x, "contested") ? `, contested by ${field(x, "contest_by") === agent.address ? "agent" : "client"}, changed=${field(x, "contest_changed")}` : ""}`);
  return field(x, "verdict");
};

// D0: order 1001 was never delivered. The client asks for 3 GEN from the bond.
console.log("");
await write(C1, "client-1", "file_dispute", [agent.address, "TransBot took payment for order 1001 on 5 October and had not delivered anything 48 hours later, breaking its 24-hour promise.", `${EVIDENCE}/order-1001.md`, 3n * GEN], STAKE);
await write(A, "agent", "respond", [id(0), "Order 1001 was delayed because of a backlog; we are working on it.", ""]);
await write(C1, "client-1", "resolve", [id(0)]);
const v0 = await show(id(0));
if (v0 === "UPHELD") await write(A, "agent", "settle", [id(0)]); // the agent accepts the ruling

// D1: a false claim about order 1002, which the client's own evidence shows was delivered.
console.log("");
await write(C2, "client-2", "file_dispute", [agent.address, "TransBot never delivered order 1002 (pricing page translation) even though it was paid on 5 October.", `${EVIDENCE}/order-1002.md`, 2n * GEN], STAKE);
await write(A, "agent", "respond", [id(1), "Order 1002 was delivered 8 hours 40 minutes after payment and the client confirmed receipt.", `${EVIDENCE}/delivery-1002.md`]);
await write(C2, "client-2", "resolve", [id(1)]);
const v1 = await show(id(1));
if (v1 !== "UPHELD") {
  await write(C2, "client-2", "contest", [id(1)], STAKE); // the client insists, staking again
  await show(id(1));
  await write(C1, "client-1", "settle", [id(1)]); // after a contest anyone can settle
}

// D2: evidence that has nothing to do with the agent.
console.log("");
await write(C2, "client-2", "file_dispute", [agent.address, "TransBot delivered a poor machine translation full of errors for my latest order.", "https://example.com/", 0n], STAKE);
await write(A, "agent", "respond", [id(2), "This page is unrelated to TransBot or any of our orders.", ""]);
await write(C2, "client-2", "resolve", [id(2)]);
const v2 = await show(id(2));
await write(v2 === "UPHELD" ? A : C2, v2 === "UPHELD" ? "agent" : "client-2", "settle", [id(2)]);

// D3: evidence that does not exist; decided in code, nobody is penalised.
console.log("");
await write(C1, "client-1", "file_dispute", [agent.address, "TransBot ignored my refund request for order 1003 after missing the deadline.", `${EVIDENCE}/order-1003-does-not-exist.md`, GEN], STAKE);
await write(A, "agent", "respond", [id(3), "There is no order 1003 in our records.", ""]);
await write(C1, "client-1", "resolve", [id(3)]);
const v3 = await show(id(3));
await write(v3 === "UPHELD" ? A : C1, v3 === "UPHELD" ? "agent" : "client-1", "settle", [id(3)]);

console.log("");
const summary = await read(A, "trust_summary", [agent.address]);
console.log("trust_summary", JSON.stringify(summary instanceof Map ? Object.fromEntries(summary) : summary, (k, v) => (typeof v === "bigint" ? v.toString() : v)));
console.log("is_trusted(agent, 5 GEN, 0) =", await read(A, "is_trusted", [agent.address, 5n * GEN, 0n]));
console.log("is_trusted(agent, 5 GEN, 1) =", await read(A, "is_trusted", [agent.address, 5n * GEN, 1n]));

// Unbonding: request 2 GEN, wait out the notice period, withdraw.
await write(A, "agent", "request_withdrawal", [2n * GEN]);
const windows = await read(A, "windows");
const unbond = Number(field(windows, "unbond_seconds"));
console.log(`  waiting ${unbond + 20}s for the unbonding notice period`);
await sleep((unbond + 20) * 1000);
await write(A, "agent", "complete_withdrawal", []);

await sleep(8000);
const end = { agent: await balance(agent.address), c1: await balance(c1.address), c2: await balance(c2.address) };
const rec = await read(A, "get_agent", [agent.address]);
console.log(`\nagent bond ${fmt(field(rec, "bond"))} GEN, locked ${fmt(field(rec, "locked"))}, upheld ${field(rec, "disputes_upheld")}, dismissed ${field(rec, "disputes_dismissed")}, insufficient ${field(rec, "disputes_insufficient")}, compensation paid ${fmt(field(rec, "compensation_paid"))}`);
console.log(`balances: agent ${fmt(start.agent)} -> ${fmt(end.agent)}, client-1 ${fmt(start.c1)} -> ${fmt(end.c1)}, client-2 ${fmt(start.c2)} -> ${fmt(end.c2)} GEN`);
console.log("contract balance", fmt(await balance(CONTRACT)), "GEN");
console.log("\nJSON:", JSON.stringify({ contract: CONTRACT, agent: agent.address, client1: c1.address, client2: c2.address, verdicts: [v0, v1, v2, v3], log }));
