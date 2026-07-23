import { describe, expect, it } from "vitest";
import { demoClientConstitution, demoEvents, demoHousehold } from "@fidt/domain";
import { applyConfirmedEvidence, extractEvidenceDocument } from "../src/evidence";
import { buildOpportunityRadar } from "../src/opportunities";

describe("Advisor Opportunity Radar", () => {
  it("ranks opportunities deterministically and exposes evidence blockers", () => {
    const first = buildOpportunityRadar({
      household: demoHousehold,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [],
      latestPassportStatus: null,
      now: new Date("2026-07-23T12:00:00.000Z")
    });
    const second = buildOpportunityRadar({
      household: demoHousehold,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [],
      latestPassportStatus: null,
      now: new Date("2026-07-23T12:00:00.000Z")
    });

    expect(first).toEqual(second);
    expect(first.opportunities.map((opportunity) => opportunity.score)).toEqual(
      [...first.opportunities.map((opportunity) => opportunity.score)].sort(
        (left, right) => right - left
      )
    );
    const rsu = first.opportunities.find(
      (opportunity) => opportunity.category === "EQUITY_COMPENSATION"
    );
    expect(rsu).toMatchObject({
      evidence: { readiness: "BLOCKED" },
      action: { label: "Admit RSU evidence" }
    });
    expect(first.summary.evidenceBlocked).toBeGreaterThan(0);
  });

  it("re-ranks from the confirmed twin value and unlocks the strategy route", async () => {
    const extracted = await extractEvidenceDocument(
      demoHousehold.id,
      {
        documentType: "RSU_STATEMENT",
        fileName: "synthetic-rsu.txt",
        effectiveAt: "2026-07-23T14:00:00.000Z",
        content: `SYNTHETIC EQUITY AWARD STATEMENT
TICKER: ACME
UNVESTED VALUE: $305,000
NEXT VEST DATE: 2026-09-20
NEXT VEST VALUE: $82,000
WITHHOLDING RATE: 35%`
      },
      new Date("2026-07-23T14:01:00.000Z")
    );
    const confirmed = {
      ...extracted,
      status: "CONFIRMED" as const,
      confirmedAt: "2026-07-23T14:02:00.000Z",
      reviewerId: "advisor-demo",
      facts: extracted.facts.map((fact) => ({ ...fact, status: "CONFIRMED" as const }))
    };
    const household = applyConfirmedEvidence(
      demoHousehold,
      confirmed,
      confirmed.facts,
      "2026-07-23T14:02:00.000Z"
    );
    const radar = buildOpportunityRadar({
      household,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [confirmed],
      latestPassportStatus: "VALID",
      now: new Date("2026-07-23T14:03:00.000Z")
    });
    const rsu = radar.opportunities.find(
      (opportunity) => opportunity.category === "EQUITY_COMPENSATION"
    );

    expect(rsu?.title).toContain("$82K");
    expect(rsu?.decisionValue?.amount).toBe(82_000);
    expect(rsu?.evidence.readiness).toBe("READY");
    expect(rsu?.action).toMatchObject({ label: "Compile strategy" });
    expect(rsu?.action.to).toContain("event-rsu-vest");
    expect(rsu?.passport.status).toBe("RETEST_REQUIRED");
  });
});
