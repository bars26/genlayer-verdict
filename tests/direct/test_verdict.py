"""Direct-mode tests for Verdict v2: bonded agents and two-sided adjudication."""

import json

import pytest

from tests.direct.conftest import to_hex

CONTRACT_PATH = "contracts/verdict.py"
GEN = 10**18
STAKE = GEN // 2
TERMS = "Translates documents from English to Turkish within 24 hours of payment, with no machine-translation artefacts."
CLAIM = "The agent took payment for a translation on Monday and delivered nothing by Wednesday."
EVIDENCE = "https://example.com/order-1234"
COUNTER = "https://example.com/delivery-1234"


def _web(direct_vm, evidence="Order 1234: paid Monday, no delivery recorded by Wednesday.", counter="Delivery 1234: file sent Tuesday 10:02."):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*example\.com/order.*", {"status": 200, "body": evidence})
    direct_vm.mock_web(r".*example\.com/delivery.*", {"status": 200, "body": counter})


def _llm(direct_vm, verdict):
    direct_vm.mock_llm(r".*", json.dumps({"verdict": verdict}))


def _expire(contract, dispute_id, field):
    setattr(contract.disputes[dispute_id], field, "2000-01-01T00:00:00+00:00")


def _setup(direct_vm, direct_deploy, agent, bond=5 * GEN, register=True):
    contract = direct_deploy(CONTRACT_PATH)
    if register:
        direct_vm.sender = agent
        contract.register_agent("TransBot", TERMS, "https://transbot.example/api")
        if bond:
            direct_vm.value = bond
            assert contract.post_bond() == "bonded"
            direct_vm.value = 0
    return contract


def _file(direct_vm, contract, filer, agent, requested=0, stake=STAKE, claim=CLAIM, url=EVIDENCE):
    direct_vm.sender = filer
    direct_vm.value = stake
    result = contract.file_dispute(to_hex(agent), claim, url, requested)
    direct_vm.value = 0
    return result


def _ruled(direct_vm, contract, filer, agent, verdict, requested=0, respond=True):
    dispute_id = _file(direct_vm, contract, filer, agent, requested)
    if respond:
        direct_vm.sender = agent
        contract.respond(dispute_id, "The translation was delivered on Tuesday, see the log.", COUNTER)
    _web(direct_vm)
    _llm(direct_vm, verdict)
    direct_vm.sender = filer
    assert contract.resolve(dispute_id) == verdict
    return dispute_id


# --- agents and bonds ---------------------------------------------------------


def test_register_and_bond(direct_vm, direct_deploy, direct_alice):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    agent = contract.get_agent(to_hex(direct_alice))
    assert agent.registered and agent.name == "TransBot" and agent.terms == TERMS
    assert int(agent.bond) == 5 * GEN
    assert contract.list_agents() == [to_hex(direct_alice)]
    assert [h["event"] for h in json.loads(agent.history_json)] == ["registered", "bonded"]


@pytest.mark.parametrize(
    "name, terms, endpoint, error",
    [
        ("", TERMS, "", "name must be 1 to 80 characters"),
        ("Bot", "too short", "", "terms must be 20 to 1500 characters"),
        ("Bot", TERMS, "http://insecure.example", "endpoint must be an https URL"),
    ],
)
def test_register_validation(direct_vm, direct_deploy, direct_alice, name, terms, endpoint, error):
    contract = direct_deploy(CONTRACT_PATH)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert(error):
        contract.register_agent(name, terms, endpoint)


def test_bond_needs_registration_and_minimum(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice, bond=0)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    assert contract.post_bond().startswith("REFUNDED: Register the agent")
    direct_vm.sender = direct_alice
    direct_vm.value = GEN // 100
    assert contract.post_bond().startswith("REFUNDED: A bond deposit must be at least 0.1 GEN")
    direct_vm.value = 0
    assert int(contract.get_agent(to_hex(direct_alice)).bond) == 0


