import { describe, expect, it } from "vitest";
import { createDeterministicRecommendation } from "@fidt/ai-orchestrator";
import {
  calculateAnnualAdvisoryFee,
  demoAssumptions,
  demoFeeSchedule,
  demoHousehold,
  demoStrategies,
  detectAdvisorRevenueConflict,
  runScenarioComparison
} from "@fidt/domain";
import { evaluateRecommendation } from "../src";

const now = new Date("2026-07-22T15:00:00.000Z");
const scenarios = runScenarioComparison(
  demoHousehold,
  demoStrategies,
  demoAssumptions,
  demoFeeSchedule
);
const valid = createDeterministicRecommendation({
  household: demoHousehold,
  scenarios,
  conflicts: [],
  citations: [],
  now
});

describe("fiduciary policy engine", () => {
  it("approves a traceable draft while retaining human review", () => {
    const result = evaluateRecommendation({ recommendation: valid, scenarios, conflicts: [], now });
    expect(result.status).toBe("APPROVE");
    expect(result.humanReviewRequired).toBe(true);
  });

  it("approves the governed fallback for the demo comparison with fee conflicts disclosed", () => {
    const managedAssets = demoHousehold.accounts
      .filter((account) => account.managed)
      .reduce((sum, account) => sum + account.balance, 0);
    const baselineFee = calculateAnnualAdvisoryFee(managedAssets, demoFeeSchedule);
    const conflicts = scenarios
      .map((scenario) => detectAdvisorRevenueConflict(baselineFee, scenario.firstYearAdvisoryFee))
      .filter((conflict) => conflict !== null);
    const recommendation = createDeterministicRecommendation({
      household: demoHousehold,
      scenarios,
      conflicts,
      citations: [],
      now
    });

    const result = evaluateRecommendation({ recommendation, scenarios, conflicts, now });
    expect(result.status).toBe("APPROVE");
    expect(recommendation.conflictsDisclosed).toHaveLength(conflicts.length);
  });

  it("requires changes for guarantee language", () => {
    const result = evaluateRecommendation({
      recommendation: {
        ...valid,
        statements: [
          ...valid.statements,
          {
            id: "bad-guarantee",
            label: "AI_SUGGESTION",
            text: "This strategy guarantees financial independence with no downside.",
            citationIds: [],
            calculationRefs: []
          }
        ]
      },
      scenarios,
      conflicts: [],
      now
    });
    expect(result.status).toBe("REQUIRE_CHANGES");
    expect(result.reasons.some((reason) => reason.code === "PROHIBITED_GUARANTEE")).toBe(true);
  });

  it("blocks broken and stale public citations", () => {
    const result = evaluateRecommendation({
      recommendation: {
        ...valid,
        statements: [
          {
            id: "external-rate",
            label: "EXTERNAL_FACT",
            text: "The referenced public rate is 4 percent.",
            citationIds: ["old-rate", "does-not-exist"],
            calculationRefs: []
          }
        ],
        citations: [
          {
            id: "old-rate",
            title: "Old public rate",
            sourceType: "PUBLIC_SOURCE",
            sourceUrl: "https://example.gov/rate",
            asOf: "2025-01-01"
          }
        ]
      },
      scenarios,
      conflicts: [],
      now
    });
    expect(result.reasons.some((reason) => reason.code === "STALE_EXTERNAL_DATA")).toBe(true);
    expect(result.reasons.some((reason) => reason.code === "BROKEN_CITATION")).toBe(true);
  });

  it("recognizes a verbatim advisor-revenue disclosure", () => {
    const conflict = {
      code: "ADVISOR_REVENUE_INCREASE" as const,
      severity: "REVIEW" as const,
      message:
        "The proposed strategy increases estimated advisory revenue and requires explicit conflict disclosure.",
      annualRevenueDifference: 1_200
    };
    const result = evaluateRecommendation({
      recommendation: { ...valid, conflictsDisclosed: [conflict.message] },
      scenarios,
      conflicts: [conflict],
      now
    });
    expect(result.reasons.some((reason) => reason.code === "UNDISCLOSED_CONFLICT")).toBe(false);
  });

  it("escalates a recommendation with high engine risks", () => {
    const rental = scenarios.find((scenario) => scenario.strategy === "RENTAL");
    if (!rental) throw new Error("Rental scenario is missing");
    const result = evaluateRecommendation({
      recommendation: { ...valid, recommendedScenarioId: rental.id },
      scenarios,
      conflicts: [],
      now
    });
    expect(result.status).toBe("ESCALATE");
    expect(result.reasons.some((reason) => reason.code === "HIGH_RISK_RECOMMENDATION")).toBe(true);
  });

  it("requires calculation traceability and known scenarios", () => {
    const result = evaluateRecommendation({
      recommendation: {
        ...valid,
        recommendedScenarioId: "not-in-run",
        alternativesConsidered: [],
        statements: [
          {
            id: "untraceable",
            label: "DETERMINISTIC_CALCULATION",
            text: "The result is 10.",
            citationIds: [],
            calculationRefs: []
          }
        ]
      },
      scenarios,
      conflicts: [],
      now
    });
    expect(result.status).toBe("REQUIRE_CHANGES");
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "MISSING_EVIDENCE",
        "MISSING_CALCULATION_TRACE",
        "MISSING_ALTERNATIVES",
        "UNKNOWN_RECOMMENDED_SCENARIO"
      ])
    );
  });

  it("blocks a material conflict that was not disclosed", () => {
    const conflict = {
      code: "ADVISOR_REVENUE_DECREASE" as const,
      severity: "DISCLOSE" as const,
      message: "Advisor compensation changes under this alternative.",
      annualRevenueDifference: -900
    };
    const result = evaluateRecommendation({
      recommendation: { ...valid, conflictsDisclosed: [] },
      scenarios,
      conflicts: [conflict],
      now
    });
    expect(result.reasons.some((reason) => reason.code === "UNDISCLOSED_CONFLICT")).toBe(true);
  });
});
