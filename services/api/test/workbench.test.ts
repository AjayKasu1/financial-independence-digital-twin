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
  mortgageRate: 0.0675
};

describe("advisor workbench", () => {
  it("runs a session-only comparison without mutating the canonical household", () => {
    const original = JSON.stringify(demoHousehold);
    const result = runAdvisorWorkbench(demoHousehold, demoClientConstitution, input);

    expect(result.mode).toBe("SESSION_ONLY");
    expect(result.sandboxId).toMatch(/^sandbox-/);
    expect(result.scenarios).toHaveLength(3);
    expect(result.analysis).not.toBeNull();
    expect(result.clientConstitution.approvedBy).toContain("not client-approved");
    expect(JSON.stringify(demoHousehold)).toBe(original);
  });

  it("applies concentration and workload stress inputs to deterministic risk checks", () => {
    const result = runAdvisorWorkbench(demoHousehold, demoClientConstitution, input);
    const rental = result.scenarios.find((scenario) => scenario.strategy === "RENTAL");

    expect(rental?.risks.some((risk) => risk.code === "EMPLOYER_STOCK_CONCENTRATION")).toBe(true);
    expect(result.input.maxRealEstateHoursPerMonth).toBe(4);
    expect(result.input.employerStockPercent).toBe(0.34);
  });
});
