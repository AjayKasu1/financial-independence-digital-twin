import type {
  DecisionPassportPayload,
  DecisionPassportStatus,
  ExecutionExpectedOutcome,
  ExecutionPlan,
  ExecutionPlanDefinition,
  ExecutionReceipt,
  ExecutionReconciliation,
  ExecutionReconciliationRequest,
  ExecutionReconciliationResult,
  ExecutionTask,
  ExecutionTaskDefinition,
  ValidityCondition
} from "@fidt/contracts";
import type { ScenarioResult } from "@fidt/domain";

export const EXECUTION_ENGINE_VERSION = "execution-ledger-v1" as const;

export function createExecutionPlanDefinition(input: {
  readonly passport: DecisionPassportPayload;
  readonly scenario: ScenarioResult;
  readonly advisorId: string;
  readonly now?: Date;
}): ExecutionPlanDefinition {
  if (input.passport.recommendedScenario.id !== input.scenario.id) {
    throw new RangeError("The execution scenario must match the approved Decision Passport");
  }
  const now = input.now ?? new Date();
  const planId = crypto.randomUUID();
  const taskIds = {
    tax: `${planId}-tax-review`,
    authorization: `${planId}-client-authorization`,
    implementation: `${planId}-implementation-confirmation`,
    reconciliation: `${planId}-outcome-reconciliation`
  };
  const tasks: readonly ExecutionTaskDefinition[] = [
    {
      id: taskIds.tax,
      code: "TAX_REVIEW",
      title: "Confirm transaction-specific tax review",
      description:
        "Record the external tax-basis and withholding review required before implementation.",
      ownerRole: "TAX_PROFESSIONAL",
      dueAt: addDays(now, 2),
      prerequisiteTaskIds: [],
      requiredEvidence: "DOCUMENT_REFERENCE"
    },
    {
      id: taskIds.authorization,
      code: "CLIENT_AUTHORIZATION",
      title: "Capture client implementation authorization",
      description:
        "Attest that the client reviewed the approved strategy, known tradeoffs, and execution boundary.",
      ownerRole: "ADVISOR",
      dueAt: addDays(now, 4),
      prerequisiteTaskIds: [taskIds.tax],
      requiredEvidence: "ATTESTATION"
    },
    {
      id: taskIds.implementation,
      code: "IMPLEMENTATION_CONFIRMATION",
      title: implementationTitle(input.scenario.strategy),
      description:
        "Reference external completion evidence. FiduciaryOS records proof but never submits a trade or custodian instruction.",
      ownerRole: "OPERATIONS",
      dueAt: addDays(now, 7),
      prerequisiteTaskIds: [taskIds.authorization],
      requiredEvidence: "EXTERNAL_CONFIRMATION"
    },
    {
      id: taskIds.reconciliation,
      code: "OUTCOME_RECONCILIATION",
      title: "Reconcile expected and realized outcomes",
      description:
        "Compare observed implementation values with the approved scenario and reopen review when tolerances or validity conditions break.",
      ownerRole: "ADVISOR",
      dueAt: addDays(now, 14),
      prerequisiteTaskIds: [taskIds.implementation],
      requiredEvidence: "RECONCILIATION"
    }
  ];
  return {
    schemaVersion: "1.0",
    id: planId,
    passportId: input.passport.id,
    householdId: input.passport.householdId,
    recommendationId: input.passport.recommendationId,
    strategy: input.scenario.strategy,
    title: `Implement “${input.scenario.label}”`,
    createdAt: now.toISOString(),
    createdBy: input.advisorId,
    targetCompletionAt: addDays(now, 14),
    tasks,
    expectedOutcomes: expectedOutcomes(input.passport, input.scenario),
    unmeasuredOutcomes: [
      "Transaction-specific tax liability is not calculated by this demo.",
      "Market impact, settlement timing, and custodian service levels require external evidence."
    ],
    boundary:
      "This ledger coordinates and proves implementation. It does not place trades, move money, or write to a custodian."
  };
}

