# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Dispute:
    id: str
    agent: Address
    filer: Address
    claim: str
    evidence_url: str
    status: str
    reasoning: str


@allow_storage
@dataclass
class AgentRecord:
    address: Address
    disputes_filed: u256
    disputes_upheld: u256
    disputes_dismissed: u256


class Verdict(gl.Contract):
    disputes: TreeMap[str, Dispute]
    agents: TreeMap[Address, AgentRecord]
    dispute_count: u256

    def __init__(self):
        self.dispute_count = u256(0)

    def _to_address(self, value) -> Address:
        # Public method arguments that represent an address are declared as
        # `str` (not `Address`) because genlayer-js's calldata encoder has
        # no public way to construct an address-typed argument — it always
        # sends plain JS strings as TYPE_STR, so an `Address`-typed
        # parameter would reject every call the frontend makes. The
        # `genlayer` CLI, on the other hand, auto-detects hex-looking
        # `--args` values and pre-encodes them as addresses regardless of
        # the declared schema type. This helper accepts either shape so
        # both callers work: an already-decoded `Address` is used as-is,
        # a `str` is wrapped.
        if isinstance(value, Address):
            return value
        return Address(value)

    def _get_or_create_agent(self, agent: Address) -> AgentRecord:
        if agent not in self.agents:
            self.agents[agent] = AgentRecord(
                address=agent,
                disputes_filed=u256(0),
                disputes_upheld=u256(0),
                disputes_dismissed=u256(0),
            )
        return self.agents[agent]

    def _verify_claim(self, claim: str, evidence_url: str) -> bool:
        def get_verdict() -> str:
            web_data = gl.nondet.web.render(evidence_url, mode="text")

            verdict = gl.nondet.exec_prompt(
                f"""
A dispute has been filed against an AI agent. The claim describes what
the agent allegedly promised versus what it actually delivered:

Claim:
{claim}

Evidence content fetched from the submitted URL:
{web_data}

Decide whether the evidence demonstrates the claim is true — that is,
whether the agent's promise was actually broken as described.
Respond in JSON:
{{
    "upheld": bool
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
""",
                response_format="json",
            )
            upheld = verdict.get("upheld")
            # Require an actual JSON boolean rather than coercing arbitrary
            # values with bool(...): a malformed response like
            # {"upheld": "false"} would coerce to True under Python
            # truthiness (any non-empty string is truthy), silently turning
            # a dismissal into an upheld dispute.
            if not isinstance(upheld, bool):
                raise gl.vm.UserError(
                    "LLM response 'upheld' field must be a JSON boolean"
                )
            return json.dumps({"upheld": upheld}, sort_keys=True)

        result_json = json.loads(gl.eq_principle.strict_eq(get_verdict))
        upheld = result_json["upheld"]
        if not isinstance(upheld, bool):
            raise gl.vm.UserError("Equivalence-checked verdict was not a boolean")
        return upheld

    @gl.public.write
    def file_dispute(self, agent: str, claim: str, evidence_url: str) -> str:
        agent_addr = self._to_address(agent)
        if agent_addr == gl.message.sender_address:
            raise gl.vm.UserError("Cannot file a dispute against yourself")
        if not claim.strip():
            raise gl.vm.UserError("Claim cannot be empty")
        if not evidence_url.strip():
            raise gl.vm.UserError("Evidence URL cannot be empty")

        dispute_id = f"dispute_{int(self.dispute_count)}"
        self.dispute_count = u256(int(self.dispute_count) + 1)

        self.disputes[dispute_id] = Dispute(
            id=dispute_id,
            agent=agent_addr,
            filer=gl.message.sender_address,
            claim=claim,
            evidence_url=evidence_url,
            status="pending",
            reasoning="",
        )

        record = self._get_or_create_agent(agent_addr)
        record.disputes_filed = u256(int(record.disputes_filed) + 1)

        return dispute_id

    @gl.public.write
    def resolve_dispute(self, dispute_id: str) -> bool:
        dispute = self.disputes[dispute_id]
        if dispute.status != "pending":
            raise gl.vm.UserError("Dispute has already been resolved")

        upheld = self._verify_claim(dispute.claim, dispute.evidence_url)
        record = self._get_or_create_agent(dispute.agent)

        if upheld:
            dispute.status = "upheld"
            dispute.reasoning = (
                "Validators agreed the evidence shows the claim is true — "
                "the agent's promise was broken."
            )
            record.disputes_upheld = u256(int(record.disputes_upheld) + 1)
        else:
            dispute.status = "dismissed"
            dispute.reasoning = (
                "Validators agreed the evidence does not support the claim — "
                "the dispute is dismissed."
            )
            record.disputes_dismissed = u256(int(record.disputes_dismissed) + 1)

        return upheld

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> Dispute:
        return self.disputes[dispute_id]

    @gl.public.view
    def get_agent_record(self, agent: str) -> AgentRecord:
        agent_addr = self._to_address(agent)
        if agent_addr in self.agents:
            return self.agents[agent_addr]
        return AgentRecord(
            address=agent_addr,
            disputes_filed=u256(0),
            disputes_upheld=u256(0),
            disputes_dismissed=u256(0),
        )

    @gl.public.view
    def list_disputes_by_agent(self, agent: str) -> list:
        agent_addr = self._to_address(agent)
        return [d for d in self.disputes.values() if d.agent == agent_addr]

    @gl.public.view
    def list_pending_disputes(self) -> list:
        return [d for d in self.disputes.values() if d.status == "pending"]
