import type {
  ClientConstitution,
  HouseholdResilienceAssessment,
  HouseholdResilienceComparison,
  HouseholdSnapshot,
  ResilienceBreach,
  ResilienceComponent,
  ResilienceOption,
  ResilienceShock,
  StrategyRequest
} from "./models";
import { assertFiniteNumber, assertRate, round, toMoney } from "./money";

export const noResilienceShock: ResilienceShock = {
  emergencyExpense: 0,
  incomeLossPercent: 0,
  incomeLossMonths: 0,
  employerStockDecline: 0,
  broadMarketDecline: 0,
  spendingIncreaseRate: 0
};

export function resilienceOptionsForStrategies(
  household: HouseholdSnapshot,
  strategies: readonly StrategyRequest[],
  portfolioCapitalOverride?: number
): ResilienceOption[] {
  return strategies.map((strategy, index) => {
    if (strategy.type === "RENTAL" && strategy.rental) {
      return {
        id: `option-rental-${index}`,
        label: "Purchase and operate the rental property",
        capitalRequired: toMoney(
          strategy.rental.purchasePrice *
            (strategy.rental.downPaymentPercent + strategy.rental.closingCostPercent)
        )
      };
    }
    if (strategy.type === "PORTFOLIO" && strategy.portfolio) {
      return {
        id: `option-portfolio-${index}`,
        label: "Invest in a diversified portfolio",
        capitalRequired: toMoney(portfolioCapitalOverride ?? strategy.portfolio.initialInvestment)
      };
    }
    if (strategy.type === "DEBT_PAYDOWN" && strategy.debt) {
      const liability = household.liabilities.find(
        (candidate) => candidate.id === strategy.debt?.liabilityId
      );
      return {
        id: `option-debt-${index}`,
        label: liability ? `Pay down ${liability.name}` : "Pay down selected debt",
        capitalRequired: toMoney(Math.min(strategy.debt.lumpSum, liability?.balance ?? Infinity))
      };
    }
    return {
      id: `option-${strategy.type.toLowerCase()}-${index}`,
      label: "Combine available capital uses",
      capitalRequired: toMoney(portfolioCapitalOverride ?? 0)
    };
  });
}

export function compareHouseholdResilience(
  household: HouseholdSnapshot,
  constitution: ClientConstitution,
  shock: ResilienceShock,
  decisionCapital: number,
  options: readonly ResilienceOption[],
  now = new Date()
): HouseholdResilienceComparison {
  const baseline = evaluateHouseholdResilience(
    household,
    constitution,
    noResilienceShock,
    decisionCapital,
    options,
    now
  );
  const stressed = evaluateHouseholdResilience(
    household,
    constitution,
    shock,
    decisionCapital,
    options,
    now
  );
  const failures = stressed.components
    .filter((component) => !component.passed)
    .sort((left, right) => left.score - right.score);
  return {
    baseline,
    stressed,
    scoreDelta: round(stressed.score - baseline.score, 1),
    optionsLost: Math.max(0, baseline.metrics.feasibleOptions - stressed.metrics.feasibleOptions),
    firstFailure: failures[0] ?? null,
    definition:
      "The Household Optionality Score is a deterministic planning control derived from the household snapshot and Client Constitution. It is not NerdWallet's population-level Financial Resilience Index."
  };
}

