import type {
  AuditResponse,
  DashboardResponse,
  DecisionPassportResponse,
  EvidenceDocument,
  EvidenceDocumentIngestRequest,
  EvidenceDocumentReviewRequest,
  EvidenceDocumentReviewResponse,
  EvidenceDocumentsResponse,
  ExecutionLedgerResponse,
  ExecutionPlan,
  ExecutionReceiptRequest,
  ExecutionReconciliationRequest,
  HouseholdResponse,
  LiveDataResponse,
  OpportunityRadarResponse,
  RecommendationRequest,
  RecommendationResponse,
  ReviewResponse,
  ScenarioComparisonRequest,
  ScenarioComparisonResponse,
  StrategyCompilation,
  StrategyCompilationRequest,
  WorkbenchRequest,
  WorkbenchResponse
} from "@fidt/contracts";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed";
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const api = {
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  opportunities: () => request<OpportunityRadarResponse>("/api/opportunities"),
  householdOpportunities: (householdId: string) =>
    request<OpportunityRadarResponse>(
      `/api/households/${encodeURIComponent(householdId)}/opportunities`
    ),
  compileStrategies: (householdId: string, input: StrategyCompilationRequest) =>
    request<StrategyCompilation>(
      `/api/households/${encodeURIComponent(householdId)}/strategy-compilations`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  strategyCompilation: (compilationId: string) =>
    request<StrategyCompilation>(`/api/strategy-compilations/${encodeURIComponent(compilationId)}`),
  household: (householdId: string) =>
    request<HouseholdResponse>(`/api/households/${encodeURIComponent(householdId)}`),
  liveData: (refresh = false) =>
    request<LiveDataResponse>(`/api/live-data${refresh ? "?refresh=true" : ""}`),
  evidenceDocuments: (householdId: string) =>
    request<EvidenceDocumentsResponse>(
      `/api/households/${encodeURIComponent(householdId)}/evidence-documents`
    ),
  ingestEvidenceDocument: (householdId: string, input: EvidenceDocumentIngestRequest) =>
    request<EvidenceDocument>(
      `/api/households/${encodeURIComponent(householdId)}/evidence-documents`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  reviewEvidenceDocument: (documentId: string, input: EvidenceDocumentReviewRequest) =>
    request<EvidenceDocumentReviewResponse>(
      `/api/evidence-documents/${encodeURIComponent(documentId)}/review`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  compare: (householdId: string, input: ScenarioComparisonRequest) =>
    request<ScenarioComparisonResponse>(
      `/api/households/${encodeURIComponent(householdId)}/scenarios`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  workbench: (householdId: string, input: WorkbenchRequest) =>
    request<WorkbenchResponse>(`/api/households/${encodeURIComponent(householdId)}/workbench`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  recommend: (householdId: string, input: RecommendationRequest) =>
    request<RecommendationResponse>(
      `/api/households/${encodeURIComponent(householdId)}/recommendations`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    ),
  audit: (householdId: string) =>
    request<AuditResponse>(`/api/households/${encodeURIComponent(householdId)}/audit`),
  review: (
    recommendationId: string,
    input: {
      decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
      rationale: string;
      attestation: boolean;
    }
  ) =>
    request<ReviewResponse>(`/api/recommendations/${encodeURIComponent(recommendationId)}/review`, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  passport: (passportId: string) =>
    request<DecisionPassportResponse>(`/api/passports/${encodeURIComponent(passportId)}`),
  monitorPassport: (passportId: string) =>
    request<DecisionPassportResponse>(`/api/passports/${encodeURIComponent(passportId)}/monitor`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  createExecutionPlan: (passportId: string) =>
    request<ExecutionPlan>(`/api/passports/${encodeURIComponent(passportId)}/execution-plan`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  executionPlans: (householdId: string) =>
    request<ExecutionLedgerResponse>(
      `/api/households/${encodeURIComponent(householdId)}/execution-plans`
    ),
  executionPlan: (planId: string) =>
    request<ExecutionPlan>(`/api/execution-plans/${encodeURIComponent(planId)}`),
  recordExecutionReceipt: (planId: string, taskId: string, input: ExecutionReceiptRequest) =>
    request<ExecutionPlan>(
      `/api/execution-plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}/receipts`,
      { method: "POST", body: JSON.stringify(input) }
    ),
  reconcileExecution: (planId: string, input: ExecutionReconciliationRequest) =>
    request<ExecutionPlan>(`/api/execution-plans/${encodeURIComponent(planId)}/reconcile`, {
      method: "POST",
      body: JSON.stringify(input)
    })
};
