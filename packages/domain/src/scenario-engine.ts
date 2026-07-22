import { calculateAnnualAdvisoryFee } from "./fees";
import { calculateFiNumber, projectFinancialIndependence } from "./financial-independence";
import type {
  AssumptionSet,
  FeeSchedule,
  HouseholdSnapshot,
  RentalStrategyInput,
  ScenarioResult,
  ScenarioRisk,
  StrategyRequest
} from "./models";
import { round, toMoney } from "./money";
import { projectPortfolio } from "./portfolio";
import { projectRental } from "./real-estate";

interface StrategyEffects {
  readonly label: string;
  readonly startingLiquidAssets: number;
  readonly startingPropertyEquity: number;
  readonly startingLiabilities: number;
  readonly annualSavings: number;
  readonly portfolioReturn: number;
  readonly propertyGrowth: number;
  readonly annualDebtReduction: number;
  readonly annualCashFlow: number;
  readonly clientTimeCost: number;
  readonly investableAssetsChange: number;
  readonly risks: readonly ScenarioRisk[];
  readonly calculations: Readonly<Record<string, number | string | null>>;
}

export function runScenarioComparison(
  household: HouseholdSnapshot,
  requests: readonly StrategyRequest[],
  assumptions: AssumptionSet,
  feeSchedule: FeeSchedule
): ScenarioResult[] {
  if (requests.length < 2) throw new RangeError("At least two alternatives are required");
  return requests.map((request) => runScenario(household, request, assumptions, feeSchedule));
}

export function runScenario(
  household: HouseholdSnapshot,
  request: StrategyRequest,
  assumptions: AssumptionSet,
  feeSchedule: FeeSchedule
): ScenarioResult {
  validateHousehold(household);
  const effects = calculateStrategyEffects(household, request, assumptions);
  const currentAge = Math.min(...household.members.map((member) => member.age));
  const fiProjection = projectFinancialIndependence({
    currentAge,
    currentLiquidAssets: effects.startingLiquidAssets,
    currentPropertyEquity: effects.startingPropertyEquity,
    currentLiabilities: effects.startingLiabilities,
    annualSpending: household.annualSpending,
    annualSavings: effects.annualSavings,
    annualPortfolioReturn: effects.portfolioReturn,
    annualPropertyGrowth: effects.propertyGrowth,
    annualDebtReduction: effects.annualDebtReduction,
    assumptions
  });
  const horizonTarget = calculateFiNumber(
    household.annualSpending * (1 + assumptions.inflationRate) ** assumptions.planningHorizonYears,
    assumptions.withdrawalRate
  );
  const liquidProjection = projectPortfolio(
    {
      initialInvestment: Math.max(0, effects.startingLiquidAssets),
      annualContribution: Math.max(0, effects.annualSavings),
      equityAllocation: 0.7,
      bondAllocation: 0.25,
      cashAllocation: 0.05,
      fundExpenseRate: 0.0015
    },
    {
      ...assumptions,
      equityReturnMean: effects.portfolioReturn + 0.3 * assumptions.bondReturnMean,
      simulationPaths: Math.min(assumptions.simulationPaths, 2_000)
    },
    horizonTarget
  );
  const managedAssets = managedAssetsFor(household);
  const proposedManagedAssets = Math.max(0, managedAssets + effects.investableAssetsChange);
  const firstYearAdvisoryFee = calculateAnnualAdvisoryFee(proposedManagedAssets, feeSchedule);
  const cumulativeAdvisoryFees = fiProjection.timeline.reduce((total, year) => {
    const managedShare =
      effects.startingLiquidAssets === 0 ? 0 : proposedManagedAssets / effects.startingLiquidAssets;
    return (
      total + calculateAnnualAdvisoryFee(Math.max(0, year.liquidAssets * managedShare), feeSchedule)
    );
  }, 0);
  const finalYear = fiProjection.timeline.at(-1);
  if (!finalYear) throw new Error("Scenario projection did not produce a final year");

  return {
    id: `scenario-${request.type.toLowerCase()}-v${assumptions.version}`,
    strategy: request.type,
    label: effects.label,
    fiNumber: fiProjection.fiNumber,
    fiAge: fiProjection.fiAge,
    fiYear: fiProjection.fiYear,
    successProbability: liquidProjection.successProbability,
    projectedNetWorth: finalYear.netWorth,
    projectedLiquidAssets: finalYear.liquidAssets,
    annualCashFlow: effects.annualCashFlow,
    firstYearAdvisoryFee,
    cumulativeAdvisoryFees: toMoney(cumulativeAdvisoryFees),
    clientTimeCost: effects.clientTimeCost,
    investableAssetsChange: effects.investableAssetsChange,
    timeline: fiProjection.timeline,
    risks: effects.risks,
    assumptions,
    calculations: {
      ...effects.calculations,
      horizonFiTarget: horizonTarget,
      portfolioP10: liquidProjection.percentile10,
      portfolioP50: liquidProjection.percentile50,
      portfolioP90: liquidProjection.percentile90
    }
  };
}

