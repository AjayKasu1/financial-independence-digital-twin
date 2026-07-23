import { z } from "zod";
import type {
  ClientConstitution as DomainClientConstitution,
  ConflictFlag as DomainConflictFlag,
  DecisionAnalysis as DomainDecisionAnalysis,
  FinancialEvent as DomainFinancialEvent,
  HouseholdResilienceAssessment as DomainHouseholdResilienceAssessment,
  HouseholdResilienceComparison as DomainHouseholdResilienceComparison,
  HouseholdSnapshot as DomainHouseholdSnapshot,
  ScenarioResult as DomainScenarioResult
} from "@fidt/domain";

export type {
  AssumptionSet,
  ClientConstitution,
  ConflictFlag,
  FactCategory,
  FeeSchedule,
  FinancialEvent,
  HouseholdSnapshot,
  HouseholdResilienceAssessment,
  HouseholdResilienceComparison,
  ResilienceShock,
  ScenarioResult,
  StrategyRequest,
  StrategyType
} from "@fidt/domain";

const rate = z.number().finite().min(0).max(1);
const nonNegative = z.number().finite().min(0);

export const rentalStrategySchema = z.object({
  purchasePrice: z.number().finite().positive(),
  downPaymentPercent: rate,
  closingCostPercent: rate,
  mortgageRate: rate,
  mortgageTermYears: z.number().int().positive().max(40),
  monthlyRent: nonNegative,
  vacancyRate: rate,
  managementRate: rate,
  annualPropertyTax: nonNegative,
  annualInsurance: nonNegative,
  annualMaintenanceRate: rate,
  annualCapexRate: rate,
  appreciationRate: z.number().finite().min(-0.25).max(0.25),
  rentGrowthRate: z.number().finite().min(-0.25).max(0.25),
  sellingCostPercent: rate,
  hoursPerMonth: nonNegative.max(200),
  hourlyTimeValue: nonNegative.max(10_000)
});

export const portfolioStrategySchema = z
  .object({
    initialInvestment: nonNegative,
    annualContribution: nonNegative,
    equityAllocation: rate,
    bondAllocation: rate,
    cashAllocation: rate,
    fundExpenseRate: rate
  })
  .superRefine((value, context) => {
    const total = value.equityAllocation + value.bondAllocation + value.cashAllocation;
    if (Math.abs(total - 1) > 0.000001) {
      context.addIssue({
        code: "custom",
        message: "Portfolio allocations must sum to 1"
      });
    }
  });

export const debtStrategySchema = z.object({
  liabilityId: z.string().min(1),
  lumpSum: nonNegative
});

export const mixedStrategySchema = z
  .object({
    rentalAllocation: rate,
    portfolioAllocation: rate,
    debtAllocation: rate
  })
  .superRefine((value, context) => {
    if (
      Math.abs(value.rentalAllocation + value.portfolioAllocation + value.debtAllocation - 1) >
      0.000001
    ) {
      context.addIssue({ code: "custom", message: "Mixed allocations must sum to 1" });
    }
  });

export const strategyRequestSchema = z.object({
  type: z.enum(["RENTAL", "PORTFOLIO", "DEBT_PAYDOWN", "MIXED"]),
  rental: rentalStrategySchema.optional(),
  portfolio: portfolioStrategySchema.optional(),
  debt: debtStrategySchema.optional(),
  mixed: mixedStrategySchema.optional()
});

export const resilienceShockSchema = z.object({
  emergencyExpense: z.number().finite().min(0).max(10_000_000),
  incomeLossPercent: rate,
  incomeLossMonths: z.number().finite().min(0).max(36),
  employerStockDecline: rate,
  broadMarketDecline: rate,
  spendingIncreaseRate: rate
});

