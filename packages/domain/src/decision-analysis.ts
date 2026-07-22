import type {
  AssumptionSet,
  DecisionAnalysis,
  DecisionContext,
  FeeSchedule,
  HouseholdSnapshot,
  ScenarioResult,
  StrategyRequest
} from "./models";
import { round, toMoney } from "./money";
import { runScenario } from "./scenario-engine";

export function analyzeDecision(
  household: HouseholdSnapshot,
  requests: readonly StrategyRequest[],
  assumptions: AssumptionSet,
  feeSchedule: FeeSchedule,
  decisionContext: DecisionContext,
  scenarios: readonly ScenarioResult[]
): DecisionAnalysis | null {
  const rentalRequest = requests.find((request) => request.type === "RENTAL");
  if (!rentalRequest?.rental) return null;
  const rentalScenario = scenarios.find((scenario) => scenario.strategy === "RENTAL");
  const target = scenarios
    .filter((scenario) => scenario.strategy !== "RENTAL")
    .sort((left, right) => right.successProbability - left.successProbability)[0];
  if (!rentalScenario || !target) return null;

  const rentalInput = rentalRequest.rental;
  const successAt = (overrides: Partial<typeof rentalInput>): ScenarioResult =>
    runScenario(
      household,
      { type: "RENTAL", rental: { ...rentalInput, ...overrides } },
      assumptions,
      feeSchedule,
      decisionContext
    );
  const rentalLeads = (scenario: ScenarioResult) =>
    scenario.successProbability >= target.successProbability;

  const breakEvenMortgageRate = findMaximumPassing(0, 0.2, (mortgageRate) =>
    rentalLeads(successAt({ mortgageRate }))
  );
  const rentSearchHigh = Math.max(20_000, rentalInput.monthlyRent * 4);
  const breakEvenMonthlyRent = findMinimumPassing(0, rentSearchHigh, (monthlyRent) =>
    rentalLeads(successAt({ monthlyRent }))
  );
  const capitalRatio = rentalInput.downPaymentPercent + rentalInput.closingCostPercent;
  const maxAffordablePurchasePrice =
    capitalRatio === 0 ? 0 : decisionContext.decisionCapital / capitalRatio;
  const rates = [
    Math.max(0, rentalInput.mortgageRate - 0.01),
    rentalInput.mortgageRate,
    Math.min(0.2, rentalInput.mortgageRate + 0.01)
  ];
  const rents = [
    Math.max(0, rentalInput.monthlyRent * 0.9),
    rentalInput.monthlyRent,
    rentalInput.monthlyRent * 1.1
  ];
  const sensitivity = rates.flatMap((mortgageRate) =>
    rents.map((monthlyRent) => {
      const scenario = successAt({ mortgageRate, monthlyRent });
      return {
        mortgageRate: round(mortgageRate, 4),
        monthlyRent: toMoney(monthlyRent),
        annualCashFlow: scenario.annualCashFlow,
        rentalSuccessProbability: scenario.successProbability,
        rentalLeads: rentalLeads(scenario)
      };
    })
  );

  return {
    targetScenarioId: target.id,
    targetScenarioLabel: target.label,
    targetSuccessProbability: target.successProbability,
    rentalScenarioId: rentalScenario.id,
    rentalSuccessProbability: rentalScenario.successProbability,
    rentalSnapshot: {
      purchasePrice: rentalInput.purchasePrice,
      monthlyRent: rentalInput.monthlyRent,
      mortgageRate: rentalInput.mortgageRate,
      hoursPerMonth: rentalInput.hoursPerMonth
    },
    breakEvenMortgageRate: breakEvenMortgageRate === null ? null : round(breakEvenMortgageRate, 4),
    breakEvenMonthlyRent: breakEvenMonthlyRent === null ? null : toMoney(breakEvenMonthlyRent),
    maxAffordablePurchasePrice: toMoney(maxAffordablePurchasePrice),
    sensitivity,
    definition:
      "Break-even is the deterministic boundary where the rental matches the leading non-rental alternative's modeled FI success probability under the same assumption version."
  };
}

function findMaximumPassing(
  low: number,
  high: number,
  passes: (value: number) => boolean
): number | null {
  if (!passes(low)) return null;
  if (passes(high)) return high;
  let passing = low;
  let failing = high;
  for (let index = 0; index < 16; index += 1) {
    const midpoint = (passing + failing) / 2;
    if (passes(midpoint)) passing = midpoint;
    else failing = midpoint;
  }
  return passing;
}

function findMinimumPassing(
  low: number,
  high: number,
  passes: (value: number) => boolean
): number | null {
  if (passes(low)) return low;
  if (!passes(high)) return null;
  let failing = low;
  let passing = high;
  for (let index = 0; index < 16; index += 1) {
    const midpoint = (failing + passing) / 2;
    if (passes(midpoint)) passing = midpoint;
    else failing = midpoint;
  }
  return passing;
}
