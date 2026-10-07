# Verdict v2 reproduction log

Live run of `scripts/demo.mjs` on GenLayer Studio, 2026-10-07, against contract
[`0x3062BB83400b3F1a2A07854390c823D034B4E570`](https://explorer-studio.genlayer.com/address/0x3062BB83400b3F1a2A07854390c823D034B4E570). The deployed code is byte-identical to
`contracts/verdict.py` (`node scripts/verify-code.mjs 0x3062BB83400b3F1a2A07854390c823D034B4E570` prints `identical (26993 bytes)`). The raw run, with every
hash, is in [`demo-run.json`](demo-run.json).

Accounts (throwaway, funded from the Studio faucet):

| Role | Address |
|---|---|
| agent "TransBot" | `0x3B84ba9fc32e5b13aef4Ac29AbB487c43932019d` |
| client-1 | `0x2D412b64bFcB28373b8fCF3ffEBa6aD450ACf38D` |
| client-2 | `0x46A3F782cb1721ea17460b58fCE3fA63EA7DDb52` |

TransBot registered these terms and bonded 10 GEN (a 0.01 GEN bond deposit below the minimum was refunded, not kept):

> TransBot translates documents from English to Turkish. Every order is delivered within 24 hours of payment as a
> human-reviewed file; if an order is late the client is refunded.

The evidence pages are labelled DEMO records in [`docs/demo-evidence`](https://github.com/bars26/genlayer-verdict/tree/main/docs/demo-evidence); validators fetched them from GitHub
during adjudication like any other public page.

## The four disputes

| Dispute | Client's claim and evidence | Agent's answer | Ruling | Settlement |
|---|---|---|---|---|
| `dispute_0` | client-1: order 1001 paid, nothing delivered after 48 h ([order-1001](https://github.com/bars26/genlayer-verdict/blob/main/docs/demo-evidence/order-1001.md)); asks 3 GEN | "delayed because of a backlog", no evidence | **UPHELD** (`judged`) | the agent accepts early: client-1 gets the 0.5 GEN stake back + **3 GEN from the bond** |
| `dispute_1` | client-2: order 1002 never delivered, linking [order-1002](https://github.com/bars26/genlayer-verdict/blob/main/docs/demo-evidence/order-1002.md), which actually shows delivery in 8 h 40 min; asks 2 GEN | delivered and confirmed, with the [delivery receipt](https://github.com/bars26/genlayer-verdict/blob/main/docs/demo-evidence/delivery-1002.md) | **DISMISSED** (`judged`) | client-2 contests with another 0.5 GEN; the independent re-assessment is again DISMISSED; both stakes (1 GEN) go to the agent |
| `dispute_2` | client-2: "poor machine translation", linking `https://example.com/`, a page with nothing to do with TransBot | "unrelated to TransBot" | **INSUFFICIENT_EVIDENCE** (`judged`) | the stake goes back; nobody is penalised |
| `dispute_3` | client-1: refund ignored for order 1003, linking a page that does not exist; asks 1 GEN | "no order 1003 in our records" | **INSUFFICIENT_EVIDENCE** (`evidence_unreachable`, decided in code; the model was never asked) | the stake goes back; the 1 GEN reserved from the bond is released |

## Integrator view after the four disputes

`trust_summary(agent)`: registered, bond 7 GEN, available 7 GEN, 1 upheld, 1 dismissed, 2 insufficient, 0 open,
3 GEN compensation paid. `is_trusted(agent, 5 GEN, 0)` is **false** (one upheld dispute);
`is_trusted(agent, 5 GEN, 1)` is **true**.

## Unbonding

The agent requested a 2 GEN withdrawal, waited out the 600-second notice period (during which the GEN stayed claimable by
disputes and was excluded from `available_bond`), then withdrew it.

## Balances

| Account | Before | After | Arithmetic |
|---|---|---|---|
| agent | 50.00 | **43.00** | −10 bond +0.5 (dispute_1 stake) +0.5 (dispute_1 contest stake) +2 withdrawn |
| client-1 | 50.00 | **53.00** | dispute_0: −0.5 +0.5 +3 compensation; dispute_3: −0.5 +0.5 |
| client-2 | 50.00 | **49.00** | dispute_1: −0.5 −0.5 (lost the contest); dispute_2: −0.5 +0.5 |
| contract | 0 | **5.00** | exactly the agent's remaining bond (10 − 3 compensation − 2 withdrawn) |

Transfers are emitted on finalization, so the agent's and contract's balances settled about ten seconds after the last
call.

## Wallet test from the app

Done from the live app with MetaMask (wallet `0x4F80B5c475fcEd34fc9A07FfCcF39E1Adc1406bf`), both as an agent and as a
client:

| Step | Tx | Result |
|---|---|---|
| register the wallet as agent "bars1" with written terms | [`0x342f24ae…71ed53`](https://explorer-studio.genlayer.com/tx/0x342f24aed3a618ef99a0552b6eeb49b512cd3665d576010ce4467904bb71ed53) | FINALIZED, SUCCESS |
| post a 2 GEN bond | [`0x440c7580…61cd17`](https://explorer-studio.genlayer.com/tx/0x440c7580ff0744758e6cf54c90634490529359e7e68cf2e9b9c65a1be061cd17) | bars1 bond 2 GEN |
| file `dispute_4` against TransBot (order 1001 evidence), 0.5 GEN stake, 1 GEN compensation asked | [`0xdb22323c…ff2f54`](https://explorer-studio.genlayer.com/tx/0xdb22323ca68ad991e933132936139b23adfd22c2f16c58724bad3fb031ff2f54) | 1 GEN reserved from TransBot's bond |
| after the response window, "Ask validators to rule" | [`0x03a2edf1…39092d`](https://explorer-studio.genlayer.com/tx/0x03a2edf1dbf114c75e73bd0c7cf1443d3399306e873722bb23e19f91d439092d) | **UPHELD** (`judged`) |
| after the contest window, "Settle" | [`0x899e342c…2075c2`](https://explorer-studio.genlayer.com/tx/0x899e342c50f592e9e50859f123c2e5756c69111fc33b2eab47f92024502075c2) | 1.5 GEN to the client: stake + 1 GEN compensation |

The wallet went from 443.78 to **445.28 GEN** once the transfer finalized; TransBot's bond fell from 5 to 4 GEN (4 GEN
compensation paid in total, 2 upheld disputes), and the contract holds exactly the two agents' bonds: 4 + 2 = **6 GEN**.

## Every transaction

All ACCEPTED by validator consensus with contract execution SUCCESS.

| Who | Call | GEN | Status | Execution | Returned | Tx |
|---|---|---|---|---|---|---|
| agent | `register_agent("TransBot", "TransBot translates documents from Engl, "https://transbot.example/api")` |  | ACCEPTED | SUCCESS |  | [`0x25acb3f5…2f2768`](https://explorer-studio.genlayer.com/tx/0x25acb3f529317833000db515161cee063386dbe64db0dbbe35473361e22f2768) |
| agent | `post_bond()` | 10 | ACCEPTED | SUCCESS | bonded | [`0x2423a304…448040`](https://explorer-studio.genlayer.com/tx/0x2423a304ebd379a771a41c0f5a4db43873997a0f16c9b27908129493b7448040) |
| agent | `post_bond()` | 0.01 | ACCEPTED | SUCCESS | REFUNDED: A bond deposit must be at least 0.1 GEN | [`0x9a421a81…a762e5`](https://explorer-studio.genlayer.com/tx/0x9a421a81418ea46293a87b1188ba8ad8cfc75aa0a28ba747784c562745a762e5) |
| client-1 | `file_dispute("0x3B84ba9fc32e5b13aef4Ac29AbB487c439320, "TransBot took payment for order 1001 on, "https://raw.githubusercontent.com/bars2, 3 GEN)` | 0.5 | ACCEPTED | SUCCESS | dispute_0 | [`0x2c9f80ff…2fcbf8`](https://explorer-studio.genlayer.com/tx/0x2c9f80ffec0b9d7aeb779c5cda88a7d23fd3443dbe75b0b5785a7833712fcbf8) |
| agent | `respond("dispute_0", "Order 1001 was delayed because of a bac, "")` |  | ACCEPTED | SUCCESS |  | [`0x622fd93b…c6523a`](https://explorer-studio.genlayer.com/tx/0x622fd93b40d9a174695b12f8443c0cc0a88578aea56f75825ca05630acc6523a) |
| client-1 | `resolve("dispute_0")` |  | ACCEPTED | SUCCESS | UPHELD | [`0x18988f23…e7ff5e`](https://explorer-studio.genlayer.com/tx/0x18988f234ddb83b982540f00272499628395dd75230695a418e5ced98be7ff5e) |
| agent | `settle("dispute_0")` |  | ACCEPTED | SUCCESS | {"compensation":"3000000000000000000""to_agent":"0""to_filer":"3500000000000000000"} | [`0x6e2e6836…cb27c6`](https://explorer-studio.genlayer.com/tx/0x6e2e683674921f684152d1118a375b121c3fd4dbcdb8b144229bb09268cb27c6) |
| client-2 | `file_dispute("0x3B84ba9fc32e5b13aef4Ac29AbB487c439320, "TransBot never delivered order 1002 (pr, "https://raw.githubusercontent.com/bars2, 2 GEN)` | 0.5 | ACCEPTED | SUCCESS | dispute_1 | [`0xebd5eba8…1a6ed5`](https://explorer-studio.genlayer.com/tx/0xebd5eba838bea26b6da072b6064cc55b8e130a5ac7f712aca75f4f61801a6ed5) |
| agent | `respond("dispute_1", "Order 1002 was delivered 8 hours 40 min, "https://raw.githubusercontent.com/bars2)` |  | ACCEPTED | SUCCESS |  | [`0xcf0e7e76…96e338`](https://explorer-studio.genlayer.com/tx/0xcf0e7e762641702c63a2d24561f43d21a471c705bbbbb79b4afd01fa1596e338) |
| client-2 | `resolve("dispute_1")` |  | ACCEPTED | SUCCESS | DISMISSED | [`0x14c66edd…35e460`](https://explorer-studio.genlayer.com/tx/0x14c66edda1e9a74ee922cab06fb53a3efc4fc6480e6c97d9e09a28e2de35e460) |
| client-2 | `contest("dispute_1")` | 0.5 | ACCEPTED | SUCCESS | DISMISSED | [`0x8074f249…c71037`](https://explorer-studio.genlayer.com/tx/0x8074f24964f5036ee51cc0195e5145369117ace6fbe1abe22e3f94bf20c71037) |
| client-1 | `settle("dispute_1")` |  | ACCEPTED | SUCCESS | {"compensation":"0""to_agent":"1000000000000000000""to_filer":"0"} | [`0xd5fbcf5b…7ad78b`](https://explorer-studio.genlayer.com/tx/0xd5fbcf5b86943e710b4a31112ffc9f7861b5d61abada65f0f4b7c6664b7ad78b) |
| client-2 | `file_dispute("0x3B84ba9fc32e5b13aef4Ac29AbB487c439320, "TransBot delivered a poor machine trans, "https://example.com/", 0 GEN)` | 0.5 | ACCEPTED | SUCCESS | dispute_2 | [`0x20c243b3…f969aa`](https://explorer-studio.genlayer.com/tx/0x20c243b32cc00d616d39bf2f10c9c9a3f5f6e8c6b9f86f5c7f9faf6a56f969aa) |
| agent | `respond("dispute_2", "This page is unrelated to TransBot or a, "")` |  | ACCEPTED | SUCCESS |  | [`0x17d6b45e…564ff5`](https://explorer-studio.genlayer.com/tx/0x17d6b45e22521711fd5794e762743b80c92c1e66e8bf51b39fd1028a94564ff5) |
| client-2 | `resolve("dispute_2")` |  | ACCEPTED | SUCCESS | INSUFFICIENT_EVIDENCE | [`0xa392793d…ae3b61`](https://explorer-studio.genlayer.com/tx/0xa392793d40311aebf031d9740f765336c9f841a1486ade23d42b3031adae3b61) |
| client-2 | `settle("dispute_2")` |  | ACCEPTED | SUCCESS | {"compensation":"0""to_agent":"0""to_filer":"500000000000000000"} | [`0xf31d526f…696107`](https://explorer-studio.genlayer.com/tx/0xf31d526f7168239824a7cbf799041e0987366a3a8c5ac16162403bac9f696107) |
| client-1 | `file_dispute("0x3B84ba9fc32e5b13aef4Ac29AbB487c439320, "TransBot ignored my refund request for , "https://raw.githubusercontent.com/bars2, 1 GEN)` | 0.5 | ACCEPTED | SUCCESS | dispute_3 | [`0xa8884d08…9183b9`](https://explorer-studio.genlayer.com/tx/0xa8884d081100437a2cbcea11043094c70f7feb4a33f44a31dcf3d979eb9183b9) |
| agent | `respond("dispute_3", "There is no order 1003 in our records.", "")` |  | ACCEPTED | SUCCESS |  | [`0x00645881…e200e2`](https://explorer-studio.genlayer.com/tx/0x006458810d4723e758e40f019454c1867336361a4a03f586dd7b7c47a4e200e2) |
| client-1 | `resolve("dispute_3")` |  | ACCEPTED | SUCCESS | INSUFFICIENT_EVIDENCE | [`0x34e48860…d6fb10`](https://explorer-studio.genlayer.com/tx/0x34e48860e881410157e44d3bcc4e593c757d1249cae80c4237d60d8248d6fb10) |
| client-1 | `settle("dispute_3")` |  | ACCEPTED | SUCCESS | {"compensation":"0""to_agent":"0""to_filer":"500000000000000000"} | [`0xe98b35b8…4072b3`](https://explorer-studio.genlayer.com/tx/0xe98b35b89e641e242bee5d3b26202275e6c708fcf57987b52074de62384072b3) |
| agent | `request_withdrawal(2 GEN)` |  | ACCEPTED | SUCCESS |  | [`0x26a97de1…9a2194`](https://explorer-studio.genlayer.com/tx/0x26a97de1f3b051dd122c13fec5f2c6b76170bdbeda060d339932b5cbef9a2194) |
| agent | `complete_withdrawal()` |  | ACCEPTED | SUCCESS | 2000000000000000000 | [`0xa4a26147…70924d`](https://explorer-studio.genlayer.com/tx/0xa4a2614713c0240755ef15960c6c823593e56cb532d6ae5104cb5d795e70924d) |