function calculateStrategyEffects(
  household: HouseholdSnapshot,
  request: StrategyRequest,
  assumptions: AssumptionSet
): StrategyEffects {
  const base = householdBase(household, assumptions);
  if (request.type === "RENTAL") {
    if (!request.rental) throw new RangeError("Rental strategy inputs are required");
    return rentalEffects(household, request.rental, assumptions, base);
  }
  if (request.type === "PORTFOLIO") {
    if (!request.portfolio) throw new RangeError("Portfolio strategy inputs are required");
    const unmanaged = unmanagedAssetsFor(household);
    return {
      ...base,
      label: "Invest in a diversified portfolio",
      portfolioReturn: portfolioExpectedReturn(request.portfolio, assumptions),
      investableAssetsChange: Math.min(unmanaged, request.portfolio.initialInvestment),
      calculations: {
        decisionCapital: request.portfolio.initialInvestment,
        equityAllocation: request.portfolio.equityAllocation,
        expectedReturn: portfolioExpectedReturn(request.portfolio, assumptions)
      }
    };
  }
  if (request.type === "DEBT_PAYDOWN") {
    if (!request.debt) throw new RangeError("Debt-paydown strategy inputs are required");
    const liability = household.liabilities.find((item) => item.id === request.debt?.liabilityId);
    if (!liability) throw new RangeError("The selected liability was not found");
    const lumpSum = Math.min(request.debt.lumpSum, liability.balance, base.startingLiquidAssets);
    const annualInterestSaved = lumpSum * liability.annualRate;
    const managedReduction = Math.max(0, lumpSum - unmanagedAssetsFor(household));
    const risks = [...base.risks];
    if (base.startingLiquidAssets - lumpSum < household.preferences.liquidityFloor) {
      risks.push({
        code: "LIQUIDITY_FLOOR",
        severity: "HIGH",
        message: "The proposed paydown would reduce liquid assets below the household floor."
      });
    }
    return {
      ...base,
      label: `Pay down ${liability.name}`,
      startingLiquidAssets: base.startingLiquidAssets - lumpSum,
      startingLiabilities: base.startingLiabilities - lumpSum,
      annualSavings: base.annualSavings + annualInterestSaved,
      investableAssetsChange: -managedReduction,
      risks,
      calculations: {
        lumpSum,
        liabilityRate: liability.annualRate,
        firstYearInterestSaved: annualInterestSaved
      }
    };
  }

  if (!request.mixed || !request.rental || !request.portfolio || !request.debt) {
    throw new RangeError("Mixed strategy requires mixed, rental, portfolio, and debt inputs");
  }
  const allocationTotal =
    request.mixed.rentalAllocation +
    request.mixed.portfolioAllocation +
    request.mixed.debtAllocation;
  if (Math.abs(allocationTotal - 1) > 0.000001) {
    throw new RangeError("Mixed strategy allocations must sum to 1");
  }
  const decisionCapital = request.portfolio.initialInvestment;
  const rentalCapital = decisionCapital * request.mixed.rentalAllocation;
  const scaledRental = scaleRentalToCash(request.rental, rentalCapital);
  const rental = projectRental(scaledRental, assumptions.planningHorizonYears);
  const liability = household.liabilities.find((item) => item.id === request.debt?.liabilityId);
  if (!liability) throw new RangeError("The selected mixed-strategy liability was not found");
  const debtCapital = Math.min(decisionCapital * request.mixed.debtAllocation, liability.balance);
  const portfolioCapital = decisionCapital * request.mixed.portfolioAllocation;
  const totalInitialUse = rental.initialCashRequired + debtCapital;
  const investableChange =
    Math.min(unmanagedAssetsFor(household), portfolioCapital) - totalInitialUse;
  return {
    ...base,
    label: "Combine rental, portfolio, and debt reduction",
    startingLiquidAssets: Math.max(0, base.startingLiquidAssets - totalInitialUse),
    startingPropertyEquity:
      base.startingPropertyEquity + scaledRental.purchasePrice * scaledRental.downPaymentPercent,
    startingLiabilities: base.startingLiabilities - debtCapital,
    annualSavings:
      base.annualSavings + rental.firstYearCashFlow + debtCapital * liability.annualRate,
    portfolioReturn: portfolioExpectedReturn(request.portfolio, assumptions),
    annualCashFlow: rental.firstYearCashFlow,
    clientTimeCost: scaledRental.hoursPerMonth * 12 * scaledRental.hourlyTimeValue,
    investableAssetsChange: investableChange,
    risks: [...base.risks, ...rentalRisks(household, rental)],
    calculations: {
      decisionCapital,
      rentalCapital,
      portfolioCapital,
      debtCapital,
      rentalCashFlow: rental.firstYearCashFlow,
      rentalIrr: rental.leveredIrr
    }
  };
}

