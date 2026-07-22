import type { ConflictFlag, FeeSchedule } from "./models";
import { money, toMoney } from "./money";

export function calculateAnnualAdvisoryFee(
  assetsUnderManagement: number,
  schedule: FeeSchedule
): number {
  if (!Number.isFinite(assetsUnderManagement) || assetsUnderManagement < 0) {
    throw new RangeError("assetsUnderManagement must be a non-negative finite number");
  }
  if (assetsUnderManagement === 0) return 0;
  const sorted = [...schedule.tiers].sort(
    (left, right) =>
      (left.upTo ?? Number.POSITIVE_INFINITY) - (right.upTo ?? Number.POSITIVE_INFINITY)
  );
  if (sorted.length === 0) throw new RangeError("fee schedule must include at least one tier");

  let fee = money(0);
  if (schedule.method === "BREAKPOINT") {
    const applicable = sorted.find(
      (tier) => tier.upTo === null || assetsUnderManagement <= tier.upTo
    );
    if (!applicable) throw new RangeError("fee schedule does not cover the supplied AUM");
    fee = money(assetsUnderManagement).mul(applicable.annualRate);
  } else {
    let previousLimit = 0;
    let remaining = assetsUnderManagement;
    for (const tier of sorted) {
      const tierCapacity = tier.upTo === null ? remaining : Math.max(0, tier.upTo - previousLimit);
      const tierAssets = Math.min(remaining, tierCapacity);
      fee = fee.plus(money(tierAssets).mul(tier.annualRate));
      remaining -= tierAssets;
      if (remaining <= 0) break;
      previousLimit = tier.upTo ?? previousLimit;
    }
  }
  return toMoney(fee.greaterThan(0) ? DecimalMax(fee, schedule.minimumAnnualFee) : 0);
}

export function detectAdvisorRevenueConflict(
  baselineFee: number,
  proposedFee: number,
  materialityThreshold = 100
): ConflictFlag | null {
  const difference = toMoney(money(proposedFee).minus(baselineFee));
  if (Math.abs(difference) < materialityThreshold) return null;
  if (difference > 0) {
    return {
      code: "ADVISOR_REVENUE_INCREASE",
      severity: "REVIEW",
      message:
        "The proposed strategy increases estimated advisory revenue and requires explicit conflict disclosure.",
      annualRevenueDifference: difference
    };
  }
  return {
    code: "ADVISOR_REVENUE_DECREASE",
    severity: "DISCLOSE",
    message:
      "The proposed strategy reduces estimated advisory revenue; documenting this supports a client-first analysis.",
    annualRevenueDifference: difference
  };
}

function DecimalMax(value: ReturnType<typeof money>, floor: number): ReturnType<typeof money> {
  return value.greaterThan(floor) ? value : money(floor);
}
