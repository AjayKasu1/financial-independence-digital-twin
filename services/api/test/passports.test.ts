import { describe, expect, it } from "vitest";
import type {
  ComplianceDecision,
  RecommendationDraft,
  ScenarioComparisonResponse
} from "@fidt/contracts";
import {
  analyzeDecision,
  compareHouseholdResilience,
  demoAssumptions,
  demoClientConstitution,
  demoFeeSchedule,
  demoHousehold,
  demoStrategies,
  noResilienceShock,
  resilienceOptionsForStrategies,
  runScenarioComparison
} from "@fidt/domain";
import {
  evaluatePassportValidity,
  issueDecisionPassport,
  observationsForPassport,
  verifyDecisionPassport
} from "../src/passports";
import type { StoredDecisionPassport } from "../src/repositories/database";

const secret = "test-passport-signing-secret-with-32-bytes";

function recommendation(run: ScenarioComparisonResponse): RecommendationDraft {
  const leading = [...run.scenarios].sort(
    (left, right) => right.successProbability - left.successProbability
  )[0]!;
  return {
    id: "recommendation-passport-test",
    householdId: demoHousehold.id,
    createdAt: "2026-07-22T18:00:00.000Z",
    recommendedScenarioId: leading.id,
    scenarioIds: run.scenarios.map((scenario) => scenario.id),
    headline: "Use the leading governed alternative",
    executiveSummary: "A deterministic comparison supports this human-reviewed recommendation.",
    statements: [
      {
        id: "statement-1",
        label: "DETERMINISTIC_CALCULATION",
        text: "The recommendation uses the locked comparison.",
        citationIds: ["client-snapshot"],
        calculationRefs: [`${leading.id}.successProbability`]
      }
    ],
    citations: [
      {
        id: "client-snapshot",
        title: "Synthetic household snapshot",
        sourceType: "CLIENT_DOCUMENT",
        asOf: demoHousehold.asOf
      }
    ],
    alternativesConsidered: run.scenarios
      .filter((scenario) => scenario.id !== leading.id)
      .map((scenario) => scenario.label),
    conflictsDisclosed: run.conflicts.map((conflict) => conflict.message),
    missingInformation: [],
    modelId: "deterministic-template-v1",
    promptVersion: "fiduciary-v1",
    generatedBy: "DETERMINISTIC_FALLBACK"
  };
}

const compliance: ComplianceDecision = {
  status: "APPROVE",
  evaluatedAt: "2026-07-22T18:00:01.000Z",
  policyVersion: "policy-v1",
  reasons: [],
  requiredActions: [],
  humanReviewRequired: true
};

function scenarioRun(): ScenarioComparisonResponse {
  const decisionContext = { decisionCapital: 147_000, constitution: demoClientConstitution };
  const scenarios = runScenarioComparison(
    demoHousehold,
    demoStrategies,
    demoAssumptions,
    demoFeeSchedule,
    decisionContext
  );
  return {
    runId: "run-passport-test",
    householdId: demoHousehold.id,
    triggerEventId: "event-rsu-vest",
    createdAt: "2026-07-22T17:59:00.000Z",
    decisionCapital: decisionContext.decisionCapital,
    clientConstitution: demoClientConstitution,
    analysis: analyzeDecision(
      demoHousehold,
      demoStrategies,
      demoAssumptions,
      demoFeeSchedule,
      decisionContext,
      scenarios
    ),
    scenarios,
    conflicts: [],
    resilience: compareHouseholdResilience(
      demoHousehold,
      demoClientConstitution,
      noResilienceShock,
      decisionContext.decisionCapital,
      resilienceOptionsForStrategies(demoHousehold, demoStrategies),
      new Date("2026-07-22T17:59:00.000Z")
    )
  };
}

describe("Decision Passport governance", () => {
  it("signs immutable contents and detects tampering", async () => {
    const run = scenarioRun();
    const issued = await issueDecisionPassport(
      {
        recommendation: recommendation(run),
        compliance,
        run,
        household: demoHousehold,
        reviewAuditEventId: "audit-review-1",
        now: new Date("2026-07-22T18:01:00.000Z")
      },
      secret
    );
    await expect(verifyDecisionPassport(issued.passport, issued.proof, secret)).resolves.toBe(true);
    expect(issued.passport.resilience?.stressed.methodologyVersion).toBe(
      "household-optionality-v1"
    );
    expect(issued.passport.validityEnvelope.map((condition) => condition.metric)).toEqual(
      expect.arrayContaining([
        "RESILIENCE_SCORE",
        "CREDIT_FREE_RUNWAY_MONTHS",
        "SHOCK_CREDIT_REQUIRED",
        "FEASIBLE_OPTIONS"
      ])
    );
    const tampered = { ...issued.passport, decisionCapital: 999_999 };
    await expect(verifyDecisionPassport(tampered, issued.proof, secret)).resolves.toBe(false);
  });

  it("invalidates advice when a material boundary is crossed and never self-revalidates", async () => {
    const run = scenarioRun();
    const issued = await issueDecisionPassport(
      {
        recommendation: recommendation(run),
        compliance,
        run,
        household: demoHousehold,
        reviewAuditEventId: "audit-review-2"
      },
      secret
    );
    const stored: StoredDecisionPassport = {
      ...issued,
      state: {
        status: "VALID",
        lastCheckedAt: null,
        invalidatedAt: null,
        invalidationReasons: []
      },
      checks: []
    };
    const baseline = Object.fromEntries(
      issued.passport.validityEnvelope.map((condition) => [
        condition.metric,
        condition.baselineValue
      ])
    );
    const valid = evaluatePassportValidity(stored, baseline, new Date("2026-07-22T19:00:00.000Z"));
    expect(valid.statusAfter).toBe("VALID");
    const invalid = evaluatePassportValidity(
      stored,
      { ...baseline, LIQUID_ASSETS: 1 },
      new Date("2026-07-22T20:00:00.000Z")
    );
    expect(invalid.statusAfter).toBe("INVALIDATED");
    expect(invalid.reasons.join(" ")).toContain("liquidity");
    const invalidStored: StoredDecisionPassport = {
      ...stored,
      state: {
        status: "INVALIDATED",
        lastCheckedAt: invalid.checkedAt,
        invalidatedAt: invalid.checkedAt,
        invalidationReasons: invalid.reasons
      }
    };
    expect(evaluatePassportValidity(invalidStored, baseline).statusAfter).toBe("INVALIDATED");
  });

  it("measures feed freshness from retrieval time, not a monthly observation's period start", async () => {
    const run = scenarioRun();
    const issued = await issueDecisionPassport(
      {
        recommendation: recommendation(run),
        compliance,
        run,
        household: demoHousehold,
        reviewAuditEventId: "audit-review-3"
      },
      secret
    );
    const observations = observationsForPassport(
      issued.passport,
      demoHousehold,
      {
        observations: [
          {
            source: "U.S. Bureau of Labor Statistics",
            seriesId: "CUUR0000SA0",
            label: "CPI-U",
            value: 300,
            unit: "index",
            observationDate: "2026-06-01",
            retrievedAt: "2026-07-22T18:00:00.000Z",
            sourceUrl: "https://example.com/bls",
            stale: true
          }
        ],
        connectors: []
      },
      new Date("2026-07-22T19:00:00.000Z")
    );
    expect(observations.PUBLIC_DATA_AGE_DAYS).toBeCloseTo(1 / 24, 6);
  });
});