export function materializeExecutionPlan(input: {
  readonly definition: ExecutionPlanDefinition;
  readonly receipts: readonly ExecutionReceipt[];
  readonly reconciliations: readonly ExecutionReconciliation[];
  readonly passportStatus: DecisionPassportStatus;
}): ExecutionPlan {
  const latestReceiptByTask = new Map<string, ExecutionReceipt>();
  for (const receipt of input.receipts) latestReceiptByTask.set(receipt.taskId, receipt);
  const reconciliation = input.reconciliations.at(-1) ?? null;
  const terminalTaskIds = new Set(
    [...latestReceiptByTask.values()]
      .filter((receipt) => receipt.result === "COMPLETED")
      .map((receipt) => receipt.taskId)
  );
  if (reconciliation?.status === "MATCHED") {
    const reconciliationTask = input.definition.tasks.find(
      (task) => task.code === "OUTCOME_RECONCILIATION"
    );
    if (reconciliationTask) terminalTaskIds.add(reconciliationTask.id);
  }
  const tasks: ExecutionTask[] = input.definition.tasks.map((task) => {
    if (task.code === "OUTCOME_RECONCILIATION" && reconciliation) {
      return {
        ...task,
        status: reconciliation.status === "MATCHED" ? "COMPLETED" : "EXCEPTION"
      };
    }
    const receipt = latestReceiptByTask.get(task.id);
    if (receipt) {
      return {
        ...task,
        status: receipt.result,
        receipt
      };
    }
    const ready =
      input.passportStatus === "VALID" &&
      task.prerequisiteTaskIds.every((taskId) => terminalTaskIds.has(taskId));
    return { ...task, status: ready ? "READY" : "BLOCKED" };
  });
  const terminalTasks = tasks.filter(
    (task) => task.status === "COMPLETED" || task.status === "EXCEPTION"
  ).length;
  const hasException =
    tasks.some((task) => task.status === "EXCEPTION") || reconciliation?.status === "EXCEPTION";
  const completed = tasks.every((task) => task.status === "COMPLETED");
  const status =
    input.passportStatus !== "VALID" || reconciliation?.status === "EXCEPTION"
      ? "REVIEW_REQUIRED"
      : hasException
        ? "AT_RISK"
        : completed
          ? "COMPLETED"
          : "ACTIVE";
  return {
    ...input.definition,
    status,
    progress: tasks.length === 0 ? 0 : terminalTasks / tasks.length,
    nextTaskId: tasks.find((task) => task.status === "READY")?.id ?? null,
    tasks,
    reconciliation,
    passportStatus: input.passportStatus
  };
}

export function reconcileExecution(input: {
  readonly plan: ExecutionPlanDefinition;
  readonly passport: DecisionPassportPayload;
  readonly passportStatus: DecisionPassportStatus;
  readonly request: ExecutionReconciliationRequest;
  readonly advisorId: string;
  readonly now?: Date;
}): ExecutionReconciliation {
  const actualByMetric = new Map(
    input.request.outcomes.map((outcome) => [outcome.metric, outcome.actualValue])
  );
  const missing = input.plan.expectedOutcomes.filter(
    (outcome) => !actualByMetric.has(outcome.metric)
  );
  if (missing.length) {
    throw new RangeError(
      `Observed values are required for: ${missing.map((outcome) => outcome.label).join(", ")}`
    );
  }
  const results = input.plan.expectedOutcomes.map((expected): ExecutionReconciliationResult => {
    const actualValue = actualByMetric.get(expected.metric);
    if (actualValue === undefined) throw new Error("Reconciliation metric alignment failed");
    const variance = actualValue - expected.expectedValue;
    const absoluteVariance = Math.abs(variance);
    const status =
      absoluteVariance <= 0.01
        ? "MATCHED"
        : absoluteVariance <= expected.tolerance
          ? "WITHIN_TOLERANCE"
          : "EXCEPTION";
    const condition = validityConditionForMetric(input.passport.validityEnvelope, expected.metric);
    return {
      metric: expected.metric,
      label: expected.label,
      expectedValue: expected.expectedValue,
      actualValue,
      variance,
      tolerance: expected.tolerance,
      unit: expected.unit,
      status,
      validityEnvelopeBreached: condition ? !passesCondition(actualValue, condition) : false
    };
  });
  const exceptions = results.filter((result) => result.status === "EXCEPTION");
  const envelopeBreaches = results.filter((result) => result.validityEnvelopeBreached);
  const statusAfter: DecisionPassportStatus =
    input.passportStatus === "INVALIDATED"
      ? "INVALIDATED"
      : envelopeBreaches.length
        ? "INVALIDATED"
        : exceptions.length
          ? "REVIEW_REQUIRED"
          : input.passportStatus;
  const reasons = [
    ...exceptions.map(
      (result) =>
        `${result.label} differed from the approved expectation by ${formatVariance(result)}.`
    ),
    ...envelopeBreaches.map(
      (result) => `${result.label} also breached the signed Decision Passport validity envelope.`
    )
  ];
  return {
    id: crypto.randomUUID(),
    planId: input.plan.id,
    passportId: input.passport.id,
    status: exceptions.length ? "EXCEPTION" : "MATCHED",
    results,
    evidenceReference: input.request.evidenceReference,
    notes: input.request.notes,
    attestation: true,
    recordedBy: input.advisorId,
    recordedAt: (input.now ?? new Date()).toISOString(),
    passportStatusBefore: input.passportStatus,
    passportStatusAfter: statusAfter,
    reasons
  };
}

