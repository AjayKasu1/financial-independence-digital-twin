import {
  type Citation,
  type DashboardHousehold,
  type DashboardResponse,
  recommendationRequestSchema,
  reviewRequestSchema,
  scenarioComparisonRequestSchema
} from "@fidt/contracts";
import {
  OpenRouterRecommendationGenerator,
  ResilientRecommendationGenerator
} from "@fidt/ai-orchestrator";
import {
  calculateAnnualAdvisoryFee,
  demoAssumptions,
  demoFeeSchedule,
  demoStrategies,
  detectAdvisorRevenueConflict,
  runScenarioComparison,
  type AssumptionSet,
  type ConflictFlag,
  type HouseholdSnapshot,
  type StrategyRequest
} from "@fidt/domain";
import { evaluateRecommendation } from "@fidt/policy-engine";
import { Hono } from "hono";
import { ZodError } from "zod";
import { getLiveData } from "./live-data";
import { authenticate, rateLimit, requestContext, securityHeaders } from "./middleware";
import { DatabaseRepository } from "./repositories/database";
import type { Bindings, Variables } from "./types";

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use("/api/*", requestContext);
app.use("/api/*", securityHeaders);
app.use("/api/*", authenticate);
app.use("/api/*", rateLimit);

app.get("/api/health", (context) =>
  context.json({
    status: "ok",
    service: "financial-independence-digital-twin",
    environment: context.env.APP_ENV,
    requestId: context.get("requestId")
  })
);

app.get("/api/dashboard", async (context) => {
  const repository = await repositoryFor(context.env);
  const [rows, events, liveData] = await Promise.all([
    repository.listHouseholds(),
    repository.listEvents(),
    getLiveData(context.env.CACHE, { secUserAgent: context.env.SEC_USER_AGENT })
  ]);
  const households: DashboardHousehold[] = await Promise.all(
    rows.map(async (row) => {
      const household = JSON.parse(row.snapshot_json) as HouseholdSnapshot;
      const latest = await repository.getLatestScenarios(household.id);
      const scenarios =
        latest.length > 0
          ? latest
          : runScenarioComparison(household, demoStrategies, demoAssumptions, demoFeeSchedule);
      const leading = [...scenarios].sort(
        (left, right) => right.successProbability - left.successProbability
      )[0];
      const householdEvents = events.filter((event) => event.householdId === household.id);
      return {
        id: household.id,
        name: household.name,
        advisorName: row.advisor_name,
        investableAssets: household.accounts.reduce((sum, account) => sum + account.balance, 0),
        fiProbability: leading?.successProbability ?? 0,
        fiTarget: leading?.fiNumber ?? 0,
        openEvents: householdEvents.filter((event) => event.status === "OPEN").length,
        highRiskEvents: householdEvents.filter(
          (event) => event.status === "OPEN" && event.severity === "HIGH"
        ).length,
        lastReviewedAt: row.updated_at
      };
    })
  );
  const response: DashboardResponse = {
    households,
    events,
    summary: {
      households: households.length,
      assetsTracked: households.reduce((sum, household) => sum + household.investableAssets, 0),
      openOpportunities: events.filter((event) => event.status === "OPEN").length,
      complianceReviews: 0
    },
    liveData: liveData.observations
  };
  return context.json(response);
});

app.get("/api/live-data", async (context) => {
  const force = context.req.query("refresh") === "true";
  return context.json(
    await getLiveData(context.env.CACHE, { force, secUserAgent: context.env.SEC_USER_AGENT })
  );
});

app.get("/api/households/:householdId", async (context) => {
  const repository = await repositoryFor(context.env);
  const householdId = context.req.param("householdId");
  const household = await requireHousehold(repository, householdId);
  const [events, latestScenarios] = await Promise.all([
    repository.listEvents(householdId),
    repository.getLatestScenarios(householdId)
  ]);
  return context.json({ household, events, latestScenarios });
});