export const scenarioComparisonRequestSchema = z
  .object({
    decisionCapital: z.number().finite().positive().max(100_000_000),
    preShockDecisionCapital: z.number().finite().positive().max(100_000_000).optional(),
    resilienceShock: resilienceShockSchema.optional(),
    strategies: z.array(strategyRequestSchema).min(2).max(4),
    triggerEventId: z.string().min(1).optional(),
    assumptions: z
      .object({
        inflationRate: z.number().finite().min(-0.05).max(0.2),
        withdrawalRate: z.number().finite().positive().max(0.2),
        equityReturnMean: z.number().finite().min(-0.5).max(0.5),
        equityVolatility: rate,
        bondReturnMean: z.number().finite().min(-0.5).max(0.5),
        bondVolatility: rate,
        cashReturn: z.number().finite().min(-0.1).max(0.25),
        taxDrag: rate,
        planningHorizonYears: z.number().int().min(5).max(60),
        simulationPaths: z.number().int().min(100).max(10_000),
        seed: z.number().int().min(0)
      })
      .partial()
      .optional()
  })
  .superRefine((value, context) => {
    const portfolio = value.strategies.find((strategy) => strategy.type === "PORTFOLIO")?.portfolio;
    if (portfolio && Math.abs(portfolio.initialInvestment - value.decisionCapital) > 0.01) {
      context.addIssue({
        code: "custom",
        path: ["strategies"],
        message: "Portfolio initial investment must equal shared decision capital"
      });
    }
    const debt = value.strategies.find((strategy) => strategy.type === "DEBT_PAYDOWN")?.debt;
    if (debt && debt.lumpSum > value.decisionCapital) {
      context.addIssue({
        code: "custom",
        path: ["strategies"],
        message: "Debt paydown cannot exceed shared decision capital"
      });
    }
  });

export type ScenarioComparisonRequest = z.infer<typeof scenarioComparisonRequestSchema>;

export const workbenchRequestSchema = z.object({
  rsuVestAmount: z.number().finite().positive().max(10_000_000),
  employerStockPercent: rate.max(0.9),
  liquidityFloor: z.number().finite().min(0).max(10_000_000),
  targetFiAge: z.number().int().min(40).max(80),
  maxRealEstateHoursPerMonth: z.number().finite().min(0).max(80),
  rentalPurchasePrice: z.number().finite().positive().max(20_000_000),
  monthlyMarketRent: z.number().finite().min(0).max(100_000),
  mortgageRate: z.number().finite().min(0).max(0.25),
  resilienceShock: resilienceShockSchema.default({
    emergencyExpense: 0,
    incomeLossPercent: 0,
    incomeLossMonths: 0,
    employerStockDecline: 0,
    broadMarketDecline: 0,
    spendingIncreaseRate: 0
  })
});

export type WorkbenchRequest = z.infer<typeof workbenchRequestSchema>;

export const statementLabelSchema = z.enum([
  "CLIENT_FACT",
  "DETERMINISTIC_CALCULATION",
  "EXTERNAL_FACT",
  "PLANNING_ASSUMPTION",
  "ADVISOR_JUDGMENT",
  "AI_SUGGESTION"
]);

export const citationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceType: z.enum(["CLIENT_DOCUMENT", "CALCULATION", "PUBLIC_SOURCE", "POLICY"]),
  sourceUrl: z.string().url().optional(),
  asOf: z.string().min(1),
  excerpt: z.string().max(500).optional()
});

export type Citation = z.infer<typeof citationSchema>;

export const recommendationStatementSchema = z.object({
  id: z.string().min(1),
  label: statementLabelSchema,
  text: z.string().min(1).max(1_500),
  citationIds: z.array(z.string()),
  calculationRefs: z.array(z.string())
});

export type RecommendationStatement = z.infer<typeof recommendationStatementSchema>;

export const recommendationDraftSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  createdAt: z.string().min(1),
  recommendedScenarioId: z.string().min(1),
  scenarioIds: z.array(z.string()).min(2),
  headline: z.string().min(1).max(180),
  executiveSummary: z.string().min(1).max(2_000),
  statements: z.array(recommendationStatementSchema).min(1).max(20),
  citations: z.array(citationSchema),
  alternativesConsidered: z.array(z.string()).min(1),
  conflictsDisclosed: z.array(z.string()),
  missingInformation: z.array(z.string()),
  modelId: z.string().min(1),
  promptVersion: z.string().min(1),
  generatedBy: z.enum(["OPENROUTER", "DETERMINISTIC_FALLBACK"])
});

export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>;

export const complianceStatusSchema = z.enum(["APPROVE", "REQUIRE_CHANGES", "ESCALATE"]);

export const complianceDecisionSchema = z.object({
  status: complianceStatusSchema,
  evaluatedAt: z.string().min(1),
  policyVersion: z.string().min(1),
  reasons: z.array(
    z.object({
      code: z.string().min(1),
      severity: z.enum(["INFO", "WARNING", "BLOCKING"]),
      message: z.string().min(1),
      statementId: z.string().optional()
    })
  ),
  requiredActions: z.array(z.string()),
  humanReviewRequired: z.boolean()
});

export type ComplianceDecision = z.infer<typeof complianceDecisionSchema>;