function householdBase(household: HouseholdSnapshot, assumptions: AssumptionSet): StrategyEffects {
  const income = household.incomeSources.reduce((sum, source) => sum + source.annualAmount, 0);
  const annualSavings = Math.max(0, income - household.annualSpending);
  const holdingsValue = household.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerStock = household.holdings
    .filter((holding) => holding.assetClass === "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const risks: ScenarioRisk[] = [];
  if (holdingsValue > 0 && employerStock / holdingsValue >= 0.25) {
    risks.push({
      code: "EMPLOYER_STOCK_CONCENTRATION",
      severity: "HIGH",
      message: `${round((employerStock / holdingsValue) * 100, 1)}% of tracked holdings are employer stock.`
    });
  }
  return {
    label: "Current plan",
    startingLiquidAssets: liquidAssetsFor(household),
    startingPropertyEquity: propertyEquityFor(household),
    startingLiabilities: household.liabilities.reduce((sum, item) => sum + item.balance, 0),
    annualSavings,
    portfolioReturn:
      assumptions.equityReturnMean * 0.7 +
      assumptions.bondReturnMean * 0.25 +
      assumptions.cashReturn * 0.05 -
      assumptions.taxDrag,
    propertyGrowth: 0.025,
    annualDebtReduction: household.liabilities.reduce(
      (sum, item) => sum + Math.min(item.balance, item.monthlyPayment * 12 * 0.55),
      0
    ),
    annualCashFlow: 0,
    clientTimeCost: 0,
    investableAssetsChange: 0,
    risks,
    calculations: {}
  };
}

function rentalEffects(
  household: HouseholdSnapshot,
  input: RentalStrategyInput,
  assumptions: AssumptionSet,
  base: StrategyEffects
): StrategyEffects {
  const rental = projectRental(input, assumptions.planningHorizonYears);
  const managedReduction = Math.max(0, rental.initialCashRequired - unmanagedAssetsFor(household));
  return {
    ...base,
    label: "Purchase and operate the rental property",
    startingLiquidAssets: Math.max(0, base.startingLiquidAssets - rental.initialCashRequired),
    startingPropertyEquity:
      base.startingPropertyEquity + input.purchasePrice * input.downPaymentPercent,
    annualSavings: base.annualSavings + rental.firstYearCashFlow,
    propertyGrowth: input.appreciationRate,
    annualCashFlow: rental.firstYearCashFlow,
    clientTimeCost: input.hoursPerMonth * 12 * input.hourlyTimeValue,
    investableAssetsChange: -managedReduction,
    risks: [...base.risks, ...rentalRisks(household, rental)],
    calculations: {
      initialCashRequired: rental.initialCashRequired,
      monthlyMortgagePayment: rental.monthlyMortgagePayment,
      firstYearNoi: rental.firstYearNoi,
      firstYearCashOnCashReturn: rental.firstYearCashOnCashReturn,
      debtServiceCoverageRatio: rental.debtServiceCoverageRatio,
      rentalIrr: rental.leveredIrr,
      terminalRentalEquity: rental.terminalEquity
    }
  };
}

function rentalRisks(
  household: HouseholdSnapshot,
  rental: ReturnType<typeof projectRental>
): ScenarioRisk[] {
  const risks: ScenarioRisk[] = [];
  if (rental.firstYearCashFlow < 0) {
    risks.push({
      code: "NEGATIVE_RENTAL_CASH_FLOW",
      severity: "HIGH",
      message: "The rental produces negative first-year cash flow after debt and time cost."
    });
  }
  if (rental.debtServiceCoverageRatio !== null && rental.debtServiceCoverageRatio < 1.2) {
    risks.push({
      code: "LOW_DSCR",
      severity: "HIGH",
      message: "Debt-service coverage is below the 1.20 planning threshold."
    });
  }
  if (
    rental.initialCashRequired >
    liquidAssetsFor(household) - household.preferences.liquidityFloor
  ) {
    risks.push({
      code: "LIQUIDITY_FLOOR",
      severity: "HIGH",
      message: "The acquisition would breach the household liquidity floor."
    });
  }
  return risks;
}

function portfolioExpectedReturn(
  input: NonNullable<StrategyRequest["portfolio"]>,
  assumptions: AssumptionSet
): number {
  return (
    input.equityAllocation * assumptions.equityReturnMean +
    input.bondAllocation * assumptions.bondReturnMean +
    input.cashAllocation * assumptions.cashReturn -
    input.fundExpenseRate -
    assumptions.taxDrag
  );
}

function scaleRentalToCash(input: RentalStrategyInput, targetCash: number): RentalStrategyInput {
  const originalCash = input.purchasePrice * (input.downPaymentPercent + input.closingCostPercent);
  const scale = originalCash === 0 ? 0 : targetCash / originalCash;
  return {
    ...input,
    purchasePrice: input.purchasePrice * scale,
    monthlyRent: input.monthlyRent * scale,
    annualPropertyTax: input.annualPropertyTax * scale,
    annualInsurance: input.annualInsurance * scale,
    hoursPerMonth: input.hoursPerMonth * Math.max(scale, 0.5)
  };
}

function liquidAssetsFor(household: HouseholdSnapshot): number {
  return household.accounts.reduce((sum, account) => sum + account.balance, 0);
}

function managedAssetsFor(household: HouseholdSnapshot): number {
  return household.accounts
    .filter((account) => account.managed)
    .reduce((sum, account) => sum + account.balance, 0);
}

function unmanagedAssetsFor(household: HouseholdSnapshot): number {
  return household.accounts
    .filter((account) => !account.managed)
    .reduce((sum, account) => sum + account.balance, 0);
}

function propertyEquityFor(household: HouseholdSnapshot): number {
  return household.properties.reduce(
    (sum, property) => sum + property.marketValue - property.mortgageBalance,
    0
  );
}

function validateHousehold(household: HouseholdSnapshot): void {
  if (household.members.length === 0) throw new RangeError("A household requires a member");
  if (household.annualSpending < 0) throw new RangeError("annualSpending cannot be negative");
  if (household.preferences.liquidityFloor < 0) {
    throw new RangeError("liquidityFloor cannot be negative");
  }
}