app.post("/api/households/:householdId/scenarios", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const request = scenarioComparisonRequestSchema.parse(await context.req.json());
  const assumptions: AssumptionSet = {
    ...demoAssumptions,
    inflationRate: request.assumptions?.inflationRate ?? demoAssumptions.inflationRate,
    withdrawalRate: request.assumptions?.withdrawalRate ?? demoAssumptions.withdrawalRate,
    equityReturnMean: request.assumptions?.equityReturnMean ?? demoAssumptions.equityReturnMean,
    equityVolatility: request.assumptions?.equityVolatility ?? demoAssumptions.equityVolatility,
    bondReturnMean: request.assumptions?.bondReturnMean ?? demoAssumptions.bondReturnMean,
    bondVolatility: request.assumptions?.bondVolatility ?? demoAssumptions.bondVolatility,
    cashReturn: request.assumptions?.cashReturn ?? demoAssumptions.cashReturn,
    taxDrag: request.assumptions?.taxDrag ?? demoAssumptions.taxDrag,
    planningHorizonYears:
      request.assumptions?.planningHorizonYears ?? demoAssumptions.planningHorizonYears,
    simulationPaths: request.assumptions?.simulationPaths ?? demoAssumptions.simulationPaths,
    seed: request.assumptions?.seed ?? demoAssumptions.seed,
    id: `assumptions-${crypto.randomUUID()}`,
    version: demoAssumptions.version + 1,
    asOf: new Date().toISOString().slice(0, 10)
  };
  const scenarios = runScenarioComparison(
    household,
    request.strategies as readonly StrategyRequest[],
    assumptions,
    demoFeeSchedule
  );
  const currentManagedAssets = household.accounts
    .filter((account) => account.managed)
    .reduce((sum, account) => sum + account.balance, 0);
  const baselineFee = calculateAnnualAdvisoryFee(currentManagedAssets, demoFeeSchedule);
  const conflicts = uniqueConflicts(
    scenarios
      .map((scenario) => detectAdvisorRevenueConflict(baselineFee, scenario.firstYearAdvisoryFee))
      .filter((conflict): conflict is ConflictFlag => conflict !== null)
  );
  const run = {
    runId: crypto.randomUUID(),
    householdId: household.id,
    createdAt: new Date().toISOString(),
    scenarios,
    conflicts
  };
  await repository.saveScenarioRun(run);
  await repository.appendAudit({
    householdId: household.id,
    actorType: "USER",
    actorId: context.get("advisor").id,
    action: "SCENARIO_COMPARISON_CREATED",
    entityType: "scenario_run",
    entityId: run.runId,
    metadata: {
      strategyTypes: scenarios.map((scenario) => scenario.strategy),
      assumptionsId: assumptions.id
    }
  });
  return context.json(run, 201);
});

app.post("/api/households/:householdId/recommendations", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const request = recommendationRequestSchema.parse(await context.req.json());
  const run = await repository.getScenarioRun(request.runId);
  if (!run || run.householdId !== household.id) throw new HttpError(404, "Scenario run not found");
  const liveData = await getLiveData(context.env.CACHE, {
    secUserAgent: context.env.SEC_USER_AGENT
  });
  const citations: Citation[] = [
    {
      id: "client-snapshot",
      title: "Synthetic household snapshot",
      sourceType: "CLIENT_DOCUMENT",
      asOf: household.asOf,
      excerpt: "Demonstration data only; no real client information."
    },
    ...liveData.observations.map((observation) => ({
      id: `public-${observation.seriesId}`,
      title: observation.label,
      sourceType: "PUBLIC_SOURCE" as const,
      sourceUrl: observation.sourceUrl,
      asOf: observation.observationDate
    }))
  ];
  const primary = context.env.OPENROUTER_API_KEY
    ? new OpenRouterRecommendationGenerator({
        apiKey: context.env.OPENROUTER_API_KEY,
        model: context.env.OPENROUTER_MODEL ?? "openrouter/free",
        siteName: "FiduciaryOS Digital Twin",
        ...(context.env.APP_PUBLIC_URL ? { siteUrl: context.env.APP_PUBLIC_URL } : {})
      })
    : null;
  const generator = new ResilientRecommendationGenerator(primary, (error) => {
    console.error(
      JSON.stringify({
        requestId: context.get("requestId"),
        event: "model_fallback",
        error: message(error)
      })
    );
  });
  const recommendation = await generator.generate({
    household,
    scenarios: run.scenarios,
    conflicts: run.conflicts,
    citations,
    ...(request.advisorRationale ? { advisorRationale: request.advisorRationale } : {})
  });
  const compliance = evaluateRecommendation({
    recommendation,
    scenarios: run.scenarios,
    conflicts: run.conflicts
  });
  await repository.saveRecommendation(recommendation, compliance, run.runId);
  await repository.appendAudit({
    householdId: household.id,
    actorType: "MODEL",
    actorId: recommendation.modelId,
    action: "RECOMMENDATION_DRAFTED",
    entityType: "recommendation",
    entityId: recommendation.id,
    metadata: {
      promptVersion: recommendation.promptVersion,
      generatedBy: recommendation.generatedBy,
      policyStatus: compliance.status
    }
  });
  return context.json({ recommendation, compliance }, 201);
});

