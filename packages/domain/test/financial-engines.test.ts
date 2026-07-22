import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  analyzeDecision,
  calculateAnnualAdvisoryFee,
  calculateFiNumber,
  calculateIrr,
  calculateMortgagePayment,
  demoAssumptions,
  demoClientConstitution,
  demoFeeSchedule,
  demoHousehold,
  demoStrategies,
  detectAdvisorRevenueConflict,
  estimateRealReturn,
  projectFinancialIndependence,
  projectPortfolio,
  projectRental,
  runScenarioComparison
} from "../src";

describe("financial-independence engine", () => {
  it("computes the canonical FI number", () => {
    expect(calculateFiNumber(120_000, 0.04)).toBe(3_000_000);
  });

  it("uses liquid assets rather than home equity to determine FI", () => {
    const result = projectFinancialIndependence({
      currentAge: 40,
      currentLiquidAssets: 100_000,
      currentPropertyEquity: 5_000_000,
      currentLiabilities: 0,
      annualSpending: 100_000,
      annualSavings: 0,
      annualPortfolioReturn: 0,
      annualPropertyGrowth: 0,
      annualDebtReduction: 0,
      assumptions: { ...demoAssumptions, planningHorizonYears: 1 }
    });
    expect(result.fiAge).toBeNull();
    expect(result.timeline[0]?.netWorth).toBe(5_100_000);
  });

  it("never returns a negative FI number for valid inputs", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1_000_000, noNaN: true }),
        fc.double({ min: 0.01, max: 0.1, noNaN: true }),
        (spending, withdrawalRate) => {
          expect(calculateFiNumber(spending, withdrawalRate)).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it("validates withdrawal rates and calculates real return", () => {
    expect(() => calculateFiNumber(100_000, 0)).toThrow("greater than zero");
    expect(estimateRealReturn(0.07, 0.025)).toBeCloseTo(0.043902, 6);
  });
});

describe("real-estate engine", () => {
  it("matches a standard amortizing mortgage payment", () => {
    const payment = calculateMortgagePayment(400_000, 0.06, 30);
    expect(payment.monthlyPayment).toBeCloseTo(2_398.2, 1);
  });

  it("includes vacancy, time cost, debt service and terminal sale equity", () => {
    const rental = demoStrategies[0]?.rental;
    if (!rental) throw new Error("Demo rental is missing");
    const result = projectRental(rental, 10);
    expect(result.initialCashRequired).toBe(147_000);
    expect(result.years).toHaveLength(10);
    expect(result.years[0]?.timeCost).toBe(6_480);
    expect(result.terminalEquity).toBeGreaterThan(0);
  });

  it("calculates a known IRR", () => {
    expect(calculateIrr([-100, 110])).toBeCloseTo(0.1, 5);
  });

  it("handles zero-rate amortization and invalid cash-flow sets", () => {
    expect(calculateMortgagePayment(120_000, 0, 10).monthlyPayment).toBe(1_000);
    expect(calculateIrr([100, 20])).toBeNull();
  });
});

describe("portfolio and fee engines", () => {
  it("produces reproducible seeded simulations", () => {
    const portfolio = demoStrategies[1]?.portfolio;
    if (!portfolio) throw new Error("Demo portfolio is missing");
    const first = projectPortfolio(portfolio, demoAssumptions, 2_000_000);
    const second = projectPortfolio(portfolio, demoAssumptions, 2_000_000);
    expect(first).toEqual(second);
    expect(first.percentile10).toBeLessThanOrEqual(first.percentile50);
    expect(first.percentile50).toBeLessThanOrEqual(first.percentile90);
  });

  it("calculates blended advisory tiers", () => {
    expect(calculateAnnualAdvisoryFee(1_500_000, demoFeeSchedule)).toBe(12_500);
  });

  it("applies minimum and breakpoint fee schedules", () => {
    expect(
      calculateAnnualAdvisoryFee(100_000, {
        method: "BREAKPOINT",
        minimumAnnualFee: 2_000,
        tiers: [{ upTo: 500_000, annualRate: 0.01 }]
      })
    ).toBe(2_000);
    expect(calculateAnnualAdvisoryFee(0, demoFeeSchedule)).toBe(0);
  });

  it("makes advisor revenue conflicts explicit in both directions", () => {
    expect(detectAdvisorRevenueConflict(10_000, 12_000)?.code).toBe("ADVISOR_REVENUE_INCREASE");
    expect(detectAdvisorRevenueConflict(12_000, 10_000)?.code).toBe("ADVISOR_REVENUE_DECREASE");
  });
});

