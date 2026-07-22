import { describe, expect, it } from "vitest";
import type { AuditEventDto } from "@fidt/contracts";
import { approvalBlockReason, auditEventHash, verifyAuditChain } from "../src/governance";

async function event(
  id: string,
  previousHash: string | null,
  overrides: Partial<AuditEventDto> = {}
): Promise<AuditEventDto> {
  const base = {
    id,
    householdId: "household-demo",
    actorType: "SYSTEM" as const,
    actorId: "policy-v1",
    action: "COMPLIANCE_CHECK_COMPLETED",
    entityType: "recommendation",
    entityId: "recommendation-demo",
    occurredAt: "2026-07-22T15:00:00.000Z",
    metadata: { status: "APPROVE" },
    previousHash,
    ...overrides
  };
  return { ...base, eventHash: await auditEventHash(base) };
}

describe("governance invariants", () => {
  it("requires both attestation and stored policy approval", () => {
    expect(approvalBlockReason("APPROVE", false, "APPROVE")).toContain("attestation");
    expect(approvalBlockReason("APPROVE", true, "REQUIRE_CHANGES")).toContain("REQUIRE_CHANGES");
    expect(approvalBlockReason("APPROVE", true, "ESCALATE")).toContain("ESCALATE");
    expect(approvalBlockReason("APPROVE", true, "APPROVE")).toBeNull();
    expect(approvalBlockReason("REQUEST_CHANGES", false, "REQUIRE_CHANGES")).toBeNull();
  });

  it("recomputes every event hash and previous-hash link", async () => {
    const first = await event("audit-1", null);
    const second = await event("audit-2", first.eventHash, {
      action: "HUMAN_REVIEW_RECORDED",
      actorType: "USER",
      actorId: "advisor-demo"
    });
    const verified = await verifyAuditChain([first, second], new Date("2026-07-22T16:00:00.000Z"));
    expect(verified).toMatchObject({
      status: "VERIFIED",
      verifiedEvents: 2,
      totalEvents: 2
    });

    const tampered = { ...second, metadata: { status: "REJECT" } };
    const failed = await verifyAuditChain([first, tampered]);
    expect(failed).toMatchObject({
      status: "FAILED",
      verifiedEvents: 1,
      firstInvalidEventId: second.id
    });
  });

  it("reports an empty chain without claiming verification", async () => {
    await expect(verifyAuditChain([])).resolves.toMatchObject({
      status: "EMPTY",
      verifiedEvents: 0,
      totalEvents: 0
    });
  });
});
