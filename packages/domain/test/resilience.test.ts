import { describe, expect, it } from "vitest";
import {
  applyResilienceShock,
  compareHouseholdResilience,
  demoClientConstitution,
  demoHousehold,
  evaluateHouseholdResilience,
  noResilienceShock,
  type ResilienceOption,
  type ResilienceShock
} from "../src";

const options: readonly ResilienceOption[] = [
  { id: "rental", label: "Rental property", capitalRequired: 147_000 },
  { id: "portfolio", label: "Diversified portfolio", capitalRequired: 71_000 },
  { id: "debt", label: "Student-debt paydown", capitalRequired: 42_000 }
];

const compoundShock: ResilienceShock = {
  emergencyExpense: 500_000,
  incomeLossPercent: 1,
  incomeLossMonths: 12,
  employerStockDecline: 0.4,
  broadMarketDecline: 0.25,
  spendingIncreaseRate: 0.1
};

describe("household optionality engine", () => {
  it("produces a transparent fortified baseline under the signed policy", () => {
    const result = evaluateHouseholdResilience(
      demoHousehold,
      demoClientConstitution,
      noResilienceShock,
      71_000,
      options,
      new Date("2026-07-22T18:00:00.000Z")
    );

    expect(result.methodologyVersion).toBe("household-optionality-v1");
    expect(result.score).toBe(100);
    expect(result.band).toBe("FORTIFIED");
    expect(result.metrics.feasibleOptions).toBe(2);
    expect(result.components.reduce((sum, component) => sum + component.weight, 0)).toBe(1);
    expect(result.breaches).toHaveLength(0);
  });

  it("makes compound shocks monotonic, exposes credit need, and removes options", () => {
    const comparison = compareHouseholdResilience(
      demoHousehold,
      demoClientConstitution,
      compoundShock,
      71_000,
      options,
      new Date("2026-07-22T18:00:00.000Z")
    );

    expect(comparison.stressed.score).toBeLessThan(comparison.baseline.score);
    expect(comparison.stressed.metrics.accessibleLiquidityAfter).toBeLessThan(
      comparison.baseline.metrics.accessibleLiquidityAfter
    );
    expect(comparison.stressed.metrics.creditRequired).toBeGreaterThan(0);
    expect(comparison.stressed.metrics.availableDecisionCapital).toBe(0);
    expect(comparison.optionsLost).toBe(2);
    expect(comparison.stressed.breaches.map((breach) => breach.code)).toEqual(
      expect.arrayContaining([
        "SCORE_BELOW_FLOOR",
        "RUNWAY_BELOW_FLOOR",
        "LIQUIDITY_FLOOR",
        "CREDIT_REQUIRED",
        "OPTIONS_BELOW_FLOOR"
      ])
    );
  });

  it("creates a stressed clone without mutating canonical facts", () => {
    const original = JSON.stringify(demoHousehold);
    const assessment = evaluateHouseholdResilience(
      demoHousehold,
      demoClientConstitution,
      compoundShock,
      71_000,
      options
    );
    const stressed = applyResilienceShock(demoHousehold, assessment);

    expect(stressed.accounts.find((account) => account.type === "CASH")?.balance).toBe(0);
    expect(stressed.annualSpending).toBeGreaterThan(demoHousehold.annualSpending);
    expect(JSON.stringify(demoHousehold)).toBe(original);
  });

  it("rejects impossible shock inputs", () => {
    expect(() =>
      evaluateHouseholdResilience(
        demoHousehold,
        demoClientConstitution,
        { ...noResilienceShock, incomeLossPercent: 1.1 },
        71_000,
        options
      )
    ).toThrow("incomeLossPercent");
  });
});
