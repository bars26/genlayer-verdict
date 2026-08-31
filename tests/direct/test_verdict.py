"""Direct-mode tests for the Verdict contract."""

from tests.direct.conftest import to_hex

CONTRACT_PATH = "contracts/verdict.py"

BOB_HEX = "0x81b637d8fCD2C6da6359E6963113a1170de795e4"
CHARLIE_HEX = "0x567865452AfC3BDE935532f851D8952eDb6c8a8D"


def test_file_dispute_creates_pending_dispute(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    dispute_id = contract.file_dispute(
        BOB_HEX,
        "Agent promised a data export by Friday, delivered nothing.",
        "https://example.com/proof",
    )

    dispute = contract.get_dispute(dispute_id)
    assert dispute.status == "pending"
    assert dispute.claim == "Agent promised a data export by Friday, delivered nothing."
    assert dispute.evidence_url == "https://example.com/proof"

    record = contract.get_agent_record(BOB_HEX)
    assert int(record.disputes_filed) == 1
    assert int(record.disputes_upheld) == 0
    assert int(record.disputes_dismissed) == 0


def test_file_dispute_rejects_empty_claim(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("Claim cannot be empty"):
        contract.file_dispute(BOB_HEX, "   ", "https://example.com/proof")


def test_file_dispute_rejects_empty_evidence_url(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("Evidence URL cannot be empty"):
        contract.file_dispute(BOB_HEX, "Some claim", "   ")


def test_file_dispute_rejects_disputing_yourself(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    alice_addr = to_hex(direct_alice)

    with direct_vm.expect_revert("Cannot file a dispute against yourself"):
        contract.file_dispute(alice_addr, "Some claim", "https://example.com/proof")


def test_resolve_dispute_upholds_with_true_verdict(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "No delivery was made."})
    direct_vm.mock_llm(r".*", '{"upheld": true}')

    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    dispute_id = contract.file_dispute(
        BOB_HEX, "Agent promised delivery, never delivered.", "https://example.com/proof"
    )

    result = contract.resolve_dispute(dispute_id)
    assert result is True

    dispute = contract.get_dispute(dispute_id)
    assert dispute.status == "upheld"
    assert "broken" in dispute.reasoning.lower()

    record = contract.get_agent_record(BOB_HEX)
    assert int(record.disputes_upheld) == 1
    assert int(record.disputes_dismissed) == 0


def test_resolve_dispute_dismisses_with_false_verdict(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Delivery confirmed on time."})
    direct_vm.mock_llm(r".*", '{"upheld": false}')

    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    dispute_id = contract.file_dispute(
        BOB_HEX, "Agent never delivered.", "https://example.com/proof"
    )

    result = contract.resolve_dispute(dispute_id)
    assert result is False

    dispute = contract.get_dispute(dispute_id)
    assert dispute.status == "dismissed"

    record = contract.get_agent_record(BOB_HEX)
    assert int(record.disputes_upheld) == 0
    assert int(record.disputes_dismissed) == 1


def test_resolve_dispute_rejects_non_boolean_upheld_field(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """A malformed LLM response like {"upheld": "false"} (a string, not a
    JSON bool) must not be coerced by Python truthiness — it should be
    rejected outright rather than silently upholding the dispute."""
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Some content."})
    direct_vm.mock_llm(r".*", '{"upheld": "false"}')

    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    dispute_id = contract.file_dispute(BOB_HEX, "Some claim.", "https://example.com/proof")

    with direct_vm.expect_revert("must be a JSON boolean"):
        contract.resolve_dispute(dispute_id)

    dispute = contract.get_dispute(dispute_id)
    assert dispute.status == "pending"

    record = contract.get_agent_record(BOB_HEX)
    assert int(record.disputes_upheld) == 0
    assert int(record.disputes_dismissed) == 0


def test_resolve_dispute_rejects_already_resolved(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Content."})
    direct_vm.mock_llm(r".*", '{"upheld": true}')

    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)
    dispute_id = contract.file_dispute(BOB_HEX, "Claim.", "https://example.com/proof")
    contract.resolve_dispute(dispute_id)

    with direct_vm.expect_revert("already been resolved"):
        contract.resolve_dispute(dispute_id)


def test_get_agent_record_returns_zero_record_for_unknown_agent(
    direct_vm, direct_deploy, direct_alice
):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    record = contract.get_agent_record(BOB_HEX)
    assert int(record.disputes_filed) == 0
    assert int(record.disputes_upheld) == 0
    assert int(record.disputes_dismissed) == 0


def test_list_disputes_by_agent_filters_correctly(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    contract.file_dispute(BOB_HEX, "Claim 1", "https://example.com/proof1")
    contract.file_dispute(CHARLIE_HEX, "Claim 2", "https://example.com/proof2")
    contract.file_dispute(BOB_HEX, "Claim 3", "https://example.com/proof3")

    bob_disputes = contract.list_disputes_by_agent(BOB_HEX)
    assert len(bob_disputes) == 2

    charlie_disputes = contract.list_disputes_by_agent(CHARLIE_HEX)
    assert len(charlie_disputes) == 1


def test_list_pending_disputes_excludes_resolved(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "Content."})
    direct_vm.mock_llm(r".*", '{"upheld": true}')

    direct_vm.sender = direct_alice
    contract = direct_deploy(CONTRACT_PATH)

    d1 = contract.file_dispute(BOB_HEX, "Claim 1", "https://example.com/proof1")
    contract.file_dispute(BOB_HEX, "Claim 2", "https://example.com/proof2")

    assert len(contract.list_pending_disputes()) == 2

    contract.resolve_dispute(d1)

    assert len(contract.list_pending_disputes()) == 1
