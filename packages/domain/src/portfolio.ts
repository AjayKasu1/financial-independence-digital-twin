import type { AssumptionSet, PortfolioStrategyInput } from "./models";
import { assertFiniteNumber, assertRate, money, round, toMoney, toRate } from "./money";
import { createSeededRandom, normalSample } from "./random";

export interface PortfolioProjectionResult {
  readonly expectedNominalReturn: number;
  readonly expectedVolatility: number;
  readonly endingValue: number;
  readonly cumulativeContributions: number;
  readonly cumulativeFees: number;
  readonly successProbability: number;
  readonly percentile10: number;
  readonly percentile50: number;
  readonly percentile90: number;
  readonly annualValues: readonly number[];
}

export function projectPortfolio(
  input: PortfolioStrategyInput,
  assumptions: AssumptionSet,
  targetEndingValue: number
): PortfolioProjectionResult {
  validatePortfolio(input, assumptions, targetEndingValue);
  const expectedReturn =
    input.equityAllocation * assumptions.equityReturnMean +
    input.bondAllocation * assumptions.bondReturnMean +
    input.cashAllocation * assumptions.cashReturn -
    input.fundExpenseRate -
    assumptions.taxDrag;
  const expectedVolatility = Math.sqrt(
    (input.equityAllocation * assumptions.equityVolatility) ** 2 +
      (input.bondAllocation * assumptions.bondVolatility) ** 2
  );
  let value = money(input.initialInvestment);
  let cumulativeFees = money(0);
  const annualValues = [toMoney(value)];
  for (let year = 0; year < assumptions.planningHorizonYears; year += 1) {
    const fee = value.mul(input.fundExpenseRate);
    cumulativeFees = cumulativeFees.plus(fee);
    value = value.mul(money(1).plus(expectedReturn)).plus(input.annualContribution);
    annualValues.push(toMoney(value));
  }

  const outcomes = simulatePortfolioOutcomes(
    input,
    assumptions,
    expectedReturn,
    expectedVolatility
  );
  const successes = outcomes.filter((outcome) => outcome >= targetEndingValue).length;

  return {
    expectedNominalReturn: toRate(expectedReturn),
    expectedVolatility: toRate(expectedVolatility),
    endingValue: toMoney(value),
    cumulativeContributions: toMoney(
      money(input.initialInvestment).plus(
        money(input.annualContribution).mul(assumptions.planningHorizonYears)
      )
    ),
    cumulativeFees: toMoney(cumulativeFees),
    successProbability: toRate(successes / outcomes.length),
    percentile10: percentile(outcomes, 0.1),
    percentile50: percentile(outcomes, 0.5),
    percentile90: percentile(outcomes, 0.9),
    annualValues
  };
}

function simulatePortfolioOutcomes(
  input: PortfolioStrategyInput,
  assumptions: AssumptionSet,
  mean: number,
  volatility: number
): number[] {
  const random = createSeededRandom(assumptions.seed);
  const outcomes: number[] = [];
  for (let path = 0; path < assumptions.simulationPaths; path += 1) {
    let value = input.initialInvestment;
    for (let year = 0; year < assumptions.planningHorizonYears; year += 1) {
      const sampledReturn = Math.max(-0.95, mean + volatility * normalSample(random));
      value = Math.max(0, value * (1 + sampledReturn) + input.annualContribution);
    }
    outcomes.push(round(value));
  }
  return outcomes.sort((left, right) => left - right);
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.round((values.length - 1) * quantile))
  );
  return values[index] ?? 0;
}

function validatePortfolio(
  input: PortfolioStrategyInput,
  assumptions: AssumptionSet,
  targetEndingValue: number
): void {
  for (const [label, value] of Object.entries({
    initialInvestment: input.initialInvestment,
    annualContribution: input.annualContribution,
    targetEndingValue
  })) {
    assertFiniteNumber(value, label);
    if (value < 0) throw new RangeError(`${label} cannot be negative`);
  }
  assertRate(input.equityAllocation, "equityAllocation");
  assertRate(input.bondAllocation, "bondAllocation");
  assertRate(input.cashAllocation, "cashAllocation");
  assertRate(input.fundExpenseRate, "fundExpenseRate");
  const allocation = input.equityAllocation + input.bondAllocation + input.cashAllocation;
  if (Math.abs(allocation - 1) > 0.000001) {
    throw new RangeError("portfolio allocations must sum to 1");
  }
  if (!Number.isInteger(assumptions.simulationPaths) || assumptions.simulationPaths <= 0) {
    throw new RangeError("simulationPaths must be a positive integer");
  }
}
