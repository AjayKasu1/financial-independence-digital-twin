import type {
  ComplianceDecision,
  RecommendationDraft,
  RecommendationStatement
} from "@fidt/contracts";
import type { ConflictFlag, ScenarioResult } from "@fidt/domain";

export const POLICY_VERSION = "fiduciary-policy-1.0.0";

export interface PolicyEvaluationInput {
  readonly recommendation: RecommendationDraft;
  readonly scenarios: readonly ScenarioResult[];
  readonly conflicts: readonly ConflictFlag[];
  readonly now?: Date;
  readonly maximumExternalDataAgeDays?: number;
}

const GUARANTEE_PATTERNS = [
  /\bguarantee(?:d|s)?\b/i,
  /\brisk[- ]free\b/i,
  /\bcan(?:not|'t) lose\b/i,
  /\bwill (?:definitely|certainly)\b/i,
  /\bno downside\b/i
] as const;

export function evaluateRecommendation(input: PolicyEvaluationInput): ComplianceDecision {
  const now = input.now ?? new Date();
  const maximumExternalDataAgeDays = input.maximumExternalDataAgeDays ?? 45;
  const reasons: ComplianceDecision["reasons"][number][] = [];
  const requiredActions = new Set<string>();
  const citations = new Map(
    input.recommendation.citations.map((citation) => [citation.id, citation])
  );

  for (const statement of input.recommendation.statements) {
    evaluateStatement(
      statement,
      citations,
      reasons,
      requiredActions,
      now,
      maximumExternalDataAgeDays
    );
  }

  if (input.recommendation.alternativesConsidered.length === 0) {
    reasons.push({
      code: "MISSING_ALTERNATIVES",
      severity: "BLOCKING",
      message: "A fiduciary recommendation must compare at least one reasonable alternative."
    });
    requiredActions.add("Describe the alternatives considered and why the recommendation differs.");
  }

  for (const conflict of input.conflicts) {
    const conflictDisclosed = input.recommendation.conflictsDisclosed.some((disclosure) => {
      const normalized = disclosure.toLowerCase();
      return (
        disclosure === conflict.message ||
        normalized.includes(conflict.code.toLowerCase()) ||
        normalized.includes("advisor revenue") ||
        normalized.includes("advisory revenue")
      );
    });
    if (!conflictDisclosed) {
      reasons.push({
        code: "UNDISCLOSED_CONFLICT",
        severity: "BLOCKING",
        message: conflict.message
      });
      requiredActions.add(
        "Disclose every material advisor-compensation conflict in client-ready language."
      );
    }
  }

  const recommendedScenario = input.scenarios.find(
    (scenario) => scenario.id === input.recommendation.recommendedScenarioId
  );
  if (!recommendedScenario) {
    reasons.push({
      code: "UNKNOWN_RECOMMENDED_SCENARIO",
      severity: "BLOCKING",
      message: "The recommended scenario is not part of the reviewed scenario run."
    });
    requiredActions.add("Select a scenario from the reviewed deterministic comparison.");
  } else {
    const highRisks = recommendedScenario.risks.filter((risk) => risk.severity === "HIGH");
    if (highRisks.length > 0) {
      reasons.push({
        code: "HIGH_RISK_RECOMMENDATION",
        severity: "WARNING",
        message: `The recommended scenario has ${highRisks.length} high-severity planning risk(s).`
      });
      requiredActions.add(
        "Obtain human advisor review and document how each high risk is mitigated."
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push({
      code: "POLICY_CHECKS_PASSED",
      severity: "INFO",
      message: "The draft passed automated evidence, language, alternative, and conflict checks."
    });
  }

  const hasBlocking = reasons.some((reason) => reason.severity === "BLOCKING");
  const hasHighRisk = reasons.some((reason) => reason.code === "HIGH_RISK_RECOMMENDATION");
  return {
    status: hasBlocking ? "REQUIRE_CHANGES" : hasHighRisk ? "ESCALATE" : "APPROVE",
    evaluatedAt: now.toISOString(),
    policyVersion: POLICY_VERSION,
    reasons,
    requiredActions: [...requiredActions],
    humanReviewRequired: true
  };
}

function evaluateStatement(
  statement: RecommendationStatement,
  citations: ReadonlyMap<string, RecommendationDraft["citations"][number]>,
  reasons: ComplianceDecision["reasons"][number][],
  requiredActions: Set<string>,
  now: Date,
  maximumExternalDataAgeDays: number
): void {
  if (GUARANTEE_PATTERNS.some((pattern) => pattern.test(statement.text))) {
    reasons.push({
      code: "PROHIBITED_GUARANTEE",
      severity: "BLOCKING",
      message:
        "The statement uses guarantee or no-downside language that is inappropriate for planning output.",
      statementId: statement.id
    });
    requiredActions.add("Replace guarantee language with balanced, conditional planning language.");
  }

  const evidenceRequired = ["CLIENT_FACT", "DETERMINISTIC_CALCULATION", "EXTERNAL_FACT"].includes(
    statement.label
  );
  if (
    evidenceRequired &&
    statement.citationIds.length === 0 &&
    statement.calculationRefs.length === 0
  ) {
    reasons.push({
      code: "MISSING_EVIDENCE",
      severity: "BLOCKING",
      message: `${statement.label} statements require a citation or calculation reference.`,
      statementId: statement.id
    });
    requiredActions.add("Attach a traceable citation or deterministic calculation reference.");
  }

  for (const citationId of statement.citationIds) {
    const citation = citations.get(citationId);
    if (!citation) {
      reasons.push({
        code: "BROKEN_CITATION",
        severity: "BLOCKING",
        message: `Citation ${citationId} is not present in the evidence bundle.`,
        statementId: statement.id
      });
      requiredActions.add("Repair citation links before presenting the recommendation.");
      continue;
    }
    if (citation.sourceType === "PUBLIC_SOURCE") {
      const ageDays = ageInDays(citation.asOf, now);
      if (ageDays === null || ageDays > maximumExternalDataAgeDays) {
        reasons.push({
          code: "STALE_EXTERNAL_DATA",
          severity: "BLOCKING",
          message: `${citation.title} is missing a valid date or is older than ${maximumExternalDataAgeDays} days.`,
          statementId: statement.id
        });
        requiredActions.add("Refresh stale public data and regenerate the affected statements.");
      }
    }
  }

  if (statement.label === "DETERMINISTIC_CALCULATION" && statement.calculationRefs.length === 0) {
    reasons.push({
      code: "MISSING_CALCULATION_TRACE",
      severity: "BLOCKING",
      message: "A calculated claim must point to a deterministic calculation output.",
      statementId: statement.id
    });
    requiredActions.add("Link calculated claims to scenario output fields.");
  }
}

function ageInDays(value: string, now: Date): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime()) return null;
  return (now.getTime() - date.getTime()) / 86_400_000;
}