export interface DashboardHousehold {
  readonly id: string;
  readonly name: string;
  readonly advisorName: string;
  readonly investableAssets: number;
  readonly fiProbability: number;
  readonly fiTarget: number;
  readonly openEvents: number;
  readonly highRiskEvents: number;
  readonly lastReviewedAt: string;
}

export interface DashboardResponse {
  readonly households: readonly DashboardHousehold[];
  readonly events: readonly DomainFinancialEvent[];
  readonly summary: {
    readonly households: number;
    readonly assetsTracked: number;
    readonly openOpportunities: number;
    readonly complianceReviews: number;
  };
  readonly liveData: readonly LiveObservation[];
}

export interface HouseholdResponse {
  readonly household: DomainHouseholdSnapshot;
  readonly clientConstitution: DomainClientConstitution;
  readonly events: readonly DomainFinancialEvent[];
  readonly latestScenarios: readonly DomainScenarioResult[];
  readonly resilience: DomainHouseholdResilienceAssessment;
}

export interface ScenarioComparisonResponse {
  readonly runId: string;
  readonly householdId: string;
  readonly triggerEventId?: string;
  readonly createdAt: string;
  readonly decisionCapital: number;
  readonly clientConstitution: DomainClientConstitution;
  readonly analysis: DomainDecisionAnalysis | null;
  readonly scenarios: readonly DomainScenarioResult[];
  readonly conflicts: readonly DomainConflictFlag[];
  readonly resilience?: DomainHouseholdResilienceComparison;
}

export interface PublicResilienceContext {
  readonly source: "NerdWallet Consumer Financial Resilience Index";
  readonly score: number;
  readonly observedAt: string;
  readonly publishedAt: string;
  readonly retrievedAt: string;
  readonly creditReliancePercent: number;
  readonly thousandDollarCashCoveragePercent: number;
  readonly sampleSize: number;
  readonly sourceUrl: string;
  readonly methodology: string;
  readonly usageBoundary: string;
}

export interface WorkbenchResponse {
  readonly sandboxId: string;
  readonly mode: "SESSION_ONLY";
  readonly householdId: string;
  readonly calculatedAt: string;
  readonly input: WorkbenchRequest;
  readonly clientConstitution: DomainClientConstitution;
  readonly analysis: DomainDecisionAnalysis | null;
  readonly scenarios: readonly DomainScenarioResult[];
  readonly conflicts: readonly DomainConflictFlag[];
  readonly resilience: DomainHouseholdResilienceComparison;
  readonly publicContext: PublicResilienceContext;
}

export interface RecommendationResponse {
  readonly recommendation: RecommendationDraft;
  readonly compliance: ComplianceDecision;
}

export interface AuditEventDto {
  readonly id: string;
  readonly householdId: string;
  readonly actorType: "USER" | "SYSTEM" | "MODEL";
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly previousHash: string | null;
  readonly eventHash: string;
}

export interface AuditChainVerification {
  readonly status: "VERIFIED" | "FAILED" | "EMPTY";
  readonly verifiedEvents: number;
  readonly totalEvents: number;
  readonly firstInvalidEventId?: string;
  readonly verifiedAt: string;
}

export interface AuditResponse {
  readonly householdId: string;
  readonly events: readonly AuditEventDto[];
  readonly verification: AuditChainVerification;
}

export interface ReviewResponse {
  readonly id: string;
  readonly recommendationId: string;
  readonly decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
  readonly rationale: string;
  readonly attestation: boolean;
  readonly reviewedAt: string;
  readonly auditEventId: string;
  readonly passportId?: string;
  readonly passportStatus?: DecisionPassportStatus;
}

export type DecisionPassportStatus = "VALID" | "REVIEW_REQUIRED" | "INVALIDATED";

export type ValidityMetric =
  | "MORTGAGE_RATE"
  | "MONTHLY_RENT"
  | "PURCHASE_PRICE"
  | "LIQUID_ASSETS"
  | "EMPLOYER_STOCK_PERCENT"
  | "REAL_ESTATE_HOURS"
  | "FI_SUCCESS_PROBABILITY"
  | "FI_AGE"
  | "RESILIENCE_SCORE"
  | "CREDIT_FREE_RUNWAY_MONTHS"
  | "SHOCK_CREDIT_REQUIRED"
  | "FEASIBLE_OPTIONS"
  | "PUBLIC_DATA_AGE_DAYS";

