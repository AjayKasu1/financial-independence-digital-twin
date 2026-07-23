import type {
  AdvisorOpportunity,
  DecisionPassportStatus,
  EvidenceDocument,
  OpportunityPriority,
  OpportunityRadarResponse
} from "@fidt/contracts";
import type { ClientConstitution, FinancialEvent, HouseholdSnapshot } from "@fidt/domain";

interface OpportunityRadarInput {
  readonly household: HouseholdSnapshot;
  readonly constitution: ClientConstitution;
  readonly events: readonly FinancialEvent[];
  readonly documents: readonly EvidenceDocument[];
  readonly latestPassportStatus: DecisionPassportStatus | null;
  readonly now?: Date;
}

export function buildOpportunityRadar(input: OpportunityRadarInput): OpportunityRadarResponse {
  const now = input.now ?? new Date();
  const detectedAt = now.toISOString();
  const confirmedDocumentTypes = new Set(
    input.documents
      .filter((document) => document.status === "CONFIRMED")
      .map((document) => document.documentType)
  );
  const confirmedDocumentLabels = input.documents
    .filter((document) => document.status === "CONFIRMED")
    .map((document) => documentTypeLabel(document.documentType));
  const rsu = input.household.rsuGrants[0];
  const employerStock = input.household.holdings
    .filter((holding) => holding.assetClass === "EMPLOYER_STOCK")
    .reduce((sum, holding) => sum + holding.marketValue, 0);
  const holdingsTotal = input.household.holdings.reduce(
    (sum, holding) => sum + holding.marketValue,
    0
  );
  const projectedEmployerStock = employerStock + (rsu?.nextVestValue ?? 0);
  const projectedHoldings = holdingsTotal + (rsu?.nextVestValue ?? 0);
  const projectedConcentration =
    projectedHoldings > 0 ? projectedEmployerStock / projectedHoldings : 0;
  const opportunities: AdvisorOpportunity[] = [];

  if (rsu) {
    const days = daysUntil(now, rsu.nextVestDate);
    const rsuEvidenceReady = confirmedDocumentTypes.has("RSU_STATEMENT");
    const score = clamp(
      74 + (days <= 30 ? 17 : days <= 60 ? 13 : days <= 90 ? 8 : 3) + (rsuEvidenceReady ? 2 : 5)
    );
    opportunities.push({
      id: `opportunity-rsu-${input.household.id}`,
      householdId: input.household.id,
      householdName: input.household.name,
      category: "EQUITY_COMPENSATION",
      priority: priorityFor(score),
      score,
      title: `${compactUsd(rsu.nextVestValue)} RSU vest needs a pre-vest decision`,
      summary:
        "Coordinate withholding, liquidity, diversification, and goal funding before the vest becomes a reactive sale decision.",
      detectedAt,
      deadline: rsu.nextVestDate,
      triggerEventId: eventId(input.events, "RSU_VEST"),
      decisionValue: { amount: rsu.nextVestValue, label: "Capital arriving at next vest" },
      evidence: {
        readiness: rsuEvidenceReady ? "READY" : "BLOCKED",
        confirmedSources: rsuEvidenceReady ? confirmedDocumentLabels : [],
        missingSources: rsuEvidenceReady ? [] : ["Current equity-award statement"]
      },
      constitution: {
        status:
          projectedConcentration > input.constitution.constraints.maxEmployerStockPercent
            ? "BREACH"
            : "AT_RISK",
        tests: [
          `Projected employer stock ${percent(projectedConcentration)} vs ${percent(input.constitution.constraints.maxEmployerStockPercent)} ceiling`,
          `${compactUsd(input.constitution.constraints.liquidityFloor)} liquidity floor preserved`
        ]
      },
      passport: passportImpact(input.latestPassportStatus, true),
      reasons: [
        `${Math.max(days, 0)} days until the modeled vest`,
        `${compactUsd(rsu.unvestedValue)} remains exposed to employer equity`,
        rsuEvidenceReady
          ? "Advisor-confirmed award evidence is admitted to the twin"
          : "The modeled award has not yet been reconciled to source evidence"
      ],
      action: rsuEvidenceReady
        ? {
            label: "Compile strategy",
            to: `/households/${input.household.id}/strategy-compiler?opportunity=opportunity-rsu-${input.household.id}`
          }
        : {
            label: "Admit RSU evidence",
            to: `/households/${input.household.id}/evidence-intake?document=RSU_STATEMENT`
          }
    });
  }

  const concentrationScore = clamp(
    78 +
      Math.max(
        0,
        (projectedConcentration - input.constitution.constraints.maxEmployerStockPercent) * 120
      )
  );
  opportunities.push({
    id: `opportunity-concentration-${input.household.id}`,
    householdId: input.household.id,
    householdName: input.household.name,
    category: "CONCENTRATION",
    priority: priorityFor(concentrationScore),
    score: concentrationScore,
    title: "Employer equity crosses the client policy envelope",
    summary:
      "The upcoming vest pushes modeled employer exposure through the constitution ceiling and should trigger a documented diversification test.",
    detectedAt,
    deadline: rsu?.nextVestDate ?? null,
    triggerEventId: eventId(input.events, "CONCENTRATION_BREACH"),
    decisionValue: {
      amount: projectedEmployerStock,
      label: "Projected employer-stock exposure"
    },
    evidence: {
      readiness: confirmedDocumentTypes.has("RSU_STATEMENT") ? "PARTIAL" : "BLOCKED",
      confirmedSources: [
        "Synthetic holdings snapshot",
        ...(confirmedDocumentTypes.has("RSU_STATEMENT") ? ["Confirmed equity-award statement"] : [])
      ],
      missingSources: confirmedDocumentTypes.has("RSU_STATEMENT")
        ? ["Current taxable-account statement"]
        : ["Current equity-award statement", "Current taxable-account statement"]
    },
    constitution: {
      status:
        projectedConcentration > input.constitution.constraints.maxEmployerStockPercent
          ? "BREACH"
          : "AT_RISK",
      tests: [
        `${percent(projectedConcentration)} projected exposure`,
        `${percent(input.constitution.constraints.maxEmployerStockPercent)} constitutional maximum`
      ]
    },
    passport: passportImpact(input.latestPassportStatus, true),
    reasons: [
      `${compactUsd(projectedEmployerStock)} projected employer-stock exposure`,
      "Single-company risk overlaps with household employment income",
      "A recommendation must test client value separately from advisor economics"
    ],
    action: {
      label: "Open concentration test",
      to: comparePath(input.household.id, eventId(input.events, "CONCENTRATION_BREACH"))
    }
  });

  const rentalEvent = input.events.find((event) => event.type === "PLAN_DRIFT");
  opportunities.push({
    id: `opportunity-rental-${input.household.id}`,
    householdId: input.household.id,
    householdName: input.household.name,
    category: "REAL_ESTATE",
    priority: "MEDIUM",
    score: 69,
    title: "Rental decision needs a governed break-even test",
    summary:
      "Compare property cash flow with a liquid portfolio and debt reduction using the same capital, time value, and advisory-fee assumptions.",
    detectedAt,
    deadline: null,
    triggerEventId: rentalEvent?.id ?? null,
    decisionValue: { amount: 147_000, label: "Shared decision capital" },
    evidence: {
      readiness: confirmedDocumentTypes.has("MORTGAGE_STATEMENT") ? "PARTIAL" : "BLOCKED",
      confirmedSources: confirmedDocumentTypes.has("MORTGAGE_STATEMENT")
        ? ["Confirmed mortgage statement"]
        : [],
      missingSources: confirmedDocumentTypes.has("MORTGAGE_STATEMENT")
        ? ["Property quote and market-rent evidence"]
        : ["Current mortgage statement", "Property quote and market-rent evidence"]
    },
    constitution: {
      status: "AT_RISK",
      tests: [
        `${input.constitution.constraints.maxRealEstateHoursPerMonth} hour monthly workload ceiling`,
        `${compactUsd(input.constitution.constraints.liquidityFloor)} liquidity floor`
      ]
    },
    passport: passportImpact(input.latestPassportStatus, false),
    reasons: [
      "Capital has mutually exclusive uses",
      "Property workload is an executable client constraint",
      "Advisor compensation may change by strategy"
    ],
    action: {
      label: "Run governed comparison",
      to: comparePath(input.household.id, rentalEvent?.id ?? null)
    }
  });

  const confirmedCount = input.documents.filter(
    (document) => document.status === "CONFIRMED"
  ).length;
  if (confirmedCount < 2) {
    const score = confirmedCount === 0 ? 84 : 63;
    opportunities.push({
      id: `opportunity-evidence-${input.household.id}`,
      householdId: input.household.id,
      householdName: input.household.name,
      category: "EVIDENCE_GAP",
      priority: priorityFor(score),
      score,
      title:
        confirmedCount === 0
          ? "Modeled facts are not yet reconciled to source documents"
          : "Complete the source-evidence baseline",
      summary:
        "Convert structured source evidence into advisor-confirmed twin facts before a recommendation is promoted into governed review.",
      detectedAt,
      deadline: null,
      triggerEventId: null,
      decisionValue: null,
      evidence: {
        readiness: confirmedCount === 0 ? "BLOCKED" : "PARTIAL",
        confirmedSources: confirmedDocumentLabels,
        missingSources: ["Two independent document classes required for a complete demo baseline"]
      },
      constitution: {
        status: "AT_RISK",
        tests: ["Facts must be source-linked before governed recommendation approval"]
      },
      passport: passportImpact(input.latestPassportStatus, true),
      reasons: [
        `${confirmedCount} advisor-confirmed document ${confirmedCount === 1 ? "class" : "classes"}`,
        "AI output cannot substitute for admitted evidence",
        "Every accepted field will receive source lineage and an audit event"
      ],
      action: {
        label: "Open evidence intake",
        to: `/households/${input.household.id}/evidence-intake`
      }
    });
  }

  opportunities.sort(
    (left, right) => right.score - left.score || left.title.localeCompare(right.title)
  );
  return {
    generatedAt: detectedAt,
    methodologyVersion: "advisor-opportunity-radar-v1",
    summary: {
      actionNow: opportunities.filter((opportunity) => opportunity.score >= 75).length,
      evidenceBlocked: opportunities.filter(
        (opportunity) => opportunity.evidence.readiness === "BLOCKED"
      ).length,
      decisionCapital: Math.max(
        0,
        ...opportunities.map((opportunity) => opportunity.decisionValue?.amount ?? 0)
      ),
      passportsAtRisk:
        input.latestPassportStatus === "REVIEW_REQUIRED" ||
        input.latestPassportStatus === "INVALIDATED"
          ? 1
          : 0
    },
    opportunities
  };
}

