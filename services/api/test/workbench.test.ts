import { describe, expect, it } from "vitest";
import { demoClientConstitution, demoHousehold } from "@fidt/domain";
import { runAdvisorWorkbench } from "../src/workbench";

const input = {
  rsuVestAmount: 71_000,
  employerStockPercent: 0.34,
  liquidityFloor: 175_000,
  targetFiAge: 50,
  maxRealEstateHoursPerMonth: 4,
  rentalPurchasePrice: 525_000,
  monthlyMarketRent: 3_650,
  mortgageRate: 0.0675,
  resilienceShock: {
    emergencyExpense: 0,
    incomeLossPercent: 0,
    incomeLossMonths: 0,
    employerStockDecline: 0,
    broadMarketDecline: 0,
    spendingIncreaseRate: 0
  }
};

describe("advisor workbench", () => {
  it("runs a session-only comparison without mutating the canonical household", () => {
    const original = JSON.stringify(demoHousehold);
    const result = runAdvisorWorkbench(demoHousehold, demoClientConstitution, input);

    expect(result.mode).toBe("SESSION_ONLY");
    expect(result.sandboxId).toMatch(/^sandbox-/);
    expect(result.scenarios).toHaveLength(3);
    expect(result.analysis).not.toBeNull();
    expect(result.resilience.baseline.score).toBeGreaterThanOrEqual(75);
    expect(result.publicContext.score).toBe(63.1);
    expect(result.publicContext.creditReliancePercent).toBe(33);
    expect(result.publicContext.thousandDollarCashCoveragePercent).toBe(65);
    expect(result.publicContext.usageBoundary).toContain("Population context only");
    expect(result.clientConstitution.approvedBy).toContain("not client-approved");
    expect(JSON.stringify(demoHousehold)).toBe(original);
  });

  it("reduces optionality and decision capital under a compound resilience shock", () => {
    const result = runAdvisorWorkbench(demoHousehold, demoClientConstitution, {
      ...input,
      resilienceShock: {
        emergencyExpense: 500_000,
        incomeLossPercent: 1,
        incomeLossMonths: 12,
        employerStockDecline: 0.4,
        broadMarketDecline: 0.25,
        spendingIncreaseRate: 0.1
      }
    });

    expect(result.resilience.stressed.score).toBeLessThan(result.resilience.baseline.score);
    expect(result.resilience.stressed.metrics.availableDecisionCapital).toBe(0);
    expect(result.resilience.optionsLost).toBeGreaterThan(0);
    expect(
      result.scenarios.find((scenario) => scenario.strategy === "PORTFOLIO")?.capitalUse
    ).toMatchObject({ available: 0, deployed: 0 });
  });

  it("applies concentration and workload stress inputs to deterministic risk checks", () => {
    const result = runAdvisorWorkbench(demoHousehold, demoClientConstitution, input);
    const rental = result.scenarios.find((scenario) => scenario.strategy === "RENTAL");

    expect(rental?.risks.some((risk) => risk.code === "EMPLOYER_STOCK_CONCENTRATION")).toBe(true);
    expect(result.input.maxRealEstateHoursPerMonth).toBe(4);
    expect(result.input.employerStockPercent).toBe(0.34);
  });
});
