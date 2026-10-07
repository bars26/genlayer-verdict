// Checks that the code deployed at an address is byte-identical to contracts/verdict.py.
//
//   node scripts/verify-code.mjs <contract-address>

import { readFileSync } from "fs";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const address = process.argv[2];
const local = readFileSync(new URL("../contracts/verdict.py", import.meta.url), "utf8");
const client = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api" });
let onchain = await client.getContractCode(address);
if (onchain instanceof Uint8Array) onchain = new TextDecoder().decode(onchain);
if (/^[A-Za-z0-9+/=]+$/.test(onchain) && !onchain.includes("\n")) onchain = Buffer.from(onchain, "base64").toString("utf8");
console.log(onchain === local ? `identical (${local.length} bytes)` : `DIFFERENT (on-chain ${onchain.length} bytes, local ${local.length} bytes)`);
process.exit(onchain === local ? 0 : 1);