export interface ValidityCondition {
  readonly id: string;
  readonly metric: ValidityMetric;
  readonly label: string;
  readonly operator: "LTE" | "GTE";
  readonly threshold: number;
  readonly baselineValue: number;
  readonly unit: "CURRENCY" | "RATE" | "NUMBER" | "HOURS" | "DAYS";
  readonly source: "LIVE_PUBLIC_PROXY" | "CLIENT_SNAPSHOT" | "DETERMINISTIC_CALCULATION";
  readonly rationale: string;
}

export interface DecisionPassportPayload {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly householdId: string;
  readonly recommendationId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly triggerEventId?: string;
  readonly recommendedScenario: {
    readonly id: string;
    readonly strategy: string;
    readonly label: string;
    readonly successProbability: number;
    readonly fiAge: number | null;
    readonly firstYearAdvisoryFee: number;
  };
  readonly constitution: DomainClientConstitution;
  readonly decisionCapital: number;
  readonly resilience?: DomainHouseholdResilienceComparison;
  readonly alternativesConsidered: readonly string[];
  readonly conflictsDisclosed: readonly string[];
  readonly validityEnvelope: readonly ValidityCondition[];
  readonly evidenceIds: readonly string[];
  readonly calculationRefs: readonly string[];
  readonly policyVersion: string;
  readonly modelId: string;
  readonly auditReviewEventId: string;
}

export interface DecisionPassportProof {
  readonly algorithm: "HMAC-SHA-256";
  readonly keyId: "fidt-passport-v1";
  readonly contentHash: string;
  readonly signature: string;
}

export interface PassportConditionResult {
  readonly conditionId: string;
  readonly metric: ValidityMetric;
  readonly actualValue: number | null;
  readonly passed: boolean | null;
  readonly observedAt: string;
  readonly source: string;
}

export interface PassportValidityCheck {
  readonly id: string;
  readonly checkedAt: string;
  readonly statusBefore: DecisionPassportStatus;
  readonly statusAfter: DecisionPassportStatus;
  readonly results: readonly PassportConditionResult[];
  readonly reasons: readonly string[];
}

export interface DecisionPassportResponse {
  readonly passport: DecisionPassportPayload;
  readonly proof: DecisionPassportProof;
  readonly state: {
    readonly status: DecisionPassportStatus;
    readonly lastCheckedAt: string | null;
    readonly invalidatedAt: string | null;
    readonly invalidationReasons: readonly string[];
  };
  readonly verification: {
    readonly verified: boolean;
    readonly verifiedAt: string;
  };
  readonly checks: readonly PassportValidityCheck[];
}

export const passportMonitorRequestSchema = z.object({
  observations: z
    .record(
      z.enum([
        "MORTGAGE_RATE",
        "MONTHLY_RENT",
        "PURCHASE_PRICE",
        "LIQUID_ASSETS",
        "EMPLOYER_STOCK_PERCENT",
        "REAL_ESTATE_HOURS",
        "FI_SUCCESS_PROBABILITY",
        "FI_AGE",
        "RESILIENCE_SCORE",
        "CREDIT_FREE_RUNWAY_MONTHS",
        "SHOCK_CREDIT_REQUIRED",
        "FEASIBLE_OPTIONS",
        "PUBLIC_DATA_AGE_DAYS"
      ]),
      z.number().finite()
    )
    .optional()
});

export interface LiveObservation {
  readonly source: string;
  readonly seriesId: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly observationDate: string;
  readonly retrievedAt: string;
  readonly sourceUrl: string;
  readonly stale: boolean;
}

export interface SourceConnectorStatus {
  readonly source: "TREASURY" | "BLS" | "FHFA" | "SEC";
  readonly status: "LIVE" | "CACHED" | "UNAVAILABLE" | "NOT_APPLICABLE";
  readonly checkedAt: string;
  readonly sourceUrl: string;
  readonly detail: string;
}

export interface LiveDataResponse {
  readonly observations: readonly LiveObservation[];
  readonly connectors: readonly SourceConnectorStatus[];
}

export const evidenceDocumentTypeSchema = z.enum([
  "RSU_STATEMENT",
  "PAYSTUB",
  "MORTGAGE_STATEMENT"
]);

export type EvidenceDocumentType = z.infer<typeof evidenceDocumentTypeSchema>;
export type EvidenceDocumentStatus = "EXTRACTED" | "CONFIRMED" | "REJECTED";
export type EvidenceFactStatus = "PROPOSED" | "CONFIRMED" | "REJECTED";