describe("scenario engine", () => {
  it("compares alternatives with the same versioned assumptions", () => {
    const scenarios = runScenarioComparison(
      demoHousehold,
      demoStrategies,
      demoAssumptions,
      demoFeeSchedule
    );
    expect(scenarios).toHaveLength(3);
    expect(new Set(scenarios.map((scenario) => scenario.assumptions.id))).toEqual(
      new Set([demoAssumptions.id])
    );
    expect(scenarios.every((scenario) => scenario.timeline.length === 31)).toBe(true);
    expect(
      scenarios.find((scenario) => scenario.strategy === "RENTAL")?.risks.length
    ).toBeGreaterThan(0);
  });

  it("rejects a comparison with fewer than two alternatives", () => {
    expect(() =>
      runScenarioComparison(demoHousehold, [demoStrategies[0]!], demoAssumptions, demoFeeSchedule)
    ).toThrow("At least two alternatives");
  });

  it("enforces one shared capital pool and identifies rental infeasibility", () => {
    const decisionCapital = 71_000;
    const requests = demoStrategies.map((strategy) => {
      if (strategy.type === "PORTFOLIO" && strategy.portfolio) {
        return {
          ...strategy,
          portfolio: { ...strategy.portfolio, initialInvestment: decisionCapital }
        };
      }
      if (strategy.type === "DEBT_PAYDOWN" && strategy.debt) {
        return { ...strategy, debt: { ...strategy.debt, lumpSum: 42_000 } };
      }
      return strategy;
    });
    const context = { decisionCapital, constitution: demoClientConstitution };
    const scenarios = runScenarioComparison(
      demoHousehold,
      requests,
      demoAssumptions,
      demoFeeSchedule,
      context
    );
    const rental = scenarios.find((scenario) => scenario.strategy === "RENTAL");
    const portfolio = scenarios.find((scenario) => scenario.strategy === "PORTFOLIO");
    const debt = scenarios.find((scenario) => scenario.strategy === "DEBT_PAYDOWN");
    expect(rental?.capitalUse).toMatchObject({ available: 71_000, feasible: false });
    expect(rental?.risks.some((risk) => risk.code === "DECISION_CAPITAL_SHORTFALL")).toBe(true);
    expect(portfolio?.capitalUse).toMatchObject({ deployed: 71_000, residual: 0 });
    expect(debt?.capitalUse).toMatchObject({ deployed: 42_000, residual: 29_000 });
  });

  it("keeps rental-only inputs isolated and produces deterministic decision boundaries", () => {
    const context = { decisionCapital: 147_000, constitution: demoClientConstitution };
    const baseline = runScenarioComparison(
      demoHousehold,
      demoStrategies,
      demoAssumptions,
      demoFeeSchedule,
      context
    );
    const changedRequests = demoStrategies.map((strategy) =>
      strategy.type === "RENTAL" && strategy.rental
        ? {
            ...strategy,
            rental: { ...strategy.rental, purchasePrice: 515_000, mortgageRate: 0.0425 }
          }
        : strategy
    );
    const changed = runScenarioComparison(
      demoHousehold,
      changedRequests,
      demoAssumptions,
      demoFeeSchedule,
      context
    );
    expect(changed.find((scenario) => scenario.strategy === "RENTAL")).not.toEqual(
      baseline.find((scenario) => scenario.strategy === "RENTAL")
    );
    expect(changed.find((scenario) => scenario.strategy === "PORTFOLIO")).toEqual(
      baseline.find((scenario) => scenario.strategy === "PORTFOLIO")
    );
    expect(changed.find((scenario) => scenario.strategy === "DEBT_PAYDOWN")).toEqual(
      baseline.find((scenario) => scenario.strategy === "DEBT_PAYDOWN")
    );
    const analysis = analyzeDecision(
      demoHousehold,
      demoStrategies,
      demoAssumptions,
      demoFeeSchedule,
      context,
      baseline
    );
    expect(analysis?.sensitivity).toHaveLength(9);
    expect(analysis?.maxAffordablePurchasePrice).toBe(525_000);
    expect(analysis?.definition).toContain("same assumption version");
  });
});
