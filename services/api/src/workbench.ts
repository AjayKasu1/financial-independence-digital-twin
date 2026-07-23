import type { WorkbenchRequest, WorkbenchResponse } from "@fidt/contracts";
import {
  analyzeDecision,
  applyResilienceShock,
  calculateAnnualAdvisoryFee,
  compareHouseholdResilience,
  demoAssumptions,
  demoFeeSchedule,
  detectAdvisorRevenueConflict,
  resilienceOptionsForStrategies,
  runScenarioComparison,
  type ClientConstitution,
  type ConflictFlag,
  type DecisionContext,
  type HouseholdSnapshot,
  type StrategyRequest
} from "@fidt/domain";

export function runAdvisorWorkbench(
  household: HouseholdSnapshot,
  constitution: ClientConstitution,
  input: WorkbenchRequest
): WorkbenchResponse {
  const sandboxHousehold = applyHouseholdOverrides(household, input);
  const sandboxConstitution = applyConstitutionOverrides(constitution, input);
  const baseStrategies = workbenchStrategies(input, input.rsuVestAmount);
  const resilience = compareHouseholdResilience(
    sandboxHousehold,
    sandboxConstitution,
    input.resilienceShock,
    input.rsuVestAmount,
    resilienceOptionsForStrategies(sandboxHousehold, baseStrategies, input.rsuVestAmount)
  );
  const stressedHousehold = applyResilienceShock(sandboxHousehold, resilience.stressed);
  const availableDecisionCapital = resilience.stressed.metrics.availableDecisionCapital;
  const decisionContext: DecisionContext = {
    decisionCapital: availableDecisionCapital,
    constitution: sandboxConstitution
  };
  const assumptions = {
    ...demoAssumptions,
    id: `workbench-assumptions-${crypto.randomUUID()}`,
    version: demoAssumptions.version + 1,
    asOf: new Date().toISOString().slice(0, 10),
    // Keep live meeting recalculations responsive. Governed Decision Lab runs retain the
    // canonical higher-path assumption set before anything can be approved.
    simulationPaths: 240
  };
  const strategies = workbenchStrategies(input, availableDecisionCapital);
  const scenarios = runScenarioComparison(
    stressedHousehold,
    strategies,
    assumptions,
    demoFeeSchedule,
    decisionContext
  );
  const analysis = analyzeDecision(
    stressedHousehold,
    strategies,
    assumptions,
    demoFeeSchedule,
    decisionContext,
    scenarios
  );
  const currentManagedAssets = sandboxHousehold.accounts
    .filter((account) => account.managed)
    .reduce((sum, account) => sum + account.balance, 0);
  const baselineFee = calculateAnnualAdvisoryFee(currentManagedAssets, demoFeeSchedule);
  const conflicts = uniqueConflicts(
    scenarios
      .map((scenario) => detectAdvisorRevenueConflict(baselineFee, scenario.firstYearAdvisoryFee))
      .filter((conflict): conflict is ConflictFlag => conflict !== null)
  );

  return {
    sandboxId: `sandbox-${crypto.randomUUID()}`,
    mode: "SESSION_ONLY",
    householdId: household.id,
    calculatedAt: new Date().toISOString(),
    input,
    clientConstitution: sandboxConstitution,
    analysis,
    scenarios,
    conflicts,
    resilience,
    publicContext: publicResilienceContext()
  };
}

function applyHouseholdOverrides(
  household: HouseholdSnapshot,
  input: WorkbenchRequest
): HouseholdSnapshot {
  const nonEmployerValue = household.holdings
    .filter((holding) => holding.assetClass !== "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerValue =
    input.employerStockPercent === 0
      ? 0
      : (nonEmployerValue * input.employerStockPercent) / (1 - input.employerStockPercent);

  return {
    ...household,
    holdings: household.holdings.map((holding) =>
      holding.assetClass === "EMPLOYER_STOCK" ? { ...holding, marketValue: employerValue } : holding
    ),
    rsuGrants: household.rsuGrants.map((grant, index) =>
      index === 0 ? { ...grant, nextVestValue: input.rsuVestAmount } : grant
    ),
    preferences: {
      ...household.preferences,
      liquidityFloor: input.liquidityFloor,
      maxRealEstateHoursPerMonth: input.maxRealEstateHoursPerMonth
    }
  };
}

function applyConstitutionOverrides(
  constitution: ClientConstitution,
  input: WorkbenchRequest
): ClientConstitution {
  return {
    ...constitution,
    id: `sandbox-${constitution.id}`,
    approvedBy: "Session-only workbench override · not client-approved",
    constraints: {
      ...constitution.constraints,
      liquidityFloor: input.liquidityFloor,
      maxRealEstateHoursPerMonth: input.maxRealEstateHoursPerMonth,
      targetFiAge: input.targetFiAge
    }
  };
}

function workbenchStrategies(
  input: WorkbenchRequest,
  availableDecisionCapital: number
): readonly StrategyRequest[] {
  return [
    {
      type: "RENTAL",
      rental: {
        purchasePrice: input.rentalPurchasePrice,
        downPaymentPercent: 0.25,
        closingCostPercent: 0.03,
        mortgageRate: input.mortgageRate,
        mortgageTermYears: 30,
        monthlyRent: input.monthlyMarketRent,
        vacancyRate: 0.06,
        managementRate: 0.08,
        annualPropertyTax: input.rentalPurchasePrice * 0.013,
        annualInsurance: input.rentalPurchasePrice * 0.0042,
        annualMaintenanceRate: 0.01,
        annualCapexRate: 0.0075,
        appreciationRate: 0.03,
        rentGrowthRate: 0.025,
        sellingCostPercent: 0.06,
        hoursPerMonth: input.maxRealEstateHoursPerMonth,
        hourlyTimeValue: 90
      }
    },
    {
      type: "PORTFOLIO",
      portfolio: {
        initialInvestment: availableDecisionCapital,
        annualContribution: 0,
        equityAllocation: 0.75,
        bondAllocation: 0.2,
        cashAllocation: 0.05,
        fundExpenseRate: 0.0012
      }
    },
    {
      type: "DEBT_PAYDOWN",
      debt: {
        liabilityId: "liability-student",
        lumpSum: Math.min(42_000, availableDecisionCapital)
      }
    }
  ];
}

function publicResilienceContext(): WorkbenchResponse["publicContext"] {
  return {
    source: "NerdWallet Consumer Financial Resilience Index",
    score: 63.1,
    observedAt: "2026-07-09",
    publishedAt: "2026-07-21",
    retrievedAt: new Date().toISOString(),
    creditReliancePercent: 33,
    thousandDollarCashCoveragePercent: 65,
    sampleSize: 2_089,
    sourceUrl: "https://www.nerdwallet.com/finance/studies/financial-resilience-index",
    methodology:
      "Five equally weighted survey questions across financial security, financial strength, and economic outlook.",
    usageBoundary:
      "Population context only. It is not an input to the Household Optionality Score and is never applied to an individual client."
  };
}

function uniqueConflicts(conflicts: readonly ConflictFlag[]): ConflictFlag[] {
  return [...new Map(conflicts.map((conflict) => [conflict.code, conflict])).values()];
}
