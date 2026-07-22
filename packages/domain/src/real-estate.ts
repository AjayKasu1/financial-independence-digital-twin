import type { RentalStrategyInput } from "./models";
import { assertFiniteNumber, assertRate, money, round, toMoney, toRate } from "./money";

export interface MortgagePayment {
  readonly monthlyPayment: number;
  readonly annualDebtService: number;
}

export interface RentalYearResult {
  readonly year: number;
  readonly grossRent: number;
  readonly noi: number;
  readonly cashFlowAfterDebt: number;
  readonly timeCost: number;
  readonly propertyValue: number;
  readonly mortgageBalance: number;
  readonly equity: number;
}

export interface RentalProjectionResult {
  readonly initialCashRequired: number;
  readonly loanAmount: number;
  readonly monthlyMortgagePayment: number;
  readonly firstYearNoi: number;
  readonly firstYearCashFlow: number;
  readonly firstYearCashOnCashReturn: number;
  readonly debtServiceCoverageRatio: number | null;
  readonly terminalEquity: number;
  readonly leveredIrr: number | null;
  readonly years: readonly RentalYearResult[];
}

export function calculateMortgagePayment(
  principal: number,
  annualRate: number,
  termYears: number
): MortgagePayment {
  assertFiniteNumber(principal, "principal");
  assertRate(annualRate, "annualRate");
  if (principal < 0) throw new RangeError("principal cannot be negative");
  if (!Number.isInteger(termYears) || termYears <= 0) {
    throw new RangeError("termYears must be a positive integer");
  }

  const months = termYears * 12;
  if (annualRate === 0) {
    const payment = money(principal).div(months);
    return { monthlyPayment: toMoney(payment), annualDebtService: toMoney(payment.mul(12)) };
  }

  const monthlyRate = money(annualRate).div(12);
  const growth = monthlyRate.plus(1).pow(months);
  const payment = money(principal).mul(monthlyRate).mul(growth).div(growth.minus(1));
  return { monthlyPayment: toMoney(payment), annualDebtService: toMoney(payment.mul(12)) };
}

export function projectRental(
  input: RentalStrategyInput,
  horizonYears: number
): RentalProjectionResult {
  validateRentalInput(input, horizonYears);
  const downPayment = money(input.purchasePrice).mul(input.downPaymentPercent);
  const closingCosts = money(input.purchasePrice).mul(input.closingCostPercent);
  const initialCashRequired = downPayment.plus(closingCosts);
  const loanAmount = money(input.purchasePrice).minus(downPayment);
  const mortgage = calculateMortgagePayment(
    loanAmount.toNumber(),
    input.mortgageRate,
    input.mortgageTermYears
  );
  const totalPayments = input.mortgageTermYears * 12;
  const years: RentalYearResult[] = [];
  const cashFlows = [-initialCashRequired.toNumber()];
  let propertyValue = money(input.purchasePrice);
  let monthlyRent = money(input.monthlyRent);
  let paymentsMade = 0;

  for (let year = 1; year <= horizonYears; year += 1) {
    const grossRent = monthlyRent.mul(12);
    const collectedRent = grossRent.mul(money(1).minus(input.vacancyRate));
    const management = collectedRent.mul(input.managementRate);
    const maintenance = propertyValue.mul(input.annualMaintenanceRate);
    const capex = propertyValue.mul(input.annualCapexRate);
    const operatingExpenses = management
      .plus(maintenance)
      .plus(capex)
      .plus(input.annualPropertyTax)
      .plus(input.annualInsurance);
    const noi = collectedRent.minus(operatingExpenses);
    const monthsThisYear = Math.min(12, Math.max(totalPayments - paymentsMade, 0));
    const debtService = money(mortgage.monthlyPayment).mul(monthsThisYear);
    const mortgageBalance = calculateRemainingBalance(
      loanAmount.toNumber(),
      input.mortgageRate,
      totalPayments,
      paymentsMade + monthsThisYear
    );
    paymentsMade += monthsThisYear;
    const timeCost = money(input.hoursPerMonth).mul(12).mul(input.hourlyTimeValue);
    const cashFlow = noi.minus(debtService).minus(timeCost);
    const equity = propertyValue.minus(mortgageBalance);

    years.push({
      year,
      grossRent: toMoney(grossRent),
      noi: toMoney(noi),
      cashFlowAfterDebt: toMoney(cashFlow),
      timeCost: toMoney(timeCost),
      propertyValue: toMoney(propertyValue),
      mortgageBalance: toMoney(mortgageBalance),
      equity: toMoney(equity)
    });
    cashFlows.push(cashFlow.toNumber());
    propertyValue = propertyValue.mul(money(1).plus(input.appreciationRate));
    monthlyRent = monthlyRent.mul(money(1).plus(input.rentGrowthRate));
  }

  const finalYear = years.at(-1);
  if (!finalYear) throw new Error("Rental projection produced no annual results");
  const saleProceeds = money(finalYear.propertyValue)
    .mul(money(1).minus(input.sellingCostPercent))
    .minus(finalYear.mortgageBalance);
  cashFlows[cashFlows.length - 1] = (cashFlows.at(-1) ?? 0) + saleProceeds.toNumber();
  const firstYear = years[0];
  if (!firstYear) throw new Error("Rental projection is missing its first year");

  return {
    initialCashRequired: toMoney(initialCashRequired),
    loanAmount: toMoney(loanAmount),
    monthlyMortgagePayment: mortgage.monthlyPayment,
    firstYearNoi: firstYear.noi,
    firstYearCashFlow: firstYear.cashFlowAfterDebt,
    firstYearCashOnCashReturn: initialCashRequired.isZero()
      ? 0
      : toRate(money(firstYear.cashFlowAfterDebt).div(initialCashRequired)),
    debtServiceCoverageRatio:
      mortgage.annualDebtService === 0
        ? null
        : toRate(money(firstYear.noi).div(mortgage.annualDebtService)),
    terminalEquity: toMoney(saleProceeds),
    leveredIrr: calculateIrr(cashFlows),
    years
  };
}

