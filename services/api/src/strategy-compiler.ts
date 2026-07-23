import type {
  AdvisorOpportunity,
  CompiledStrategyCandidate,
  EvidenceDocument,
  StrategyCompilation,
  StrategyConstitutionCheck
} from "@fidt/contracts";
import {
  calculateAnnualAdvisoryFee,
  demoAssumptions,
  demoFeeSchedule,
  runScenarioComparison,
  toMoney,
  type ClientConstitution,
  type HouseholdSnapshot,
  type RsuActionPlanType,
  type StrategyRequest
} from "@fidt/domain";

export const STRATEGY_COMPILER_VERSION = "strategy-compiler-v1" as const;

interface CompileStrategyInput {
  readonly household: HouseholdSnapshot;
  readonly constitution: ClientConstitution;
  readonly opportunity: AdvisorOpportunity;
  readonly documents: readonly EvidenceDocument[];
  readonly now?: Date;
}

interface CandidateDefinition {
  readonly planType: RsuActionPlanType;
  readonly thesis: string;
  readonly portfolioAmount: number;
  readonly debtPaydownAmount: number;
  readonly cashReserveAmount: number;
  readonly retainedEmployerStockAmount: number;
  readonly diversificationMonths: number;
  readonly tradeoffs: readonly string[];
}

