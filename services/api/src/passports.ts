import type {
  ComplianceDecision,
  DecisionPassportPayload,
  DecisionPassportProof,
  DecisionPassportStatus,
  LiveDataResponse,
  PassportConditionResult,
  PassportValidityCheck,
  RecommendationDraft,
  ScenarioComparisonResponse,
  ValidityCondition,
  ValidityMetric
} from "@fidt/contracts";
import {
  evaluateHouseholdResilience,
  type HouseholdSnapshot,
  type ResilienceOption
} from "@fidt/domain";
import type { StoredDecisionPassport } from "./repositories/database";

const encoder = new TextEncoder();

export async function issueDecisionPassport(
  input: {
    readonly recommendation: RecommendationDraft;
    readonly compliance: ComplianceDecision;
    readonly run: ScenarioComparisonResponse;
    readonly household: HouseholdSnapshot;
    readonly reviewAuditEventId: string;
    readonly now?: Date;
  },
  signingSecret: string
): Promise<{ passport: DecisionPassportPayload; proof: DecisionPassportProof }> {
  const scenario = input.run.scenarios.find(
    (candidate) => candidate.id === input.recommendation.recommendedScenarioId
  );
  if (!scenario) throw new Error("Recommended scenario is missing from its locked run");
  const now = input.now ?? new Date();
  const passport: DecisionPassportPayload = {
    schemaVersion: "1.0",
    id: crypto.randomUUID(),
    householdId: input.household.id,
    recommendationId: input.recommendation.id,
    runId: input.run.runId,
    issuedAt: now.toISOString(),
    ...(input.run.triggerEventId ? { triggerEventId: input.run.triggerEventId } : {}),
    recommendedScenario: {
      id: scenario.id,
      strategy: scenario.strategy,
      label: scenario.label,
      successProbability: scenario.successProbability,
      fiAge: scenario.fiAge,
      firstYearAdvisoryFee: scenario.firstYearAdvisoryFee
    },
    constitution: input.run.clientConstitution,
    decisionCapital: input.run.decisionCapital,
    ...(input.run.resilience ? { resilience: input.run.resilience } : {}),
    alternativesConsidered: input.recommendation.alternativesConsidered,
    conflictsDisclosed: input.recommendation.conflictsDisclosed,
    validityEnvelope: buildValidityEnvelope(input.run, input.household, scenario),
    evidenceIds: unique(
      input.recommendation.statements.flatMap((statement) => statement.citationIds)
    ),
    calculationRefs: unique(
      input.recommendation.statements.flatMap((statement) => statement.calculationRefs)
    ),
    policyVersion: input.compliance.policyVersion,
    modelId: input.recommendation.modelId,
    auditReviewEventId: input.reviewAuditEventId
  };
  return { passport, proof: await signDecisionPassport(passport, signingSecret) };
}

export async function signDecisionPassport(
  passport: DecisionPassportPayload,
  signingSecret: string
): Promise<DecisionPassportProof> {
  if (signingSecret.length < 16)
    throw new Error("Passport signing secret is not configured safely");
  const canonical = canonicalJson(passport);
  const contentHash = await sha256Hex(canonical);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
  return {
    algorithm: "HMAC-SHA-256",
    keyId: "fidt-passport-v1",
    contentHash,
    signature: bytesToHex(new Uint8Array(signature))
  };
}

export async function verifyDecisionPassport(
  passport: DecisionPassportPayload,
  proof: DecisionPassportProof,
  signingSecret: string
): Promise<boolean> {
  const canonical = canonicalJson(passport);
  if ((await sha256Hex(canonical)) !== proof.contentHash) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, hexToBytes(proof.signature), encoder.encode(canonical));
}