export function calculateRemainingBalance(
  principal: number,
  annualRate: number,
  totalMonths: number,
  paymentsMade: number
): ReturnType<typeof money> {
  if (paymentsMade >= totalMonths) return money(0);
  if (annualRate === 0) {
    return money(principal).mul(1 - paymentsMade / totalMonths);
  }
  const rate = money(annualRate).div(12);
  const growth = rate.plus(1).pow(totalMonths);
  const paidGrowth = rate.plus(1).pow(paymentsMade);
  return money(principal).mul(growth.minus(paidGrowth)).div(growth.minus(1));
}

export function calculateIrr(cashFlows: readonly number[]): number | null {
  if (
    cashFlows.length < 2 ||
    !cashFlows.some((value) => value < 0) ||
    !cashFlows.some((v) => v > 0)
  ) {
    return null;
  }
  let low = -0.9999;
  let high = 10;
  const npv = (rate: number): number =>
    cashFlows.reduce((sum, value, index) => sum + value / (1 + rate) ** index, 0);

  if (npv(low) * npv(high) > 0) return null;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const midpoint = (low + high) / 2;
    const value = npv(midpoint);
    if (Math.abs(value) < 0.0001) return round(midpoint, 6);
    if (npv(low) * value <= 0) high = midpoint;
    else low = midpoint;
  }
  return round((low + high) / 2, 6);
}

function validateRentalInput(input: RentalStrategyInput, horizonYears: number): void {
  if (!Number.isInteger(horizonYears) || horizonYears <= 0) {
    throw new RangeError("horizonYears must be a positive integer");
  }
  if (input.purchasePrice <= 0) throw new RangeError("purchasePrice must be positive");
  if (input.monthlyRent < 0) throw new RangeError("monthlyRent cannot be negative");
  if (input.hoursPerMonth < 0 || input.hourlyTimeValue < 0) {
    throw new RangeError("time inputs cannot be negative");
  }
  assertRate(input.downPaymentPercent, "downPaymentPercent");
  assertRate(input.closingCostPercent, "closingCostPercent");
  assertRate(input.mortgageRate, "mortgageRate");
  assertRate(input.vacancyRate, "vacancyRate");
  assertRate(input.managementRate, "managementRate");
  assertRate(input.annualMaintenanceRate, "annualMaintenanceRate");
  assertRate(input.annualCapexRate, "annualCapexRate");
  assertRate(input.sellingCostPercent, "sellingCostPercent");
}
