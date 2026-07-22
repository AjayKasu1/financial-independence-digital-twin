import type { AssumptionSet, YearProjection } from "./models";
import { assertFiniteNumber, assertRate, money, round, toMoney } from "./money";

export interface FiProjectionInput {
  readonly currentAge: number;
  readonly currentLiquidAssets: number;
  readonly currentPropertyEquity: number;
  readonly currentLiabilities: number;
  readonly annualSpending: number;
  readonly annualSavings: number;
  readonly annualPortfolioReturn: number;
  readonly annualPropertyGrowth: number;
  readonly annualDebtReduction: number;
  readonly assumptions: AssumptionSet;
}

export interface FiProjectionResult {
  readonly fiNumber: number;
  readonly fiAge: number | null;
  readonly fiYear: number | null;
  readonly timeline: readonly YearProjection[];
}

export function calculateFiNumber(annualSpending: number, withdrawalRate: number): number {
  assertFiniteNumber(annualSpending, "annualSpending");
  assertRate(withdrawalRate, "withdrawalRate");
  if (annualSpending < 0) throw new RangeError("annualSpending cannot be negative");
  if (withdrawalRate === 0) throw new RangeError("withdrawalRate must be greater than zero");
  return toMoney(money(annualSpending).div(withdrawalRate));
}

export function projectFinancialIndependence(input: FiProjectionInput): FiProjectionResult {
  const { assumptions } = input;
  const fiNumber = calculateFiNumber(input.annualSpending, assumptions.withdrawalRate);
  let liquidAssets = money(input.currentLiquidAssets);
  let propertyEquity = money(input.currentPropertyEquity);
  let liabilities = money(input.currentLiabilities);
  let spending = money(input.annualSpending);
  let fiAge: number | null = null;
  let fiYear: number | null = null;
  const currentYear = new Date(`${assumptions.asOf}T00:00:00Z`).getUTCFullYear();
  const timeline: YearProjection[] = [];

  for (let offset = 0; offset <= assumptions.planningHorizonYears; offset += 1) {
    const target = calculateFiNumber(spending.toNumber(), assumptions.withdrawalRate);
    const age = input.currentAge + offset;
    const netWorth = liquidAssets.plus(propertyEquity).minus(liabilities);
    timeline.push({
      year: currentYear + offset,
      age,
      liquidAssets: toMoney(liquidAssets),
      propertyEquity: toMoney(propertyEquity),
      liabilities: toMoney(liabilities),
      netWorth: toMoney(netWorth),
      fiTarget: target
    });

    if (fiAge === null && liquidAssets.greaterThanOrEqualTo(target)) {
      fiAge = age;
      fiYear = currentYear + offset;
    }

    liquidAssets = liquidAssets.mul(money(1).plus(input.annualPortfolioReturn));
    liquidAssets = liquidAssets.plus(input.annualSavings);
    propertyEquity = propertyEquity.mul(money(1).plus(input.annualPropertyGrowth));
    liabilities = DecimalMaxZero(liabilities.minus(input.annualDebtReduction));
    spending = spending.mul(money(1).plus(assumptions.inflationRate));
  }

  return { fiNumber, fiAge, fiYear, timeline };
}

function DecimalMaxZero(value: ReturnType<typeof money>): ReturnType<typeof money> {
  return value.isNegative() ? money(0) : value;
}

export function estimateRealReturn(nominalReturn: number, inflationRate: number): number {
  assertRate(inflationRate, "inflationRate");
  if (nominalReturn <= -1) throw new RangeError("nominalReturn must be greater than -100%");
  return round((1 + nominalReturn) / (1 + inflationRate) - 1, 6);
}