function comparePath(householdId: string, triggerEventId: string | null): string {
  const path = `/households/${householdId}/compare`;
  return triggerEventId ? `${path}?event=${encodeURIComponent(triggerEventId)}` : path;
}

function eventId(events: readonly FinancialEvent[], type: FinancialEvent["type"]): string | null {
  return events.find((event) => event.type === type)?.id ?? null;
}

function passportImpact(
  status: DecisionPassportStatus | null,
  materialTwinInput: boolean
): AdvisorOpportunity["passport"] {
  if (!status) {
    return {
      status: "NO_ACTIVE_PASSPORT",
      detail: "No approved Decision Passport exists for this decision."
    };
  }
  if (status === "INVALIDATED") {
    return { status, detail: "The latest passport is invalidated and cannot authorize execution." };
  }
  if (status === "REVIEW_REQUIRED") {
    return { status, detail: "The latest passport already requires advisor review." };
  }
  return materialTwinInput
    ? {
        status: "RETEST_REQUIRED",
        detail: "Promoting this signal will retest the active passport validity envelope."
      }
    : { status: "VALID", detail: "The latest passport remains within its validity envelope." };
}

function priorityFor(score: number): OpportunityPriority {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function daysUntil(now: Date, target: string): number {
  return Math.ceil((Date.parse(target) - now.getTime()) / 86_400_000);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function compactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0
  }).format(value);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function documentTypeLabel(type: EvidenceDocument["documentType"]): string {
  switch (type) {
    case "RSU_STATEMENT":
      return "Confirmed equity-award statement";
    case "PAYSTUB":
      return "Confirmed compensation statement";
    case "MORTGAGE_STATEMENT":
      return "Confirmed mortgage statement";
  }
}
