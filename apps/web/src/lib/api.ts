import type {
  AuditResponse,
  DashboardResponse,
  DecisionPassportResponse,
  HouseholdResponse,
  LiveDataResponse,
  RecommendationRequest,
  RecommendationResponse,
  ReviewResponse,
  ScenarioComparisonRequest,
  ScenarioComparisonResponse
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
  household: (householdId: string) =>
    request<HouseholdResponse>(`/api/households/${encodeURIComponent(householdId)}`),
  liveData: (refresh = false) =>
    request<LiveDataResponse>(`/api/live-data${refresh ? "?refresh=true" : ""}`),
  compare: (householdId: string, input: ScenarioComparisonRequest) =>
    request<ScenarioComparisonResponse>(
      `/api/households/${encodeURIComponent(householdId)}/scenarios`,
      { method: "POST", body: JSON.stringify(input) }
    ),
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
    })
};