export function compileRsuStrategies(input: CompileStrategyInput): StrategyCompilation {
  if (input.opportunity.category !== "EQUITY_COMPENSATION") {
    throw new RangeError("Strategy Compiler v1 currently accepts RSU opportunities only");
  }
  if (input.opportunity.evidence.readiness !== "READY") {
    throw new RangeError("Advisor-confirmed equity-award evidence is required before compilation");
  }
  const grant = input.household.rsuGrants[0];
  if (!grant) throw new RangeError("The household does not have an RSU grant to compile");
  const grossVestValue = grant.nextVestValue;
  const withholdingRate = grant.withholdingRate;
  const decisionCapital = toMoney(grossVestValue * (1 - withholdingRate));
  const studentLoan = input.household.liabilities.find(
    (liability) => liability.type === "STUDENT_LOAN"
  );
  const debtPaydown = Math.min(studentLoan?.balance ?? 0, decisionCapital);
  const stagedRetained = toMoney(decisionCapital * 0.4);
  const liquidityReserve = toMoney(decisionCapital * 0.25);
  const definitions: readonly CandidateDefinition[] = [
    {
      planType: "SELL_AND_DIVERSIFY",
      thesis: "Remove new single-company exposure at vest and preserve full market participation.",
      portfolioAmount: decisionCapital,
      debtPaydownAmount: 0,
      cashReserveAmount: 0,
      retainedEmployerStockAmount: 0,
      diversificationMonths: 0,
      tradeoffs: [
        "Fastest concentration reduction",
        "Creates the largest modeled managed-asset increase",
        "Requires transaction-specific tax review before execution"
      ]
    },
    {
      planType: "STAGED_DIVERSIFICATION",
      thesis:
        "Reduce concentration immediately while preserving a bounded transition window for client comfort.",
      portfolioAmount: toMoney(decisionCapital - stagedRetained),
      debtPaydownAmount: 0,
      cashReserveAmount: 0,
      retainedEmployerStockAmount: stagedRetained,
      diversificationMonths: 6,
      tradeoffs: [
        "Reduces behavioral friction",
        "Leaves temporary employer-stock exposure",
        "Requires an executable six-month sell schedule"
      ]
    },
    {
      planType: "DEBT_AND_DIVERSIFY",
      thesis:
        "Use the vest to remove the highest-rate household debt and diversify every remaining dollar.",
      portfolioAmount: toMoney(decisionCapital - debtPaydown),
      debtPaydownAmount: debtPaydown,
      cashReserveAmount: 0,
      retainedEmployerStockAmount: 0,
      diversificationMonths: 0,
      tradeoffs: [
        "Locks in interest savings",
        "Deploys less capital to market growth",
        "Reduces the investable asset base used for advisory fees"
      ]
    },
    {
      planType: "LIQUIDITY_AND_DIVERSIFY",
      thesis:
        "Preserve a dedicated decision reserve while moving the remaining proceeds out of employer stock.",
      portfolioAmount: toMoney(decisionCapital - liquidityReserve),
      debtPaydownAmount: 0,
      cashReserveAmount: liquidityReserve,
      retainedEmployerStockAmount: 0,
      diversificationMonths: 0,
      tradeoffs: [
        "Creates additional household optionality",
        "Accepts a lower expected return on the reserve",
        "Keeps the entire vest outside employer stock"
      ]
    },
    {
      planType: "RETAIN_AND_MONITOR",
      thesis: "Retain the after-withholding award temporarily and use a monitored exit trigger.",
      portfolioAmount: 0,
      debtPaydownAmount: 0,
      cashReserveAmount: 0,
      retainedEmployerStockAmount: decisionCapital,
      diversificationMonths: 12,
      tradeoffs: [
        "Preserves full employer-stock participation",
        "Compounds employment and portfolio concentration",
        "Requires a new review when the exit trigger or policy ceiling is reached"
      ]
    }
  ];
  const strategies = definitions.map((definition): StrategyRequest => ({
    type: "RSU_ACTION",
    rsuAction: {
      planType: definition.planType,
      grossVestValue,
      withholdingRate,
      portfolioAmount: definition.portfolioAmount,
      debtPaydownAmount: definition.debtPaydownAmount,
      cashReserveAmount: definition.cashReserveAmount,
      retainedEmployerStockAmount: definition.retainedEmployerStockAmount,
      diversificationMonths: definition.diversificationMonths,
      concentrationRiskHaircut: 0.025
    }
  }));
  const scenarios = runScenarioComparison(
    input.household,
    strategies,
    demoAssumptions,
    demoFeeSchedule,
    { decisionCapital, constitution: input.constitution }
  );
  const currentManagedAssets = input.household.accounts
    .filter((account) => account.managed)
    .reduce((sum, account) => sum + account.balance, 0);
  const baselineFee = calculateAnnualAdvisoryFee(currentManagedAssets, demoFeeSchedule);
  const equityEvidenceConfirmed = input.documents.some(
    (document) => document.documentType === "RSU_STATEMENT" && document.status === "CONFIRMED"
  );
  const candidates = definitions.map((definition, index): CompiledStrategyCandidate => {
    const scenario = scenarios[index];
    const strategy = strategies[index];
    if (!scenario || !strategy) throw new Error("Compiler scenario alignment failed");
    const checks = constitutionChecks(scenario, input.constitution);
    const eligible = checks.filter((check) => check.blocking).every((check) => check.passed);
    const annualRevenueDifference = toMoney(scenario.firstYearAdvisoryFee - baselineFee);
    return {
      id: `candidate-rsu-${definition.planType.toLowerCase().replaceAll("_", "-")}`,
      planType: definition.planType,
      label: scenario.label,
      thesis: definition.thesis,
      status: eligible ? "ELIGIBLE" : "REJECTED",
      dominance: eligible ? "PARETO_FRONTIER" : "REJECTED",
      strategy,
      scenario,
      allocations: {
        portfolio: definition.portfolioAmount,
        debtPaydown: definition.debtPaydownAmount,
        cashReserve: definition.cashReserveAmount,
        retainedEmployerStock: definition.retainedEmployerStockAmount
      },
      constitutionChecks: checks,
      evidenceRequirements: [
        {
          label: "Current equity-award statement",
          status: equityEvidenceConfirmed ? "CONFIRMED" : "MISSING"
        },
        { label: "Versioned household holdings snapshot", status: "CONFIRMED" },
        { label: "Transaction-specific tax-basis review", status: "MISSING" }
      ],
      tradeoffs: definition.tradeoffs,
      advisorEconomics: {
        annualRevenueDifference,
        direction:
          annualRevenueDifference > 1
            ? "INCREASE"
            : annualRevenueDifference < -1
              ? "DECREASE"
              : "NEUTRAL",
        disclosureRequired: Math.abs(annualRevenueDifference) > 1
      }
    };
  });
  const withDominance = assignParetoDominance(candidates);
  const eligibleCandidates = withDominance.filter((candidate) => candidate.status === "ELIGIBLE");
  if (eligibleCandidates.length < 2) {
    throw new RangeError("The compiler did not produce two constitution-eligible alternatives");
  }
  const now = input.now ?? new Date();
  return {
    id: crypto.randomUUID(),
    householdId: input.household.id,
    opportunityId: input.opportunity.id,
    triggerEventId: input.opportunity.triggerEventId,
    compilerVersion: STRATEGY_COMPILER_VERSION,
    compiledAt: now.toISOString(),
    opportunity: {
      title: input.opportunity.title,
      category: input.opportunity.category,
      score: input.opportunity.score,
      evidenceReadiness: input.opportunity.evidence.readiness
    },
    grossDecisionValue: grossVestValue,
    decisionCapital,
    modeledWithholdingRate: withholdingRate,
    candidates: withDominance,
    frontierCandidateIds: withDominance
      .filter((candidate) => candidate.dominance === "PARETO_FRONTIER")
      .map((candidate) => candidate.id),
    rejectedCandidateIds: withDominance
      .filter((candidate) => candidate.status === "REJECTED")
      .map((candidate) => candidate.id),
    promotion: {
      decisionCapital,
      triggerEventId: input.opportunity.triggerEventId,
      strategies: eligibleCandidates.map((candidate) => candidate.strategy)
    },
    methodology:
      "Compiler v1 enumerates five RSU action templates, runs the deterministic FI engine, rejects signed Client Constitution breaches, calculates advisor-economics differences, and identifies non-dominated eligible strategies. It does not choose a recommendation."
  };
}