export interface ExtractedEvidenceFact {
  readonly id: string;
  readonly fieldPath: string;
  readonly label: string;
  readonly value: string | number;
  readonly valueType: "CURRENCY" | "RATE" | "DATE" | "NUMBER" | "TEXT";
  readonly unit: string | null;
  readonly sourceExcerpt: string;
  readonly confidence: number;
  readonly status: EvidenceFactStatus;
  readonly affectsOpportunities: readonly string[];
}

export interface EvidenceDocument {
  readonly id: string;
  readonly householdId: string;
  readonly documentType: EvidenceDocumentType;
  readonly fileName: string;
  readonly status: EvidenceDocumentStatus;
  readonly effectiveAt: string;
  readonly ingestedAt: string;
  readonly confirmedAt: string | null;
  readonly reviewerId: string | null;
  readonly contentHash: string;
  readonly extractionMethod: "DETERMINISTIC_STRUCTURED_V1";
  readonly facts: readonly ExtractedEvidenceFact[];
}

export interface EvidenceDocumentsResponse {
  readonly householdId: string;
  readonly documents: readonly EvidenceDocument[];
  readonly summary: {
    readonly totalDocuments: number;
    readonly confirmedDocuments: number;
    readonly proposedFacts: number;
    readonly confirmedFacts: number;
  };
}

export const evidenceDocumentIngestRequestSchema = z.object({
  documentType: evidenceDocumentTypeSchema,
  fileName: z.string().trim().min(3).max(180),
  effectiveAt: z.string().datetime().optional(),
  content: z.string().min(20).max(50_000)
});

export type EvidenceDocumentIngestRequest = z.infer<typeof evidenceDocumentIngestRequestSchema>;

export const evidenceDocumentReviewRequestSchema = z.object({
  decision: z.enum(["CONFIRM", "REJECT"]),
  factIds: z.array(z.string().min(1)).max(30),
  rationale: z.string().trim().min(10).max(2_000)
});

export type EvidenceDocumentReviewRequest = z.infer<typeof evidenceDocumentReviewRequestSchema>;

export interface EvidenceDocumentReviewResponse {
  readonly document: EvidenceDocument;
  readonly twinUpdated: boolean;
  readonly appliedFieldPaths: readonly string[];
  readonly auditEventIds: readonly string[];
}

export type OpportunityCategory =
  "EQUITY_COMPENSATION" | "CONCENTRATION" | "REAL_ESTATE" | "RESILIENCE" | "EVIDENCE_GAP";

export type OpportunityPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type EvidenceReadiness = "READY" | "PARTIAL" | "BLOCKED";

export interface AdvisorOpportunity {
  readonly id: string;
  readonly householdId: string;
  readonly householdName: string;
  readonly category: OpportunityCategory;
  readonly priority: OpportunityPriority;
  readonly score: number;
  readonly title: string;
  readonly summary: string;
  readonly detectedAt: string;
  readonly deadline: string | null;
  readonly triggerEventId: string | null;
  readonly decisionValue: {
    readonly amount: number;
    readonly label: string;
  } | null;
  readonly evidence: {
    readonly readiness: EvidenceReadiness;
    readonly confirmedSources: readonly string[];
    readonly missingSources: readonly string[];
  };
  readonly constitution: {
    readonly status: "ALIGNED" | "AT_RISK" | "BREACH";
    readonly tests: readonly string[];
  };
  readonly passport: {
    readonly status:
      "NO_ACTIVE_PASSPORT" | "VALID" | "REVIEW_REQUIRED" | "INVALIDATED" | "RETEST_REQUIRED";
    readonly detail: string;
  };
  readonly reasons: readonly string[];
  readonly action: {
    readonly label: string;
    readonly to: string;
  };
}

export interface OpportunityRadarResponse {
  readonly generatedAt: string;
  readonly methodologyVersion: "advisor-opportunity-radar-v1";
  readonly summary: {
    readonly actionNow: number;
    readonly evidenceBlocked: number;
    readonly decisionCapital: number;
    readonly passportsAtRisk: number;
  };
  readonly opportunities: readonly AdvisorOpportunity[];
}

export const recommendationRequestSchema = z.object({
  runId: z.string().min(1),
  advisorRationale: z.string().max(2_000).optional(),
  generationMode: z.enum(["AI", "DETERMINISTIC_FALLBACK"]).default("AI"),
  repairOfRecommendationId: z.string().min(1).optional()
});

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const reviewRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGES"]),
  rationale: z.string().min(10).max(2_000),
  attestation: z.boolean()
});