app.post("/api/recommendations/:recommendationId/review", async (context) => {
  const repository = await repositoryFor(context.env);
  const recommendationId = context.req.param("recommendationId");
  const input = reviewRequestSchema.parse(await context.req.json());
  const stored = await repository.getRecommendation(recommendationId);
  if (!stored) throw new HttpError(404, "Recommendation not found");
  if (input.decision === "APPROVE" && !input.attestation) {
    throw new HttpError(422, "Approval requires the human-review attestation");
  }
  const reviewId = crypto.randomUUID();
  const reviewedAt = new Date().toISOString();
  await repository.saveHumanReview({
    id: reviewId,
    recommendationId,
    householdId: stored.recommendation.householdId,
    reviewerId: context.get("advisor").id,
    decision: input.decision,
    rationale: input.rationale,
    attestation: input.attestation,
    reviewedAt
  });
  await repository.appendAudit({
    householdId: stored.recommendation.householdId,
    actorType: "USER",
    actorId: context.get("advisor").id,
    action: "HUMAN_REVIEW_RECORDED",
    entityType: "recommendation",
    entityId: recommendationId,
    metadata: { reviewId, decision: input.decision, attestation: input.attestation }
  });
  return context.json({ id: reviewId, recommendationId, ...input, reviewedAt }, 201);
});

app.get("/api/households/:householdId/audit", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  return context.json({
    householdId: household.id,
    events: await repository.listAudit(household.id)
  });
});

app.notFound((context) =>
  context.json({ error: "Not found", requestId: context.get("requestId") }, 404)
);

app.onError((error, context) => {
  if (error instanceof ZodError) {
    return context.json(
      { error: "Invalid request", details: error.issues, requestId: context.get("requestId") },
      422
    );
  }
  if (error instanceof HttpError) {
    return context.json(
      { error: error.message, requestId: context.get("requestId") },
      error.status
    );
  }
  console.error(
    JSON.stringify({
      requestId: context.get("requestId"),
      event: "unhandled_error",
      error: message(error)
    })
  );
  return context.json({ error: "Internal server error", requestId: context.get("requestId") }, 500);
});

async function repositoryFor(env: Bindings): Promise<DatabaseRepository> {
  const repository = new DatabaseRepository(env.FIDT_DB);
  await repository.ensureDemoSeed();
  return repository;
}

async function requireHousehold(
  repository: DatabaseRepository,
  householdId: string
): Promise<HouseholdSnapshot> {
  const household = await repository.getHousehold(householdId);
  if (!household) throw new HttpError(404, "Household not found");
  return household;
}

function uniqueConflicts(conflicts: readonly ConflictFlag[]): ConflictFlag[] {
  return [...new Map(conflicts.map((conflict) => [conflict.code, conflict])).values()];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

class HttpError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 422 | 429;

  constructor(status: HttpError["status"], messageText: string) {
    super(messageText);
    this.status = status;
  }
}

export default app;