function constitutionChecks(
  scenario: CompiledStrategyCandidate["scenario"],
  constitution: ClientConstitution
): StrategyConstitutionCheck[] {
  const concentration = numericCalculation(
    scenario.calculations.projectedEmployerStockPercent,
    "projectedEmployerStockPercent"
  );
  const liquidity = numericCalculation(
    scenario.calculations.projectedLiquidAssetsAtDecision,
    "projectedLiquidAssetsAtDecision"
  );
  return [
    {
      id: "employer-stock-ceiling",
      label: "Employer-stock concentration",
      actual: concentration,
      operator: "LTE",
      threshold: constitution.constraints.maxEmployerStockPercent,
      unit: "RATE",
      passed: concentration <= constitution.constraints.maxEmployerStockPercent,
      blocking: true
    },
    {
      id: "liquidity-floor",
      label: "Household liquidity",
      actual: liquidity,
      operator: "GTE",
      threshold: constitution.constraints.liquidityFloor,
      unit: "CURRENCY",
      passed: liquidity >= constitution.constraints.liquidityFloor,
      blocking: true
    },
    {
      id: "fi-success-floor",
      label: "Modeled FI success",
      actual: scenario.successProbability,
      operator: "GTE",
      threshold: constitution.constraints.minimumFiSuccessProbability,
      unit: "RATE",
      passed: scenario.successProbability >= constitution.constraints.minimumFiSuccessProbability,
      blocking: true
    },
    {
      id: "fi-age-target",
      label: "Modeled FI age",
      actual: scenario.fiAge ?? 999,
      operator: "LTE",
      threshold: constitution.constraints.targetFiAge,
      unit: "NUMBER",
      passed: scenario.fiAge !== null && scenario.fiAge <= constitution.constraints.targetFiAge,
      blocking: true
    }
  ];
}

function assignParetoDominance(
  candidates: readonly CompiledStrategyCandidate[]
): readonly CompiledStrategyCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.status === "REJECTED") return candidate;
    const dominated = candidates.some(
      (other) =>
        other.id !== candidate.id && other.status === "ELIGIBLE" && dominates(other, candidate)
    );
    return { ...candidate, dominance: dominated ? "DOMINATED" : "PARETO_FRONTIER" };
  });
}

function dominates(left: CompiledStrategyCandidate, right: CompiledStrategyCandidate): boolean {
  const leftConcentration = numericCalculation(
    left.scenario.calculations.projectedEmployerStockPercent,
    "projectedEmployerStockPercent"
  );
  const rightConcentration = numericCalculation(
    right.scenario.calculations.projectedEmployerStockPercent,
    "projectedEmployerStockPercent"
  );
  const noWorse =
    left.scenario.successProbability >= right.scenario.successProbability &&
    left.scenario.projectedLiquidAssets >= right.scenario.projectedLiquidAssets &&
    leftConcentration <= rightConcentration &&
    left.scenario.cumulativeAdvisoryFees <= right.scenario.cumulativeAdvisoryFees &&
    left.scenario.clientTimeCost <= right.scenario.clientTimeCost;
  const strictlyBetter =
    left.scenario.successProbability > right.scenario.successProbability ||
    left.scenario.projectedLiquidAssets > right.scenario.projectedLiquidAssets ||
    leftConcentration < rightConcentration ||
    left.scenario.cumulativeAdvisoryFees < right.scenario.cumulativeAdvisoryFees ||
    left.scenario.clientTimeCost < right.scenario.clientTimeCost;
  return noWorse && strictlyBetter;
}

function numericCalculation(value: number | string | null | undefined, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Compiler calculation ${name} is unavailable`);
  }
  return value;
}