export function observationsForPassport(
  passport: DecisionPassportPayload,
  household: HouseholdSnapshot,
  liveData: LiveDataResponse,
  now = new Date()
): Partial<Record<ValidityMetric, number>> {
  const treasury = liveData.observations.find((observation) => observation.seriesId === "DGS10");
  const liquidAssets = household.accounts.reduce((sum, account) => sum + account.balance, 0);
  const holdingValue = household.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerStock = household.holdings
    .filter((holding) => holding.assetClass === "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const publicAges = liveData.observations
    .map((observation) => {
      const retrieved = new Date(observation.retrievedAt).getTime();
      return Number.isFinite(retrieved)
        ? Math.max(0, (now.getTime() - retrieved) / 86_400_000)
        : Number.NaN;
    })
    .filter(Number.isFinite);
  const envelopeBaseline = Object.fromEntries(
    passport.validityEnvelope.map((condition) => [condition.metric, condition.baselineValue])
  ) as Partial<Record<ValidityMetric, number>>;
  const resilience = passport.resilience
    ? evaluateHouseholdResilience(
        household,
        passport.constitution,
        passport.resilience.stressed.shock,
        passport.resilience.stressed.metrics.originalDecisionCapital,
        passport.resilience.stressed.optionTests.map((option): ResilienceOption => ({
          id: option.id,
          label: option.label,
          capitalRequired: option.capitalRequired
        })),
        now
      )
    : null;
  return {
    ...envelopeBaseline,
    ...(treasury ? { MORTGAGE_RATE: treasury.value + 0.0225 } : {}),
    LIQUID_ASSETS: liquidAssets,
    EMPLOYER_STOCK_PERCENT: holdingValue === 0 ? 0 : employerStock / holdingValue,
    ...(resilience
      ? {
          RESILIENCE_SCORE: resilience.score,
          CREDIT_FREE_RUNWAY_MONTHS: resilience.metrics.creditFreeRunwayMonths,
          SHOCK_CREDIT_REQUIRED: resilience.metrics.creditRequired,
          FEASIBLE_OPTIONS: resilience.metrics.feasibleOptions
        }
      : {}),
    ...(publicAges.length ? { PUBLIC_DATA_AGE_DAYS: Math.max(...publicAges) } : {})
  };
}

export function evaluatePassportValidity(
  stored: StoredDecisionPassport,
  observations: Partial<Record<ValidityMetric, number>>,
  now = new Date()
): PassportValidityCheck {
  const checkedAt = now.toISOString();
  const results: PassportConditionResult[] = stored.passport.validityEnvelope.map((condition) => {
    const actualValue = observations[condition.metric] ?? null;
    const passed =
      actualValue === null
        ? null
        : condition.operator === "LTE"
          ? actualValue <= condition.threshold
          : actualValue >= condition.threshold;
    return {
      conditionId: condition.id,
      metric: condition.metric,
      actualValue,
      passed,
      observedAt: checkedAt,
      source: condition.source
    };
  });
  const failed = results.filter((result) => result.passed === false);
  const unavailable = results.filter((result) => result.passed === null);
  const proposedStatus: DecisionPassportStatus = failed.length
    ? "INVALIDATED"
    : unavailable.length
      ? "REVIEW_REQUIRED"
      : "VALID";
  const statusAfter = stored.state.status === "INVALIDATED" ? "INVALIDATED" : proposedStatus;
  const labels = new Map(
    stored.passport.validityEnvelope.map((condition) => [condition.id, condition.label])
  );
  const currentReasons = failed.length
    ? failed.map(
        (result) =>
          `${labels.get(result.conditionId) ?? result.metric} left its approved validity envelope.`
      )
    : unavailable.map(
        (result) => `${labels.get(result.conditionId) ?? result.metric} could not be refreshed.`
      );
  const reasons =
    stored.state.status === "INVALIDATED" && currentReasons.length === 0
      ? [...stored.state.invalidationReasons]
      : currentReasons;
  return {
    id: crypto.randomUUID(),
    checkedAt,
    statusBefore: stored.state.status,
    statusAfter,
    results,
    reasons
  };
}

function buildValidityEnvelope(
  run: ScenarioComparisonResponse,
  household: HouseholdSnapshot,
  scenario: ScenarioComparisonResponse["scenarios"][number]
): ValidityCondition[] {
  const analysis = run.analysis;
  const constitution = run.clientConstitution;
  const liquidAssets = household.accounts.reduce((sum, account) => sum + account.balance, 0);
  const holdings = household.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const employerStock = household.holdings
    .filter((holding) => holding.assetClass === "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const conditions: ValidityCondition[] = [
    condition(
      "liquidity",
      "LIQUID_ASSETS",
      "Household liquidity floor",
      "GTE",
      constitution.constraints.liquidityFloor,
      liquidAssets,
      "CURRENCY",
      "CLIENT_SNAPSHOT",
      "Reopen the advice if liquid assets fall below the client-approved reserve."
    ),
    condition(
      "concentration",
      "EMPLOYER_STOCK_PERCENT",
      "Employer-stock concentration",
      "LTE",
      constitution.constraints.maxEmployerStockPercent,
      holdings === 0 ? 0 : employerStock / holdings,
      "RATE",
      "CLIENT_SNAPSHOT",
      "The concentration boundary is executable from the Client Constitution."
    ),
    condition(
      "fi-success",
      "FI_SUCCESS_PROBABILITY",
      "Minimum modeled FI success",
      "GTE",
      constitution.constraints.minimumFiSuccessProbability,
      scenario.successProbability,
      "RATE",
      "DETERMINISTIC_CALCULATION",
      "The approved strategy must remain above the household's modeled-success floor."
    ),
    condition(
      "fi-age",
      "FI_AGE",
      "Target financial-independence age",
      "LTE",
      constitution.constraints.targetFiAge,
      scenario.fiAge ?? 999,
      "NUMBER",
      "DETERMINISTIC_CALCULATION",
      "The approved strategy must remain aligned with the target FI age."
    ),
    condition(
      "public-data-age",
      "PUBLIC_DATA_AGE_DAYS",
      "Public evidence freshness",
      "LTE",
      45,
      0,
      "DAYS",
      "LIVE_PUBLIC_PROXY",
      "Public feeds not successfully refreshed within 45 days require renewed review."
    )
  ];
  if (run.resilience) {
    const stressed = run.resilience.stressed;
    conditions.push(
      condition(
        "resilience-score",
        "RESILIENCE_SCORE",
        "Minimum Household Optionality Score",
        "GTE",
        stressed.policy.minimumScore,
        stressed.score,
        "NUMBER",
        "DETERMINISTIC_CALCULATION",
        "Reopen the advice when the approved household shock falls below the signed resilience floor."
      ),
      condition(
        "credit-free-runway",
        "CREDIT_FREE_RUNWAY_MONTHS",
        "Minimum credit-free runway",
        "GTE",
        stressed.policy.minimumCreditFreeRunwayMonths,
        stressed.metrics.creditFreeRunwayMonths,
        "NUMBER",
        "DETERMINISTIC_CALCULATION",
        "Accessible liquidity must preserve the client-approved spending runway under the recorded shock."
      ),
      condition(
        "shock-credit-required",
        "SHOCK_CREDIT_REQUIRED",
        "Maximum credit required under shock",
        "LTE",
        stressed.policy.maximumShockCreditRequired,
        stressed.metrics.creditRequired,
        "CURRENCY",
        "DETERMINISTIC_CALCULATION",
        "The approved decision may not silently depend on unplanned consumer credit."
      ),
      condition(
        "feasible-options",
        "FEASIBLE_OPTIONS",
        "Minimum feasible options",
        "GTE",
        stressed.policy.minimumFeasibleOptions,
        stressed.metrics.feasibleOptions,
        "NUMBER",
        "DETERMINISTIC_CALCULATION",
        "The household must retain the signed minimum number of feasible capital choices."
      )
    );
  }
  if (!analysis) return conditions;
  const rental = analysis.rentalSnapshot;
  if (scenario.strategy === "RENTAL") {
    conditions.push(
      condition(
        "mortgage-rate",
        "MORTGAGE_RATE",
        "Maximum mortgage-rate boundary",
        "LTE",
        analysis.breakEvenMortgageRate ?? rental.mortgageRate + 0.005,
        rental.mortgageRate,
        "RATE",
        "LIVE_PUBLIC_PROXY",
        "The rate boundary is where rental modeled success ceases to match the leading alternative."
      ),
      condition(
        "market-rent",
        "MONTHLY_RENT",
        "Minimum market-rent boundary",
        "GTE",
        analysis.breakEvenMonthlyRent ?? rental.monthlyRent * 0.95,
        rental.monthlyRent,
        "CURRENCY",
        "CLIENT_SNAPSHOT",
        "Lower rent can invalidate the rental economics."
      ),
      condition(
        "purchase-price",
        "PURCHASE_PRICE",
        "Shared-capital purchase-price limit",
        "LTE",
        analysis.maxAffordablePurchasePrice,
        rental.purchasePrice,
        "CURRENCY",
        "CLIENT_SNAPSHOT",
        "Required down payment and closing costs may not exceed shared decision capital."
      ),
      condition(
        "real-estate-hours",
        "REAL_ESTATE_HOURS",
        "Maximum monthly property workload",
        "LTE",
        constitution.constraints.maxRealEstateHoursPerMonth,
        rental.hoursPerMonth,
        "HOURS",
        "CLIENT_SNAPSHOT",
        "The workload boundary comes from the Client Constitution."
      )
    );
  } else {
    if (analysis.breakEvenMortgageRate !== null) {
      conditions.push(
        condition(
          "mortgage-rate",
          "MORTGAGE_RATE",
          "Rental reconsideration rate",
          "GTE",
          analysis.breakEvenMortgageRate,
          rental.mortgageRate,
          "RATE",
          "LIVE_PUBLIC_PROXY",
          "Reopen the non-rental recommendation if financing becomes favorable enough for rental modeled success to match it."
        )
      );
    }
    if (analysis.breakEvenMonthlyRent !== null) {
      conditions.push(
        condition(
          "market-rent",
          "MONTHLY_RENT",
          "Rental reconsideration rent",
          "LTE",
          analysis.breakEvenMonthlyRent,
          rental.monthlyRent,
          "CURRENCY",
          "CLIENT_SNAPSHOT",
          "Reopen the non-rental recommendation if market rent reaches the modeled boundary."
        )
      );
    }
  }
  return conditions;
}

function condition(
  id: string,
  metric: ValidityMetric,
  label: string,
  operator: ValidityCondition["operator"],
  threshold: number,
  baselineValue: number,
  unit: ValidityCondition["unit"],
  source: ValidityCondition["source"],
  rationale: string
): ValidityCondition {
  return { id, metric, label, operator, threshold, baselineValue, unit, source, rationale };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
