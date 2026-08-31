# Verdict
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/license/mit/)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/8Jm4v89VAu)
[![Telegram](https://img.shields.io/badge/Telegram--T.svg?style=social&logo=telegram)](https://t.me/genlayer)
[![Twitter](https://img.shields.io/twitter/url/https/twitter.com/yeagerai.svg?style=social&label=Follow%20%40GenLayer)](https://x.com/GenLayer)

## About

AI agents are starting to pay, hire, and fire each other — with no trustless way to know if an agent actually delivers what it promised. Today's agent "reputation" is a claim anyone can fake: a self-reported score, or a passive ledger that trusts whoever registers as "verifier."

**Verdict** is an on-chain trust registry for AI agents built on adjudicated evidence instead of self-reported scores. It works through *disputes*, not ratings: either party to a transaction can flag a claim — "Agent X promised Y, delivered Z" — with a link to evidence. GenLayer validators independently fetch that evidence and reach consensus on whether the claim holds, using the Equivalence Principle, rather than trusting a single reporter who could be wrong or bribed. Each agent accumulates a permanent, tamper-proof record of upheld and dismissed disputes that any other agent, marketplace, or human can check before trusting it with money or a task.

Built for [GenLayer's Agent Tank hackathon](https://portal.genlayer.foundation/agent-tank).

**Live demo:** [verdict-bars26.vercel.app](https://verdict-bars26.vercel.app) — connected to the deployed contract below; filing/resolving disputes needs MetaMask on the GenLayer network, but the pending-disputes queue and agent lookup work read-only for anyone.
**Deployed contract:** [`0xEa0905F39d6e9952114612f1dFAcc1BA37baA044`](https://explorer-studio.genlayer.com/address/0xEa0905F39d6e9952114612f1dFAcc1BA37baA044) on GenLayer Studio

## How it works

1. **`file_dispute(agent, claim, evidence_url)`** — anyone can flag a claim against an agent address, with a link to evidence. You can't dispute yourself.
2. **`resolve_dispute(dispute_id)`** — validators fetch `evidence_url` and ask an LLM whether it supports the claim. Under the Equivalence Principle (`gl.eq_principle.strict_eq`), leader and validator nodes each run this check independently and must agree on a single `upheld: bool` field — never coerced from an unchecked value (see Design notes). The dispute is marked `upheld` (the agent's promise was broken) or `dismissed` (the claim didn't hold), and the agent's record updates accordingly.
3. **Views** — `get_dispute`, `get_agent_record` (zero-valued if the agent has no history), `list_disputes_by_agent`, `list_pending_disputes` — let a frontend or another contract check an agent's track record without needing an indexer.

**The registry is self-correcting against spam**: a bad-faith or unfounded dispute just gets `dismissed`, which counts *in the agent's favor*. Only a dispute backed by real, independently-verifiable evidence can hurt an agent's record — there's no cost to being falsely accused.

Verdict deliberately holds no funds and has no payable methods — it's a pure adjudication ledger, not an escrow (see [`bars26/genlayer-task-escrow`](https://github.com/bars26/genlayer-task-escrow) for that). This keeps the primitive focused and, in practice, makes it far easier to demo: no funded wallet is needed to exercise the full dispute lifecycle on a live network.

## What's included

- **`contracts/verdict.py`** — the Intelligent Contract described above
- **Direct mode tests** (`tests/direct/test_verdict.py`) — 11 fast, in-memory tests covering filing, resolution (upheld/dismissed), the non-boolean-verdict guard, double-resolution guard, and the view methods
- **A working Next.js frontend** (`frontend/`) — file a dispute, see the pending-disputes queue with a resolve action, look up any agent's adjudicated trust record
- **Contract linting** — static analysis to catch common contract issues before deployment
- **CI pipeline** — GitHub Actions workflow for linting and direct tests
- Configuration file template and deployment scripts (`deploy/deployScript.ts`)

## Requirements
- Python >= 3.12
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli) globally installed: `npm install -g genlayer`
- GenLayer Studio (for integration tests and deployment): Install from [Docs](https://docs.genlayer.com/developers/intelligent-contracts/tooling-setup#using-the-genlayer-studio) or use the hosted [GenLayer Studio](https://studio.genlayer.com/)

## Project Structure

```
contracts/
  verdict.py               # The Verdict Intelligent Contract
tests/
  direct/                   # Fast in-memory tests (no Studio required)
    test_verdict.py          # Full lifecycle: file, resolve, guards, views
  integration/               # Full tests against GenLayer Studio
frontend/                   # Next.js 15 app (TypeScript, TanStack Query, Radix UI)
deploy/                     # TypeScript deployment scripts
gltest.config.yaml           # Test runner network configuration
pyproject.toml               # Python/pytest configuration
.github/workflows/           # CI pipeline
```

## Quick Start

### 1. Set up Python environment

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Lint the contract

```shell
genvm-lint check contracts/verdict.py
```

Passes clean with zero warnings — `_verify_claim`'s `gl.nondet.*` calls live inside `gl.eq_principle.strict_eq(get_verdict)`, one of the linter's recognized equivalence-principle wrappers.

### 3. Run direct mode tests

```shell
pytest tests/direct/ -v
```

All 11 tests run in-memory in well under a second, using `direct_vm.mock_web(...)` / `direct_vm.mock_llm(...)` to simulate evidence pages and LLM verdicts.

### 4. Deploy the contract

1. Choose your network: `genlayer network`
2. Deploy: `genlayer deploy` (runs `deploy/deployScript.ts`, which deploys `contracts/verdict.py`)

### 5. Run integration tests

```shell
gltest tests/integration/ -v -s
```

Requires GenLayer Studio running (local or hosted).

### 6. Run the frontend

```shell
cp frontend/.env.example frontend/.env
# set NEXT_PUBLIC_CONTRACT_ADDRESS to your deployed contract
npm run dev
```

Open http://localhost:3000. Reads (pending disputes, agent lookup) work without a wallet; filing and resolving disputes need MetaMask connected to the GenLayer network.

## Design notes

- **Address-typed arguments are declared as `str`, not `Address`, and normalized internally.** This is a specific, verified compatibility fix: `genlayer-js`'s calldata encoder (`readContract`/`writeContract`) has no public API to construct an address-typed argument — a plain JS string is always encoded as `TYPE_STR`, so an `Address`-typed parameter would reject every call the actual frontend makes. The `genlayer` CLI does the opposite: it auto-detects hex-looking `--args` values and pre-encodes them as addresses regardless of the declared schema. A private `_to_address()` helper accepts either shape (`isinstance(value, Address)` passthrough, otherwise `Address(value)`), so both callers work. This was caught by testing real write transactions against a live deployment — direct-mode tests alone didn't surface it, since they call contract methods as plain Python functions and never exercise either encoder.
- **Consensus on a boolean, not free text.** `_verify_claim` uses `gl.eq_principle.strict_eq`, which requires the leader's and validator's independent LLM calls to produce byte-identical output. The LLM is only ever asked for a single-field `{"upheld": bool}` JSON object — no open-ended reasoning is part of the equivalence-checked value, since free text would rarely match word-for-word between two independent calls.
- **No coercing the LLM's verdict.** The parsed `"upheld"` value is checked with `isinstance(upheld, bool)`, not passed through `bool(...)`. A malformed or adversarial response like `{"upheld": "false"}` (a non-empty *string*, not a JSON boolean) is truthy under Python's `bool()`, which would silently flip a dismissal into an upheld dispute — `resolve_dispute` reverts instead of ever accepting a non-boolean value. (This is the same class of bug caught and fixed during review of this project's sibling contract, `TaskEscrow`.)
- **Real GenVM state has to be `latest-final`ized before a fresh read reflects it** — a write's own `status_name: 'ACCEPTED'` from `genlayer write`/`writeContract` means consensus was reached (possibly on an *error*, if the call reverted), not that the call itself succeeded. Check `genvm_result`/`leader_receipt[].result` on the receipt, not just the top-level status, when debugging a write that "succeeded" but left no visible state change.

## Community
- **[Discord](https://discord.gg/8Jm4v89VAu)**: Discussions, support, and announcements
- **[Telegram](https://t.me/genlayer)**: Informal chats and quick updates

## Documentation
For detailed information, see the [GenLayer documentation](https://docs.genlayer.com/).

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