def test_terms_update_does_not_change_filed_disputes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice)
    direct_vm.sender = direct_alice
    contract.register_agent("TransBot", "Now promises nothing in particular about delivery times.", "")
    assert contract.get_dispute(dispute_id).terms_snapshot == TERMS
    assert json.loads(contract.get_agent(to_hex(direct_alice)).history_json)[-1]["event"] == "terms_updated"


def test_withdrawal_waits_and_respects_reserved_bond(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    _file(direct_vm, contract, direct_bob, direct_alice, requested=2 * GEN)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("amount exceeds the bond that is not reserved"):
        contract.request_withdrawal(4 * GEN)
    contract.request_withdrawal(3 * GEN)
    with direct_vm.expect_revert("The unbonding notice period has not ended"):
        contract.complete_withdrawal()
    assert contract.trust_summary(to_hex(direct_alice))["available_bond"] == "0"
    contract.agents[contract.get_agent(to_hex(direct_alice)).address].withdrawal_at = "2000-01-01T00:00:00+00:00"
    assert contract.complete_withdrawal() == str(3 * GEN)
    agent = contract.get_agent(to_hex(direct_alice))
    assert int(agent.bond) == 2 * GEN and int(agent.locked) == 2 * GEN and int(agent.withdrawal_pending) == 0


# --- filing -------------------------------------------------------------------


def test_file_dispute_reserves_compensation(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice, requested=2 * GEN)
    assert dispute_id == "dispute_0"
    dispute = contract.get_dispute(dispute_id)
    assert dispute.state == "open" and int(dispute.stake) == STAKE and int(dispute.requested) == 2 * GEN
    assert dispute.terms_snapshot == TERMS
    assert int(contract.get_agent(to_hex(direct_alice)).locked) == 2 * GEN
    assert contract.list_disputes_by_agent(to_hex(direct_alice)) == ["dispute_0"]


@pytest.mark.parametrize(
    "kwargs, reason",
    [
        ({"stake": STAKE - 1}, "A dispute needs a stake of at least 0.5 GEN"),
        ({"claim": "too short"}, "claim must be 20 to 1000 characters"),
        ({"url": "http://example.com/x"}, "evidence must be a public https URL"),
        ({"url": "javascript:alert(1)"}, "evidence must be a public https URL"),
        ({"requested": 6 * GEN}, "requested compensation exceeds the agent's unreserved bond"),
    ],
)
def test_invalid_disputes_are_refunded(direct_vm, direct_deploy, direct_alice, direct_bob, kwargs, reason):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    result = _file(direct_vm, contract, direct_bob, direct_alice, **kwargs)
    assert result.startswith(f"REFUNDED: {reason}")
    assert contract.list_disputes() == []
    assert int(contract.get_agent(to_hex(direct_alice)).locked) == 0


def test_cannot_dispute_yourself_or_claim_from_unregistered(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    assert _file(direct_vm, contract, direct_alice, direct_alice).startswith("REFUNDED: You cannot file a dispute against yourself")
    assert _file(direct_vm, contract, direct_alice, direct_bob, requested=GEN).startswith(
        "REFUNDED: Compensation can only be claimed from a registered"
    )
    # Unregistered agents can still be disputed, without compensation.
    assert _file(direct_vm, contract, direct_alice, direct_bob) == "dispute_0"
    assert contract.get_dispute("dispute_0").terms_snapshot == ""


# --- responding and ruling ----------------------------------------------------


def test_agent_responds_once_within_window(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only the disputed agent can respond"):
        contract.respond(dispute_id, "I am not the agent but I answer.", "")
    direct_vm.sender = direct_alice
    contract.respond(dispute_id, "Delivered on Tuesday, see the log.", COUNTER)
    with direct_vm.expect_revert("This dispute can no longer be answered"):
        contract.respond(dispute_id, "A second answer.", "")
    dispute = contract.get_dispute(dispute_id)
    assert dispute.responded and dispute.counter_evidence_url == COUNTER


def test_response_window_closes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice)
    _expire(contract, dispute_id, "filed_at")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("The response window has closed"):
        contract.respond(dispute_id, "Too late to answer now.", "")


def test_resolve_waits_for_response_or_window(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice)
    _web(direct_vm)
    _llm(direct_vm, "UPHELD")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("The agent's response window is still open"):
        contract.resolve(dispute_id)
    _expire(contract, dispute_id, "filed_at")  # the agent stayed silent
    assert contract.resolve(dispute_id) == "UPHELD"
    dispute = contract.get_dispute(dispute_id)
    assert dispute.state == "ruled" and dispute.code == "judged"


@pytest.mark.parametrize("verdict", ["UPHELD", "DISMISSED", "INSUFFICIENT_EVIDENCE"])
def test_llm_verdicts(direct_vm, direct_deploy, direct_alice, direct_bob, verdict):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, verdict)
    assert contract.get_dispute(dispute_id).verdict == verdict


def test_unreachable_evidence_is_decided_in_code(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice, requested=GEN)
    _expire(contract, dispute_id, "filed_at")
    _web(direct_vm, evidence="")
    _llm(direct_vm, "UPHELD")  # never asked
    direct_vm.sender = direct_bob
    assert contract.resolve(dispute_id) == "INSUFFICIENT_EVIDENCE"
    assert contract.get_dispute(dispute_id).code == "evidence_unreachable"


def test_non_enum_llm_verdict_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _file(direct_vm, contract, direct_bob, direct_alice)
    _expire(contract, dispute_id, "filed_at")
    _web(direct_vm)
    _llm(direct_vm, "yes")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("LLM verdict must be one of UPHELD, DISMISSED, INSUFFICIENT_EVIDENCE"):
        contract.resolve(dispute_id)
    assert contract.get_dispute(dispute_id).state == "open"


# --- settlement ---------------------------------------------------------------


def test_upheld_pays_stake_and_compensation_from_bond(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "UPHELD", requested=2 * GEN)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("The contest window is still open"):
        contract.settle(dispute_id)
    direct_vm.sender = direct_alice  # the agent accepts the ruling
    payout = contract.settle(dispute_id)
    assert payout == {"to_filer": str(STAKE + 2 * GEN), "to_agent": "0", "compensation": str(2 * GEN)}
    agent = contract.get_agent(to_hex(direct_alice))
    assert int(agent.bond) == 3 * GEN and int(agent.locked) == 0 and int(agent.disputes_upheld) == 1
    assert int(agent.compensation_paid) == 2 * GEN
    assert contract.get_dispute(dispute_id).state == "settled"
    with direct_vm.expect_revert("Only a ruled dispute can be settled"):
        contract.settle(dispute_id)


def test_dismissed_pays_the_stake_to_the_agent(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "DISMISSED", requested=GEN)
    direct_vm.sender = direct_bob  # the filer accepts the ruling
    assert contract.settle(dispute_id) == {"to_filer": "0", "to_agent": str(STAKE), "compensation": "0"}
    agent = contract.get_agent(to_hex(direct_alice))
    assert int(agent.bond) == 5 * GEN and int(agent.locked) == 0 and int(agent.disputes_dismissed) == 1


def test_insufficient_evidence_refunds_everyone(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "INSUFFICIENT_EVIDENCE", requested=GEN)
    _expire(contract, dispute_id, "ruled_at")
    direct_vm.sender = direct_charlie  # anyone, after the window
    assert contract.settle(dispute_id) == {"to_filer": str(STAKE), "to_agent": "0", "compensation": "0"}
    agent = contract.get_agent(to_hex(direct_alice))
    assert int(agent.bond) == 5 * GEN and int(agent.disputes_insufficient) == 1


# --- contests -----------------------------------------------------------------


def test_agent_contests_and_wins(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "UPHELD", requested=2 * GEN)
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    assert contract.contest(dispute_id).startswith("REFUNDED: Only the side the ruling went against")
    _web(direct_vm)
    _llm(direct_vm, "DISMISSED")
    direct_vm.sender = direct_alice
    assert contract.contest(dispute_id) == "DISMISSED"
    direct_vm.value = 0
    dispute = contract.get_dispute(dispute_id)
    assert dispute.contested and dispute.contest_changed
    direct_vm.sender = direct_charlie  # after a contest anyone can settle
    assert contract.settle(dispute_id) == {"to_filer": "0", "to_agent": str(2 * STAKE), "compensation": "0"}
    assert int(contract.get_agent(to_hex(direct_alice)).bond) == 5 * GEN


def test_filer_contests_and_loses(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "DISMISSED")
    _web(direct_vm)
    _llm(direct_vm, "DISMISSED")
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    assert contract.contest(dispute_id) == "DISMISSED"
    assert contract.contest(dispute_id).startswith("REFUNDED: Only a ruled, uncontested dispute")
    direct_vm.value = 0
    assert not contract.get_dispute(dispute_id).contest_changed
    assert contract.settle(dispute_id) == {"to_filer": "0", "to_agent": str(2 * STAKE), "compensation": "0"}


def test_filer_contest_turns_dismissal_into_upheld(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "DISMISSED", requested=GEN)
    _web(direct_vm)
    _llm(direct_vm, "UPHELD")
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE
    assert contract.contest(dispute_id) == "UPHELD"
    direct_vm.value = 0
    assert contract.settle(dispute_id) == {"to_filer": str(2 * STAKE + GEN), "to_agent": "0", "compensation": str(GEN)}


def test_contest_rules(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "DISMISSED")
    direct_vm.sender = direct_bob
    direct_vm.value = STAKE - 1
    assert contract.contest(dispute_id).startswith("REFUNDED: A contest must stake at least")
    _expire(contract, dispute_id, "ruled_at")
    direct_vm.value = STAKE
    assert contract.contest(dispute_id).startswith("REFUNDED: The contest window has closed")
    assert contract.contest("dispute_9").startswith("REFUNDED: No dispute with id dispute_9")
    direct_vm.value = 0


# --- integrator views ---------------------------------------------------------


def test_trust_summary_and_is_trusted(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = _setup(direct_vm, direct_deploy, direct_alice)
    alice = to_hex(direct_alice)
    assert contract.is_trusted(alice, 5 * GEN, 0) is True
    dispute_id = _ruled(direct_vm, contract, direct_bob, direct_alice, "UPHELD", requested=2 * GEN)
    summary = contract.trust_summary(alice)
    assert summary["open"] == 1 and summary["locked"] == str(2 * GEN) and summary["available_bond"] == str(3 * GEN)
    assert contract.is_trusted(alice, 5 * GEN, 0) is False  # 2 GEN are reserved
    direct_vm.sender = direct_alice
    contract.settle(dispute_id)
    summary = contract.trust_summary(alice)
    assert summary["upheld"] == 1 and summary["open"] == 0 and summary["compensation_paid"] == str(2 * GEN)
    assert contract.is_trusted(alice, GEN, 0) is False  # one upheld dispute
    assert contract.is_trusted(alice, GEN, 1) is True
    assert contract.is_trusted(to_hex(direct_charlie), 0, 0) is False  # never registered
    assert contract.windows() == {"response_seconds": 600, "contest_seconds": 600, "unbond_seconds": 600, "min_stake": str(STAKE)}


def test_views_for_unknown_ids(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    with direct_vm.expect_revert("No dispute with id dispute_0"):
        contract.get_dispute("dispute_0")
    with direct_vm.expect_revert("agent must be a wallet address"):
        contract.get_agent("not-an-address")
    assert contract.list_disputes_by_agent(to_hex(direct_alice)) == []
    assert contract.get_agent(to_hex(direct_alice)).registered is False
