import { describe, expect, it } from "vitest";
import type {
  DecisionPassportPayload,
  ExecutionReceipt,
  ExecutionReconciliationRequest
} from "@fidt/contracts";
import {
  demoAssumptions,
  demoClientConstitution,
  demoFeeSchedule,
  demoHousehold,
  demoStrategies,
  runScenarioComparison
} from "@fidt/domain";
import {
  createExecutionPlanDefinition,
  materializeExecutionPlan,
  reconcileExecution
} from "../src/execution";

const scenario = {
  ...runScenarioComparison(demoHousehold, demoStrategies, demoAssumptions, demoFeeSchedule, {
    decisionCapital: 147_000,
    constitution: demoClientConstitution
  })[1]!,
  calculations: {
    projectedLiquidAssetsAtDecision: 1_380_000,
    projectedEmployerStockPercent: 0.21
  }
};

const passport: DecisionPassportPayload = {
  schemaVersion: "1.0",
  id: "passport-execution-test",
  householdId: demoHousehold.id,
  recommendationId: "recommendation-execution-test",
  runId: "run-execution-test",
  issuedAt: "2026-07-23T14:00:00.000Z",
  recommendedScenario: {
    id: scenario.id,
    strategy: scenario.strategy,
    label: scenario.label,
    successProbability: scenario.successProbability,
    fiAge: scenario.fiAge,
    firstYearAdvisoryFee: scenario.firstYearAdvisoryFee
  },
  constitution: demoClientConstitution,
  decisionCapital: 147_000,
  alternativesConsidered: ["Pay down debt"],
  conflictsDisclosed: [],
  validityEnvelope: [
    {
      id: "condition-liquid",
      metric: "LIQUID_ASSETS",
      label: "Household liquidity",
      operator: "GTE",
      threshold: 150_000,
      baselineValue: 1_380_000,
      unit: "CURRENCY",
      source: "CLIENT_SNAPSHOT",
      rationale: "Preserve the signed liquidity floor."
    },
    {
      id: "condition-concentration",
      metric: "EMPLOYER_STOCK_PERCENT",
      label: "Employer-stock concentration",
      operator: "LTE",
      threshold: 0.25,
      baselineValue: 0.21,
      unit: "RATE",
      source: "CLIENT_SNAPSHOT",
      rationale: "Preserve the signed concentration ceiling."
    }
  ],
  evidenceIds: ["evidence-1"],
  calculationRefs: [`${scenario.id}.successProbability`],
  policyVersion: "policy-v1",
  modelId: "deterministic-template-v1",
  auditReviewEventId: "audit-review-execution"
};

function receipt(
  planId: string,
  taskId: string,
  recordedAt: string,
  result: ExecutionReceipt["result"] = "COMPLETED"
): ExecutionReceipt {
  return {
    id: crypto.randomUUID(),
    planId,
    taskId,
    result,
    evidenceType: "ATTESTATION",
    externalReference: `SYN-${taskId}`,
    notes: "Synthetic completion evidence recorded for the governed execution test.",
    attestation: true,
    recordedBy: "advisor-demo",
    recordedAt
  };
}

describe("Execution & Outcome Ledger", () => {
  it("unlocks controlled tasks only after prerequisite receipts", () => {
    const definition = createExecutionPlanDefinition({
      passport,
      scenario,
      advisorId: "advisor-demo",
      now: new Date("2026-07-23T15:00:00.000Z")
    });
    const initial = materializeExecutionPlan({
      definition,
      receipts: [],
      reconciliations: [],
      passportStatus: "VALID"
    });
    expect(initial.tasks.map((task) => task.status)).toEqual([
      "READY",
      "BLOCKED",
      "BLOCKED",
      "BLOCKED"
    ]);
    const taxReceipt = receipt(definition.id, definition.tasks[0]!.id, "2026-07-23T16:00:00.000Z");
    const afterTax = materializeExecutionPlan({
      definition,
      receipts: [taxReceipt],
      reconciliations: [],
      passportStatus: "VALID"
    });
    expect(afterTax.tasks.map((task) => task.status)).toEqual([
      "COMPLETED",
      "READY",
      "BLOCKED",
      "BLOCKED"
    ]);
    expect(afterTax.progress).toBe(0.25);
  });

  it("completes the ledger when realized outcomes match the approved scenario", () => {
    const definition = createExecutionPlanDefinition({
      passport,
      scenario,
      advisorId: "advisor-demo"
    });
    const receipts = definition.tasks
      .slice(0, 3)
      .map((task, index) => receipt(definition.id, task.id, `2026-07-2${index + 4}T16:00:00.000Z`));
    const request: ExecutionReconciliationRequest = {
      outcomes: definition.expectedOutcomes.map((outcome) => ({
        metric: outcome.metric,
        actualValue: outcome.expectedValue
      })),
      evidenceReference: "SYN-RECON-MATCH",
      notes: "Observed synthetic values match the approved execution expectations.",
      attestation: true
    };
    const reconciliation = reconcileExecution({
      plan: definition,
      passport,
      passportStatus: "VALID",
      request,
      advisorId: "advisor-demo"
    });
    const completed = materializeExecutionPlan({
      definition,
      receipts,
      reconciliations: [reconciliation],
      passportStatus: reconciliation.passportStatusAfter
    });
    expect(reconciliation.status).toBe("MATCHED");
    expect(reconciliation.passportStatusAfter).toBe("VALID");
    expect(completed.status).toBe("COMPLETED");
    expect(completed.progress).toBe(1);
  });

  it("invalidates the passport when a realized outcome breaches its signed envelope", () => {
    const definition = createExecutionPlanDefinition({
      passport,
      scenario,
      advisorId: "advisor-demo"
    });
    const request: ExecutionReconciliationRequest = {
      outcomes: definition.expectedOutcomes.map((outcome) => ({
        metric: outcome.metric,
        actualValue: outcome.metric === "EMPLOYER_STOCK_PERCENT" ? 0.41 : outcome.expectedValue
      })),
      evidenceReference: "SYN-RECON-BREACH",
      notes: "Synthetic reconciliation demonstrates a signed concentration-envelope breach.",
      attestation: true
    };
    const reconciliation = reconcileExecution({
      plan: definition,
      passport,
      passportStatus: "VALID",
      request,
      advisorId: "advisor-demo"
    });
    expect(reconciliation.status).toBe("EXCEPTION");
    expect(reconciliation.passportStatusAfter).toBe("INVALIDATED");
    expect(
      reconciliation.results.find((result) => result.metric === "EMPLOYER_STOCK_PERCENT")
        ?.validityEnvelopeBreached
    ).toBe(true);
  });
});