export function evaluateHouseholdResilience(
  household: HouseholdSnapshot,
  constitution: ClientConstitution,
  shock: ResilienceShock,
  decisionCapital: number,
  options: readonly ResilienceOption[],
  now = new Date()
): HouseholdResilienceAssessment {
  validateInputs(household, shock, decisionCapital, options);
  const policy = {
    minimumScore: constitution.constraints.minimumResilienceScore ?? 75,
    minimumCreditFreeRunwayMonths: constitution.constraints.minimumCreditFreeRunwayMonths ?? 12,
    maximumShockCreditRequired: constitution.constraints.maximumShockCreditRequired ?? 0,
    minimumFeasibleOptions: constitution.constraints.minimumFeasibleOptions ?? 2
  };
  const annualIncome = household.incomeSources.reduce(
    (sum, source) => sum + source.annualAmount,
    0
  );
  const cashReserveBefore = accountBalance(household, "CASH");
  const taxableBalance = accountBalance(household, "TAXABLE");
  const accessibleLiquidityBefore = cashReserveBefore + taxableBalance;
  const trackedHoldings = household.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerStock = household.holdings
    .filter((holding) => holding.assetClass === "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerStockPercent = trackedHoldings === 0 ? 0 : employerStock / trackedHoldings;
  const taxableEmployerExposure = Math.min(taxableBalance, employerStock);
  const taxableDiversifiedExposure = Math.max(0, taxableBalance - taxableEmployerExposure);
  const employerLoss = taxableEmployerExposure * shock.employerStockDecline;
  const marketLoss = taxableDiversifiedExposure * shock.broadMarketDecline;
  const stressedTaxable = Math.max(0, taxableBalance - employerLoss - marketLoss);
  const stressedMonthlySpending =
    (household.annualSpending / 12) * (1 + shock.spendingIncreaseRate);
  const shockPeriodSpending = stressedMonthlySpending * shock.incomeLossMonths;
  const shockPeriodIncome =
    (annualIncome / 12) * (1 - shock.incomeLossPercent) * shock.incomeLossMonths;
  const incomeFundingGap = Math.max(0, shockPeriodSpending - shockPeriodIncome);
  const shockFundingNeed = shock.emergencyExpense + incomeFundingGap;
  const cashUsed = Math.min(cashReserveBefore, shockFundingNeed);
  const taxableNeed = Math.max(0, shockFundingNeed - cashUsed);
  const taxableUsed = Math.min(stressedTaxable, taxableNeed);
  const creditRequired = Math.max(0, taxableNeed - taxableUsed);
  const cashAfter = Math.max(0, cashReserveBefore - cashUsed);
  const taxableAfter = Math.max(0, stressedTaxable - taxableUsed);
  const accessibleLiquidityAfter = cashAfter + taxableAfter;
  const creditFreeRunwayMonths =
    stressedMonthlySpending === 0
      ? 120
      : Math.min(120, accessibleLiquidityAfter / stressedMonthlySpending);
  const reserveDeficit = Math.max(
    0,
    constitution.constraints.liquidityFloor - accessibleLiquidityAfter
  );
  const availableDecisionCapital = Math.max(0, decisionCapital - reserveDeficit);
  const optionTests = options.map((option) => {
    const shortfall = Math.max(0, option.capitalRequired - availableDecisionCapital);
    return {
      ...option,
      availableCapital: toMoney(availableDecisionCapital),
      feasible: shortfall <= 0.01,
      shortfall: toMoney(shortfall)
    };
  });
  const feasibleOptions = optionTests.filter((option) => option.feasible).length;
  const largestCreditFreeShock = Math.max(
    0,
    cashReserveBefore + stressedTaxable - constitution.constraints.liquidityFloor
  );
  const components: ResilienceComponent[] = [
    component({
      id: "LIQUID_RUNWAY",
      label: "Credit-free runway",
      score: ratioScore(creditFreeRunwayMonths, policy.minimumCreditFreeRunwayMonths),
      weight: 0.25,
      actual: round(creditFreeRunwayMonths, 1),
      target: policy.minimumCreditFreeRunwayMonths,
      unit: "MONTHS",
      passed: creditFreeRunwayMonths >= policy.minimumCreditFreeRunwayMonths,
      explanation: "Months of modeled spending that accessible assets can fund without credit."
    }),
    component({
      id: "LIQUIDITY_FLOOR",
      label: "Protected liquidity",
      score: ratioScore(accessibleLiquidityAfter, constitution.constraints.liquidityFloor),
      weight: 0.2,
      actual: toMoney(accessibleLiquidityAfter),
      target: constitution.constraints.liquidityFloor,
      unit: "CURRENCY",
      passed: accessibleLiquidityAfter >= constitution.constraints.liquidityFloor,
      explanation: "Accessible liquidity remaining after the selected shock."
    }),
    component({
      id: "SHOCK_ABSORPTION",
      label: "Shock absorption",
      score:
        creditRequired <= policy.maximumShockCreditRequired
          ? 100
          : ratioScore(
              Math.max(0, shockFundingNeed - creditRequired),
              Math.max(1, shockFundingNeed)
            ),
      weight: 0.15,
      actual: toMoney(creditRequired),
      target: policy.maximumShockCreditRequired,
      unit: "CURRENCY",
      passed: creditRequired <= policy.maximumShockCreditRequired,
      explanation: "Credit required after cash and accessible taxable assets are exhausted."
    }),
    component({
      id: "INCOME_CONTINUITY",
      label: "Income continuity",
      score: shockPeriodSpending === 0 ? 100 : ratioScore(shockPeriodIncome, shockPeriodSpending),
      weight: 0.15,
      actual: shockPeriodSpending === 0 ? 1 : round(shockPeriodIncome / shockPeriodSpending, 3),
      target: 1,
      unit: "RATE",
      passed: shockPeriodIncome >= shockPeriodSpending,
      explanation: "Income available during the interruption relative to modeled spending."
    }),
    component({
      id: "CONCENTRATION",
      label: "Concentration control",
      score: inverseLimitScore(
        employerStockPercent,
        constitution.constraints.maxEmployerStockPercent
      ),
      weight: 0.1,
      actual: round(employerStockPercent, 4),
      target: constitution.constraints.maxEmployerStockPercent,
      unit: "RATE",
      passed: employerStockPercent <= constitution.constraints.maxEmployerStockPercent,
      explanation: "Tracked employer-stock exposure relative to the signed concentration limit."
    }),
    component({
      id: "OPTIONS_REMAINING",
      label: "Options remaining",
      score: ratioScore(feasibleOptions, policy.minimumFeasibleOptions),
      weight: 0.15,
      actual: feasibleOptions,
      target: policy.minimumFeasibleOptions,
      unit: "COUNT",
      passed: feasibleOptions >= policy.minimumFeasibleOptions,
      explanation: "Candidate uses of decision capital that remain feasible after reserves."
    })
  ];
  const score = round(
    components.reduce((sum, item) => sum + item.score * item.weight, 0),
    1
  );
  const breaches: ResilienceBreach[] = [];
  if (score < policy.minimumScore) {
    breaches.push({
      code: "SCORE_BELOW_FLOOR",
      severity: "HIGH",
      message: `Optionality score ${score.toFixed(1)} is below the client-approved floor of ${policy.minimumScore}.`
    });
  }
  if (creditFreeRunwayMonths < policy.minimumCreditFreeRunwayMonths) {
    breaches.push({
      code: "RUNWAY_BELOW_FLOOR",
      severity: "HIGH",
      message: `Credit-free runway is below ${policy.minimumCreditFreeRunwayMonths} months.`
    });
  }
  if (accessibleLiquidityAfter < constitution.constraints.liquidityFloor) {
    breaches.push({
      code: "LIQUIDITY_FLOOR",
      severity: "HIGH",
      message: "The selected shock consumes the signed household liquidity floor."
    });
  }
  if (creditRequired > policy.maximumShockCreditRequired) {
    breaches.push({
      code: "CREDIT_REQUIRED",
      severity: "HIGH",
      message: `${toMoney(creditRequired).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} of external credit is required under this shock.`
    });
  }
  if (feasibleOptions < policy.minimumFeasibleOptions) {
    breaches.push({
      code: "OPTIONS_BELOW_FLOOR",
      severity: "MEDIUM",
      message: `Only ${feasibleOptions} of ${options.length} modeled capital uses remain feasible.`
    });
  }
  if (employerStockPercent > constitution.constraints.maxEmployerStockPercent) {
    breaches.push({
      code: "CONCENTRATION_LIMIT",
      severity: "HIGH",
      message: "Employer-stock exposure exceeds the signed concentration boundary."
    });
  }

  return {
    methodologyVersion: "household-optionality-v1",
    calculatedAt: now.toISOString(),
    shock: { ...shock },
    score,
    band: resilienceBand(score),
    policy,
    metrics: {
      annualIncome: toMoney(annualIncome),
      annualSpending: toMoney(household.annualSpending),
      cashReserveBefore: toMoney(cashReserveBefore),
      cashReserveAfter: toMoney(cashAfter),
      taxableLiquidityAfter: toMoney(taxableAfter),
      accessibleLiquidityBefore: toMoney(accessibleLiquidityBefore),
      accessibleLiquidityAfter: toMoney(accessibleLiquidityAfter),
      creditFreeRunwayMonths: round(creditFreeRunwayMonths, 1),
      shockFundingNeed: toMoney(shockFundingNeed),
      creditRequired: toMoney(creditRequired),
      largestCreditFreeShock: toMoney(largestCreditFreeShock),
      employerStockPercent: round(employerStockPercent, 4),
      originalDecisionCapital: toMoney(decisionCapital),
      availableDecisionCapital: toMoney(availableDecisionCapital),
      feasibleOptions
    },
    components,
    optionTests,
    breaches
  };
}

export function applyResilienceShock(
  household: HouseholdSnapshot,
  assessment: HouseholdResilienceAssessment
): HouseholdSnapshot {
  const shock = assessment.shock;
  const cashBefore = accountBalance(household, "CASH");
  const taxableBefore = accountBalance(household, "TAXABLE");
  const cashAfter = assessment.metrics.cashReserveAfter;
  const taxableAfter = assessment.metrics.taxableLiquidityAfter;
  return {
    ...household,
    annualSpending: household.annualSpending * (1 + shock.spendingIncreaseRate),
    accounts: household.accounts.map((account) => {
      if (account.type === "CASH") {
        const share = cashBefore === 0 ? 0 : account.balance / cashBefore;
        return { ...account, balance: toMoney(cashAfter * share) };
      }
      if (account.type === "TAXABLE") {
        const share = taxableBefore === 0 ? 0 : account.balance / taxableBefore;
        return { ...account, balance: toMoney(taxableAfter * share) };
      }
      if (account.type === "RETIREMENT" || account.type === "EDUCATION") {
        return {
          ...account,
          balance: toMoney(account.balance * (1 - shock.broadMarketDecline * 0.75))
        };
      }
      return account;
    }),
    holdings: household.holdings.map((holding) => {
      const decline =
        holding.assetClass === "EMPLOYER_STOCK"
          ? shock.employerStockDecline
          : holding.assetClass === "US_EQUITY" || holding.assetClass === "INTL_EQUITY"
            ? shock.broadMarketDecline
            : holding.assetClass === "BOND"
              ? shock.broadMarketDecline * 0.25
              : 0;
      return { ...holding, marketValue: toMoney(holding.marketValue * (1 - decline)) };
    })
  };
}

function accountBalance(
  household: HouseholdSnapshot,
  type: HouseholdSnapshot["accounts"][number]["type"]
): number {
  return household.accounts
    .filter((account) => account.type === type)
    .reduce((sum, account) => sum + account.balance, 0);
}

function component(input: ResilienceComponent): ResilienceComponent {
  return input;
}

function ratioScore(actual: number, target: number): number {
  if (target <= 0) return 100;
  return round(Math.max(0, Math.min(100, (actual / target) * 100)), 1);
}

function inverseLimitScore(actual: number, limit: number): number {
  if (actual <= limit) return 100;
  if (limit <= 0) return 0;
  return round(Math.max(0, 100 - ((actual - limit) / limit) * 100), 1);
}

function resilienceBand(score: number): HouseholdResilienceAssessment["band"] {
  if (score >= 85) return "FORTIFIED";
  if (score >= 70) return "RESILIENT";
  if (score >= 50) return "EXPOSED";
  return "FRAGILE";
}

function validateInputs(
  household: HouseholdSnapshot,
  shock: ResilienceShock,
  decisionCapital: number,
  options: readonly ResilienceOption[]
): void {
  assertFiniteNumber(household.annualSpending, "annualSpending");
  if (household.annualSpending <= 0) throw new RangeError("annualSpending must be positive");
  assertFiniteNumber(decisionCapital, "decisionCapital");
  if (decisionCapital < 0) throw new RangeError("decisionCapital cannot be negative");
  assertFiniteNumber(shock.emergencyExpense, "emergencyExpense");
  if (shock.emergencyExpense < 0) throw new RangeError("emergencyExpense cannot be negative");
  assertRate(shock.incomeLossPercent, "incomeLossPercent");
  assertFiniteNumber(shock.incomeLossMonths, "incomeLossMonths");
  if (shock.incomeLossMonths < 0 || shock.incomeLossMonths > 36) {
    throw new RangeError("incomeLossMonths must be between 0 and 36");
  }
  assertRate(shock.employerStockDecline, "employerStockDecline");
  assertRate(shock.broadMarketDecline, "broadMarketDecline");
  assertRate(shock.spendingIncreaseRate, "spendingIncreaseRate");
  for (const option of options) {
    assertFiniteNumber(option.capitalRequired, `${option.label} capitalRequired`);
    if (option.capitalRequired < 0) throw new RangeError("Option capital cannot be negative");
  }
}
