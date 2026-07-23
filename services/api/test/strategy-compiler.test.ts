import { describe, expect, it } from "vitest";
import { demoClientConstitution, demoEvents, demoHousehold } from "@fidt/domain";
import { applyConfirmedEvidence, extractEvidenceDocument } from "../src/evidence";
import { buildOpportunityRadar } from "../src/opportunities";
import { compileRsuStrategies } from "../src/strategy-compiler";

async function confirmedRsuEvidence() {
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
  return {
    ...extracted,
    status: "CONFIRMED" as const,
    confirmedAt: "2026-07-23T14:02:00.000Z",
    reviewerId: "advisor-demo",
    facts: extracted.facts.map((fact) => ({ ...fact, status: "CONFIRMED" as const }))
  };
}

describe("Strategy Compiler", () => {
  it("compiles an RSU opportunity into constitution-tested alternatives", async () => {
    const document = await confirmedRsuEvidence();
    const household = applyConfirmedEvidence(
      demoHousehold,
      document,
      document.facts,
      document.confirmedAt
    );
    const radar = buildOpportunityRadar({
      household,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [document],
      latestPassportStatus: "VALID",
      now: new Date("2026-07-23T14:03:00.000Z")
    });
    const opportunity = radar.opportunities.find(
      (candidate) => candidate.category === "EQUITY_COMPENSATION"
    );
    if (!opportunity) throw new Error("RSU opportunity missing");
    const compilation = compileRsuStrategies({
      household,
      constitution: demoClientConstitution,
      opportunity,
      documents: [document],
      now: new Date("2026-07-23T14:04:00.000Z")
    });

    expect(compilation.compilerVersion).toBe("strategy-compiler-v1");
    expect(compilation.grossDecisionValue).toBe(82_000);
    expect(compilation.decisionCapital).toBe(53_300);
    expect(compilation.candidates).toHaveLength(5);
    expect(compilation.promotion.strategies.length).toBeGreaterThanOrEqual(2);
    expect(compilation.promotion.strategies.length).toBeLessThanOrEqual(4);
    expect(compilation.frontierCandidateIds.length).toBeGreaterThan(0);
    expect(
      compilation.candidates.every((candidate) =>
        candidate.constitutionChecks.every((check) => check.blocking)
      )
    ).toBe(true);
  });

  it("rejects the retain plan when it breaches the concentration ceiling", async () => {
    const document = await confirmedRsuEvidence();
    const household = applyConfirmedEvidence(
      demoHousehold,
      document,
      document.facts,
      document.confirmedAt
    );
    const opportunity = buildOpportunityRadar({
      household,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [document],
      latestPassportStatus: null,
      now: new Date("2026-07-23T14:03:00.000Z")
    }).opportunities.find((candidate) => candidate.category === "EQUITY_COMPENSATION");
    if (!opportunity) throw new Error("RSU opportunity missing");
    const compilation = compileRsuStrategies({
      household,
      constitution: demoClientConstitution,
      opportunity,
      documents: [document]
    });
    const retained = compilation.candidates.find(
      (candidate) => candidate.planType === "RETAIN_AND_MONITOR"
    );

    expect(retained?.status).toBe("REJECTED");
    expect(retained?.dominance).toBe("REJECTED");
    expect(
      retained?.constitutionChecks.find((check) => check.id === "employer-stock-ceiling")?.passed
    ).toBe(false);
    expect(compilation.promotion.strategies).not.toContainEqual(retained?.strategy);
  });

  it("refuses compilation before equity evidence is advisor-confirmed", () => {
    const opportunity = buildOpportunityRadar({
      household: demoHousehold,
      constitution: demoClientConstitution,
      events: demoEvents,
      documents: [],
      latestPassportStatus: null,
      now: new Date("2026-07-23T14:03:00.000Z")
    }).opportunities.find((candidate) => candidate.category === "EQUITY_COMPENSATION");
    if (!opportunity) throw new Error("RSU opportunity missing");

    expect(() =>
      compileRsuStrategies({
        household: demoHousehold,
        constitution: demoClientConstitution,
        opportunity,
        documents: []
      })
    ).toThrow(/evidence is required/i);
  });
});
