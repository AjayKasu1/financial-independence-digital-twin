import type { AuditChainVerification, AuditEventDto, ComplianceDecision } from "@fidt/contracts";

export function approvalBlockReason(
  decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES",
  attestation: boolean,
  complianceStatus: ComplianceDecision["status"]
): string | null {
  if (decision !== "APPROVE") return null;
  if (!attestation) return "Approval requires the human-review attestation";
  if (complianceStatus !== "APPROVE") {
    return `Approval is blocked while the stored compliance status is ${complianceStatus}`;
  }
  return null;
}

export async function auditEventHash(event: {
  readonly id: string;
  readonly householdId: string;
  readonly actorType: AuditEventDto["actorType"];
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly previousHash: string | null;
}): Promise<string> {
  const canonical = JSON.stringify({
    id: event.id,
    householdId: event.householdId,
    actorType: event.actorType,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
    previousHash: event.previousHash
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyAuditChain(
  eventsOldestFirst: readonly AuditEventDto[],
  now = new Date()
): Promise<AuditChainVerification> {
  if (eventsOldestFirst.length === 0) {
    return {
      status: "EMPTY",
      verifiedEvents: 0,
      totalEvents: 0,
      verifiedAt: now.toISOString()
    };
  }

  let previousHash: string | null = null;
  let verifiedEvents = 0;
  for (const event of eventsOldestFirst) {
    const expectedHash = await auditEventHash(event);
    if (event.previousHash !== previousHash || event.eventHash !== expectedHash) {
      return {
        status: "FAILED",
        verifiedEvents,
        totalEvents: eventsOldestFirst.length,
        firstInvalidEventId: event.id,
        verifiedAt: now.toISOString()
      };
    }
    verifiedEvents += 1;
    previousHash = event.eventHash;
  }

  return {
    status: "VERIFIED",
    verifiedEvents,
    totalEvents: eventsOldestFirst.length,
    verifiedAt: now.toISOString()
  };
}
