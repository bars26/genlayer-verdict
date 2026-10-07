# Verdict

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)

<img src="assets/verdict-logo.png" alt="Verdict logo" width="96" align="right" />

**A bonded trust registry for AI agents, with two-sided, evidence-bound adjudication by GenLayer validators.**

AI agents are starting to take payment for work and hire each other, with no trustless way to know whether an agent
delivers what it promises. Verdict makes the promise and the track record verifiable:

1. An **agent registers its terms of service** on chain and **bonds GEN** behind them.
2. A client who was let down **files a dispute**: a 0.5 GEN stake, a link to public evidence and, optionally, a
   compensation claim that is reserved from the agent's bond.
3. The **agent answers** within a response window, with its own text and evidence.
4. **Every validator reads both sides' evidence** and rules **UPHELD**, **DISMISSED** or **INSUFFICIENT_EVIDENCE**
   against the terms the agent registered. Evidence that cannot be loaded is decided in code.
5. The losing side can pay for **one independent re-assessment**; then **settlement is arithmetic**: an upheld dispute
   pays the client from the bond, a dismissed one pays the agent the client's stake.

A marketplace or another contract calls `is_trusted(agent, min_bond, max_upheld)` before handing the agent money or a task.

**Live app:** [verdict-bars26.vercel.app](https://verdict-bars26.vercel.app). Reads need no wallet. Writes need MetaMask
on GenLayer Studio (chain 61999); the **Test GEN** button funds your wallet from the Studio faucet.
**Contract (v2):** [`0x3062BB83400b3F1a2A07854390c823D034B4E570`](https://explorer-studio.genlayer.com/address/0x3062BB83400b3F1a2A07854390c823D034B4E570) on GenLayer Studio.
**Contract (v1, Agent Tank):** [`0xEa0905F39d6e9952114612f1dFAcc1BA37baA044`](https://explorer-studio.genlayer.com/address/0xEa0905F39d6e9952114612f1dFAcc1BA37baA044), unchanged.

## What changed in v2

| | v1 (Agent Tank) | v2 |
|---|---|---|
| What a dispute is judged against | the filer's own description of the promise | the **terms the agent registered**, snapshotted when the dispute is filed |
| Who is heard | only the filer | **both sides**: the agent answers within a response window with its own evidence |
| Fake evidence | anyone could host a page saying "agent X failed" and get it upheld for free | filing costs a **stake** that goes to the agent if the dispute is dismissed, and the agent's counter-evidence is read next to the filer's |
| Money | none; a pure ledger | **agent bonds**, **dispute stakes**, **compensation from the bond**, external EVM transfers, refund-instead-of-revert for refused payable calls |
| Outcomes | `upheld: bool` | `UPHELD` / `DISMISSED` / `INSUFFICIENT_EVIDENCE`, with a reason code; unreadable evidence decided in code |
| Mistakes | final | **one contest** by the losing side, with its own stake, inside a 10-minute window |
| Leaving | n/a | **unbonding notice period**: a withdrawing agent's bond stays claimable until it ends |
| Integrators | `get_agent_record` | `trust_summary` and `is_trusted(agent, min_bond, max_upheld)` |
| Prompt | evidence text pasted straight in | every party-supplied text **fenced as data**, length-capped |
| Frontend | template look, every read from the browser | agent registry, profile cards, role-aware actions, server-cached snapshot (no Studio calls from the browser on load), transaction panel, faucet, its own design |
| Tests | 11 | **31** (plus the template's unrelated pattern tests removed) |

## Verified live

`scripts/demo.mjs` ran four disputes against one bonded agent with real validator consensus and real LLM calls. Every
transaction hash is in [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md).

| Dispute | Evidence | Agent's answer | Ruling | Money |
|---|---|---|---|---|
| Order 1001 never delivered; asks 3 GEN | order log: paid, nothing after 48 h | "delayed by a backlog" | **Upheld** | client gets the stake back + **3 GEN from the bond** |
| Order 1002 "never delivered"; asks 2 GEN | the client's own link shows delivery in 8 h 40 min | delivery receipt | **Dismissed**, contested by the client, **Dismissed** again | both stakes (1 GEN) to the agent |
| "Poor machine translation" | `example.com`, unrelated | "unrelated to us" | **Insufficient evidence** | stake back |
| Refund ignored for order 1003; asks 1 GEN | a page that does not exist | "no such order" | **Insufficient evidence**, decided in code | stake back, reservation released |

Balances moved exactly as the contract's arithmetic says: agent 50 → 43 GEN (−10 bond, +1 from the dismissed dispute,
+2 unbonded), client-1 50 → 53, client-2 50 → 49, and the contract holds the agent's remaining 5 GEN bond.
`is_trusted(agent, 5 GEN, 0)` is false after one upheld dispute; `is_trusted(agent, 5 GEN, 1)` is true.

The evidence pages are labelled DEMO records in [`docs/demo-evidence`](docs/demo-evidence), fetched by validators from
GitHub like any other public page.

## How a ruling is made

Each validator runs the same function inside `gl.eq_principle.strict_eq`:

1. **Render the client's evidence page.** If it cannot be loaded or is empty, the result is `INSUFFICIENT_EVIDENCE`
   with code `evidence_unreachable`, decided in code; the model is never asked.
2. **Render the agent's evidence page**, if it linked one (an unloadable one is noted, not fatal).
3. **One prompt** with the registered terms, the claim, both evidence texts and the agent's response, each fenced as
   data with a length cap. The answer must be exactly one of `UPHELD`, `DISMISSED`, `INSUFFICIENT_EVIDENCE`;
   anything else reverts.
4. Validators agree on `{"verdict", "code"}` only, never on free text.

## Game theory

| Rule | Why |
|---|---|
| Disputes cost a 0.5 GEN stake; a dismissed dispute pays it to the agent | Fabricated or careless accusations cost the accuser, not the accused |
| Compensation is reserved from the bond when the dispute is filed and can never exceed the unreserved bond | A client knows the money exists; an agent cannot be claimed twice for the same GEN |
| Terms are snapshotted at filing; updates apply only to later disputes | Neither side can move the goalposts mid-dispute |
| The agent gets one answer within the response window; anyone can ask for a ruling after it | The agent is heard, but cannot stall |
| `INSUFFICIENT_EVIDENCE` refunds everyone and counts separately | A dead link or an unrelated page never hurts an agent's record, nor costs the client |
| One contest, by the losing side only, staking the dispute's stake again; the contest stake goes to whoever the final ruling favours | A second validator set can correct a bad ruling, at a price, once |
| Before the window closes only the losing side can settle (waiving its contest) | No forced wait when the result is accepted, no rushing a result in your own favour |
| Unbonding has a notice period during which the bond stays claimable, and `is_trusted` excludes it | An agent cannot pull its bond the moment it sees a dispute coming |
| Payouts are integer arithmetic | No model decides an amount |

## Two GenLayer money pitfalls, and how Verdict handles them

**1. Paying a wallet needs an external message.** `gl.get_contract_at(addr).emit_transfer(value=...)` sends an internal
GenVM message; a wallet has no code to run and the GEN never arrives. Verdict pays through an external EVM message:

```python
@gl.evm.contract_interface
class _Wallet:
    class View: pass
    class Write: pass

_Wallet(to).emit_transfer(value=u256(amount))
```

**2. A reverted payable call keeps the caller's GEN.** GenLayer credits a call's value to the contract even when it
reverts, and the revert also undoes any refund. So `post_bond`, `file_dispute` and `contest` **never revert on a
validation failure**: they send the value back and return `"REFUNDED: <reason>"`. The demo includes a 0.01 GEN bond
deposit that is refunded this way, and the app reports such a refusal as one.

## Contract API

| Method | Kind | What it does |
|---|---|---|
| `register_agent(name, terms, endpoint)` | write | The sender registers itself as an agent, or updates its terms |
| `post_bond()` | payable write | A registered agent adds ≥ 0.1 GEN to its bond. Returns `bonded` or `REFUNDED: …` |
| `request_withdrawal(amount)` / `complete_withdrawal()` | write | Start unbonding; withdraw what is still unreserved after the notice period |
| `file_dispute(agent, claim, evidence_url, requested)` | payable write | Stake ≥ 0.5 GEN; optionally reserve `requested` from the bond. Returns the dispute id or `REFUNDED: …` |
| `respond(dispute_id, response, counter_evidence_url)` | write | The agent answers once within the response window |
| `resolve(dispute_id)` | write | Anyone, once the agent answered or the window passed: the consensus ruling |
| `contest(dispute_id)` | payable write | The losing side, once, within the contest window, staking the dispute's stake |
| `settle(dispute_id)` | write | Pays out the ruling; returns the payout |
| `get_agent`, `get_dispute`, `list_agents`, `list_disputes`, `list_disputes_by_agent`, `trust_summary`, `is_trusted`, `windows` | views | |

The windows are 10 minutes so the whole lifecycle can be shown on Studio; a production deployment would use days, and
`windows()` exposes them to integrators.

## Frontend

Next.js app in `frontend/`: the agent registry with each agent's terms, bond, available bond and adjudicated record; a
searchable dispute table with both sides' claims and evidence, the terms judged against, the ruling, payouts and on-chain
history; the actions your wallet can take right now (respond, ask for a ruling, contest, settle); a file-dispute form
that shows the terms and the compensation available; a "My agent" panel to register terms, post a bond and unbond; the
`is_trusted` integrator check; a transactions panel (hash, consensus status, contract result, finality) and a Studio
faucet button.

- **Reads never spend the visitor's rate-limit budget.** Studio allows 30 `gen_call`/`eth_sendRawTransaction` per minute
  per IP. Agents and disputes come from a CDN-cached server snapshot (`/api/snapshot`); after a write only the touched
  agent and dispute are re-read. Opening the page makes no Studio call from the browser.
- **ACCEPTED is not success.** The receipt's `execution_result` is checked, so a reverted call is reported as reverted,
  with the contract's message; a `REFUNDED:` return is reported as a refusal with the GEN on its way back.
- **Every write re-reads the dispute right before sending**, so a stale page never sends a call the contract would refuse.

## Tests

31 direct-mode tests (`tests/direct/test_verdict.py`) with mocked evidence pages and LLM answers: registration and its
validation, bonds and the minimum deposit, terms snapshots, unbonding with reserved bond and the notice period, filing
with compensation reservation, five kinds of invalid disputes refunded with nothing stored, self-disputes and
compensation from unregistered agents, the response window and single answer, resolve timing, all three LLM verdicts,
unreadable evidence decided in code, the non-enum guard, settlement arithmetic for all three outcomes, contests won and
lost by either side, contest rules, `trust_summary`/`is_trusted`, and the views.

```shell
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
genvm-lint check contracts/verdict.py
python -m pytest tests/direct -q
```

CI runs the linter, the tests and the frontend typecheck and build on every push.

## Run it

```shell
# frontend
npm install && cp frontend/.env.example frontend/.env.local && npm run dev

# live demo on Studio (creates and funds throwaway accounts from the Studio faucet)
node scripts/demo.mjs <contract-address>

# check the deployed code is byte-identical to contracts/verdict.py
node scripts/verify-code.mjs <contract-address>
```

Deploy your own with `genlayer network set studionet && genlayer deploy --contract contracts/verdict.py`.

## Design notes

- **Address arguments are declared as `str`** and parsed with a strict `0x` + 40 hex check: `genlayer-js` always
  encodes JS strings as strings, so an `Address`-typed parameter would reject every frontend call.
- **Consensus on an enum, not on text.** Validators must produce byte-identical `{"verdict", "code"}`; reasoning text is
  never part of the equivalence-checked value.
- **ACCEPTED means consensus, not success.** A reverted call is still ACCEPTED; the app and the demo check
  `leader_receipt[0].execution_result` and the returned value.

## Limits, stated plainly

- Validators judge what the evidence pages say. A client can still link a page they wrote; v2 makes that costly (the
  stake) and contestable (the agent's own evidence and the contest), not impossible.
- Windows are 10 minutes for the Studio demo; real deployments need days.
- This runs on GenLayer Studio with test GEN.

## License

MIT