function expectedOutcomes(
  passport: DecisionPassportPayload,
  scenario: ScenarioResult
): ExecutionExpectedOutcome[] {
  const outcomes: ExecutionExpectedOutcome[] = [
    {
      metric: "DECISION_CAPITAL_DEPLOYED",
      label: "Decision capital deployed",
      expectedValue: scenario.capitalUse.deployed,
      tolerance: Math.max(500, scenario.capitalUse.deployed * 0.01),
      unit: "CURRENCY",
      source: `${scenario.id}.capitalUse.deployed`
    },
    {
      metric: "ADVISORY_FEE",
      label: "First-year advisory fee",
      expectedValue: scenario.firstYearAdvisoryFee,
      tolerance: 25,
      unit: "CURRENCY",
      source: `${scenario.id}.firstYearAdvisoryFee`
    }
  ];
  pushNumericOutcome(outcomes, scenario, {
    calculationKey: "projectedLiquidAssetsAtDecision",
    metric: "LIQUID_ASSETS",
    label: "Post-execution liquid assets",
    tolerance: 1_000,
    unit: "CURRENCY"
  });
  pushNumericOutcome(outcomes, scenario, {
    calculationKey: "projectedEmployerStockPercent",
    metric: "EMPLOYER_STOCK_PERCENT",
    label: "Employer-stock concentration",
    tolerance: 0.01,
    unit: "RATE"
  });
  const debtValue =
    numericCalculation(scenario, "debtPaydownAmount") ?? numericCalculation(scenario, "lumpSum");
  if (debtValue !== null && debtValue > 0) {
    outcomes.push({
      metric: "DEBT_REDUCTION",
      label: "Debt principal reduced",
      expectedValue: debtValue,
      tolerance: 100,
      unit: "CURRENCY",
      source: `${scenario.id}.calculations.debtPaydown`
    });
  }
  if (outcomes.length < 2) throw new RangeError("Execution requires two measurable outcomes");
  return outcomes;
}

function pushNumericOutcome(
  outcomes: ExecutionExpectedOutcome[],
  scenario: ScenarioResult,
  input: {
    readonly calculationKey: string;
    readonly metric: ExecutionExpectedOutcome["metric"];
    readonly label: string;
    readonly tolerance: number;
    readonly unit: ExecutionExpectedOutcome["unit"];
  }
): void {
  const value = numericCalculation(scenario, input.calculationKey);
  if (value === null) return;
  outcomes.push({
    metric: input.metric,
    label: input.label,
    expectedValue: value,
    tolerance: input.tolerance,
    unit: input.unit,
    source: `${scenario.id}.calculations.${input.calculationKey}`
  });
}

function numericCalculation(scenario: ScenarioResult, key: string): number | null {
  const value = scenario.calculations[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function validityConditionForMetric(
  conditions: readonly ValidityCondition[],
  metric: ExecutionExpectedOutcome["metric"]
): ValidityCondition | null {
  if (metric === "LIQUID_ASSETS" || metric === "EMPLOYER_STOCK_PERCENT") {
    return conditions.find((condition) => condition.metric === metric) ?? null;
  }
  return null;
}

function passesCondition(actualValue: number, condition: ValidityCondition): boolean {
  return condition.operator === "LTE"
    ? actualValue <= condition.threshold
    : actualValue >= condition.threshold;
}

function implementationTitle(strategy: string): string {
  if (strategy === "RSU_ACTION") return "Verify the external RSU implementation";
  if (strategy === "RENTAL") return "Verify the external acquisition milestone";
  if (strategy === "DEBT_PAYDOWN") return "Verify the external debt payment";
  return "Verify the external portfolio implementation";
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

function formatVariance(result: ExecutionReconciliationResult): string {
  const magnitude = Math.abs(result.variance);
  if (result.unit === "RATE") return `${(magnitude * 100).toFixed(1)} percentage points`;
  return `$${Math.round(magnitude).toLocaleString("en-US")}`;
}
