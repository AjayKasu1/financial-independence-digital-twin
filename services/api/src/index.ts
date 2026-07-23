import {
  type AuditResponse,
  type Citation,
  type DashboardHousehold,
  type DashboardResponse,
  type DecisionPassportResponse,
  type EvidenceDocumentReviewResponse,
  type EvidenceDocumentsResponse,
  type OpportunityRadarResponse,
  type ScenarioComparisonResponse,
  type ValidityMetric,
  evidenceDocumentIngestRequestSchema,
  evidenceDocumentReviewRequestSchema,
  passportMonitorRequestSchema,
  recommendationRequestSchema,
  reviewRequestSchema,
  scenarioComparisonRequestSchema,
  workbenchRequestSchema
} from "@fidt/contracts";
import {
  createDeterministicRecommendation,
  OpenRouterRecommendationGenerator,
  ResilientRecommendationGenerator
} from "@fidt/ai-orchestrator";
import {
  analyzeDecision,
  applyResilienceShock,
  calculateAnnualAdvisoryFee,
  compareHouseholdResilience,
  demoAssumptions,
  demoFeeSchedule,
  demoStrategies,
  detectAdvisorRevenueConflict,
  evaluateHouseholdResilience,
  noResilienceShock,
  resilienceOptionsForStrategies,
  runScenarioComparison,
  type AssumptionSet,
  type ConflictFlag,
  type DecisionContext,
  type HouseholdSnapshot,
  type StrategyRequest
} from "@fidt/domain";
import { evaluateRecommendation } from "@fidt/policy-engine";
import { Hono } from "hono";
import { ZodError } from "zod";
import {
  applyConfirmedEvidence,
  EvidenceExtractionError,
  extractEvidenceDocument
} from "./evidence";
import { getLiveData } from "./live-data";
import { buildOpportunityRadar } from "./opportunities";
import {
  evaluatePassportValidity,
  issueDecisionPassport,
  observationsForPassport,
  verifyDecisionPassport
} from "./passports";
import { approvalBlockReason, verifyAuditChain } from "./governance";
import { authenticate, rateLimit, requestContext, securityHeaders } from "./middleware";
import { DatabaseRepository } from "./repositories/database";
import type { Bindings, Variables } from "./types";
import { runAdvisorWorkbench } from "./workbench";

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
      const leading = [...scenarios]
        .filter((scenario) => scenario.capitalUse?.feasible !== false)
        .sort((left, right) => right.successProbability - left.successProbability)[0];
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
  const radarResponses = await Promise.all(
    rows.map(async (row) => {
      const household = JSON.parse(row.snapshot_json) as HouseholdSnapshot;
      return buildOpportunityRadar({
        household,
        constitution: await repository.getCurrentConstitution(household.id),
        events: events.filter((event) => event.householdId === household.id),
        documents: await repository.listEvidenceDocuments(household.id),
        latestPassportStatus: await repository.getLatestPassportStatus(household.id)
      });
    })
  );
  const response: DashboardResponse = {
    households,
    events,
    summary: {
      households: households.length,
      assetsTracked: households.reduce((sum, household) => sum + household.investableAssets, 0),
      openOpportunities: radarResponses.reduce((sum, radar) => sum + radar.opportunities.length, 0),
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
  const [clientConstitution, events, latestScenarios] = await Promise.all([
    repository.getCurrentConstitution(householdId),
    repository.listEvents(householdId),
    repository.getLatestScenarios(householdId)
  ]);
  const decisionCapital = household.rsuGrants[0]?.nextVestValue ?? 0;
  const resilience = evaluateHouseholdResilience(
    household,
    clientConstitution,
    noResilienceShock,
    decisionCapital,
    resilienceOptionsForStrategies(household, demoStrategies, decisionCapital)
  );
  return context.json({ household, clientConstitution, events, latestScenarios, resilience });
});

app.get("/api/opportunities", async (context) => {
  const repository = await repositoryFor(context.env);
  const rows = await repository.listHouseholds();
  const now = new Date();
  const radarResponses = await Promise.all(
    rows.map(async (row) => {
      const household = JSON.parse(row.snapshot_json) as HouseholdSnapshot;
      const [constitution, events, documents, latestPassportStatus] = await Promise.all([
        repository.getCurrentConstitution(household.id),
        repository.listEvents(household.id),
        repository.listEvidenceDocuments(household.id),
        repository.getLatestPassportStatus(household.id)
      ]);
      return buildOpportunityRadar({
        household,
        constitution,
        events,
        documents,
        latestPassportStatus,
        now
      });
    })
  );
  const opportunities = radarResponses
    .flatMap((response) => response.opportunities)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
  const response: OpportunityRadarResponse = {
    generatedAt: now.toISOString(),
    methodologyVersion: "advisor-opportunity-radar-v1",
    summary: {
      actionNow: opportunities.filter((opportunity) => opportunity.score >= 75).length,
      evidenceBlocked: opportunities.filter(
        (opportunity) => opportunity.evidence.readiness === "BLOCKED"
      ).length,
      decisionCapital: radarResponses.reduce(
        (sum, radar) => sum + radar.summary.decisionCapital,
        0
      ),
      passportsAtRisk: radarResponses.reduce(
        (sum, response) => sum + response.summary.passportsAtRisk,
        0
      )
    },
    opportunities
  };
  return context.json(response);
});

app.get("/api/households/:householdId/opportunities", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const [constitution, events, documents, latestPassportStatus] = await Promise.all([
    repository.getCurrentConstitution(household.id),
    repository.listEvents(household.id),
    repository.listEvidenceDocuments(household.id),
    repository.getLatestPassportStatus(household.id)
  ]);
  return context.json(
    buildOpportunityRadar({
      household,
      constitution,
      events,
      documents,
      latestPassportStatus
    })
  );
});

app.get("/api/households/:householdId/evidence-documents", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const documents = await repository.listEvidenceDocuments(household.id);
  const response: EvidenceDocumentsResponse = {
    householdId: household.id,
    documents,
    summary: {
      totalDocuments: documents.length,
      confirmedDocuments: documents.filter((document) => document.status === "CONFIRMED").length,
      proposedFacts: documents
        .flatMap((document) => document.facts)
        .filter((fact) => fact.status === "PROPOSED").length,
      confirmedFacts: documents
        .flatMap((document) => document.facts)
        .filter((fact) => fact.status === "CONFIRMED").length
    }
  };
  return context.json(response);
});

app.post("/api/households/:householdId/evidence-documents", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const input = evidenceDocumentIngestRequestSchema.parse(await context.req.json());
  let document;
  try {
    document = await extractEvidenceDocument(household.id, input);
  } catch (error) {
    if (error instanceof EvidenceExtractionError) throw new HttpError(422, error.message);
    throw error;
  }
  await repository.saveEvidenceDocument(document, input.content);
  await repository.appendAudit({
    householdId: household.id,
    actorType: "USER",
    actorId: context.get("advisor").id,
    action: "EVIDENCE_DOCUMENT_INGESTED",
    entityType: "evidence_document",
    entityId: document.id,
    metadata: {
      documentType: document.documentType,
      contentHash: document.contentHash,
      extractionMethod: document.extractionMethod,
      proposedFieldPaths: document.facts.map((fact) => fact.fieldPath)
    }
  });
  return context.json(document, 201);
});

app.post("/api/evidence-documents/:documentId/review", async (context) => {
  const repository = await repositoryFor(context.env);
  const input = evidenceDocumentReviewRequestSchema.parse(await context.req.json());
  const document = await repository.getEvidenceDocument(context.req.param("documentId"));
  if (!document) throw new HttpError(404, "Evidence document not found");
  if (document.status !== "EXTRACTED") {
    throw new HttpError(409, "This evidence document has already been reviewed");
  }
  const household = await requireHousehold(repository, document.householdId);
  const requestedIds = new Set(input.factIds);
  const selectedFacts = document.facts.filter((fact) => requestedIds.has(fact.id));
  if (input.decision === "CONFIRM") {
    if (selectedFacts.length === 0) {
      throw new HttpError(422, "Select at least one extracted fact to update the twin");
    }
    if (selectedFacts.length !== requestedIds.size) {
      throw new HttpError(422, "One or more selected facts do not belong to this document");
    }
  }
  const reviewedAt = new Date().toISOString();
  const updatedHousehold =
    input.decision === "CONFIRM"
      ? applyConfirmedEvidence(household, document, selectedFacts, reviewedAt)
      : null;
  await repository.reviewEvidenceDocument({
    document,
    reviewerId: context.get("advisor").id,
    reviewedAt,
    decision: input.decision,
    selectedFacts,
    updatedHousehold
  });
  const reviewAudit = await repository.appendAudit({
    householdId: household.id,
    actorType: "USER",
    actorId: context.get("advisor").id,
    action:
      input.decision === "CONFIRM" ? "EVIDENCE_DOCUMENT_CONFIRMED" : "EVIDENCE_DOCUMENT_REJECTED",
    entityType: "evidence_document",
    entityId: document.id,
    metadata: {
      rationale: input.rationale,
      contentHash: document.contentHash,
      selectedFactIds: selectedFacts.map((fact) => fact.id),
      selectedFieldPaths: selectedFacts.map((fact) => fact.fieldPath)
    }
  });
  const auditEventIds = [reviewAudit.id];
  if (updatedHousehold) {
    const twinAudit = await repository.appendAudit({
      householdId: household.id,
      actorType: "SYSTEM",
      actorId: "evidence-to-twin-v1",
      action: "DIGITAL_TWIN_UPDATED",
      entityType: "household",
      entityId: household.id,
      metadata: {
        documentId: document.id,
        documentContentHash: document.contentHash,
        appliedFieldPaths: selectedFacts.map((fact) => fact.fieldPath),
        priorAsOf: household.asOf,
        updatedAsOf: updatedHousehold.asOf
      }
    });
    auditEventIds.push(twinAudit.id);
  }
  const reviewedDocument = await repository.getEvidenceDocument(document.id);
  if (!reviewedDocument) throw new Error("Reviewed document could not be loaded");
  const response: EvidenceDocumentReviewResponse = {
    document: reviewedDocument,
    twinUpdated: updatedHousehold !== null,
    appliedFieldPaths: selectedFacts.map((fact) => fact.fieldPath),
    auditEventIds
  };
  return context.json(response, 201);
});

app.post("/api/households/:householdId/workbench", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const clientConstitution = await repository.getCurrentConstitution(household.id);
  const input = workbenchRequestSchema.parse(await context.req.json());
  return context.json(runAdvisorWorkbench(household, clientConstitution, input));
});

app.post("/api/households/:householdId/scenarios", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const request = scenarioComparisonRequestSchema.parse(await context.req.json());
  if (request.triggerEventId) {
    const triggerEvent = (await repository.listEvents(household.id)).find(
      (event) => event.id === request.triggerEventId
    );
    if (!triggerEvent) throw new HttpError(422, "Trigger event does not belong to this household");
  }
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
  const clientConstitution = await repository.getCurrentConstitution(household.id);
  const originalDecisionCapital = request.preShockDecisionCapital ?? request.decisionCapital;
  const resilience = request.resilienceShock
    ? compareHouseholdResilience(
        household,
        clientConstitution,
        request.resilienceShock,
        originalDecisionCapital,
        resilienceOptionsForStrategies(
          household,
          request.strategies as readonly StrategyRequest[],
          originalDecisionCapital
        )
      )
    : undefined;
  if (
    resilience &&
    request.decisionCapital > resilience.stressed.metrics.availableDecisionCapital + 0.01
  ) {
    throw new HttpError(
      422,
      "Decision capital exceeds the amount preserved after the resilience stress"
    );
  }
  const scenarioHousehold = resilience
    ? applyResilienceShock(household, resilience.stressed)
    : household;
  const decisionContext: DecisionContext = {
    decisionCapital: request.decisionCapital,
    constitution: clientConstitution
  };
  const scenarios = runScenarioComparison(
    scenarioHousehold,
    request.strategies as readonly StrategyRequest[],
    assumptions,
    demoFeeSchedule,
    decisionContext
  );
  const analysis = analyzeDecision(
    scenarioHousehold,
    request.strategies as readonly StrategyRequest[],
    assumptions,
    demoFeeSchedule,
    decisionContext,
    scenarios
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
    ...(request.triggerEventId ? { triggerEventId: request.triggerEventId } : {}),
    createdAt: new Date().toISOString(),
    decisionCapital: request.decisionCapital,
    clientConstitution,
    analysis,
    scenarios,
    conflicts,
    ...(resilience ? { resilience } : {})
  } satisfies ScenarioComparisonResponse;
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
      assumptionsId: assumptions.id,
      constitutionId: clientConstitution.id,
      constitutionVersion: clientConstitution.version,
      decisionCapital: request.decisionCapital,
      preShockDecisionCapital: request.preShockDecisionCapital ?? null,
      resilienceScore: resilience?.stressed.score ?? null,
      resilienceBand: resilience?.stressed.band ?? null,
      resilienceBreaches: resilience?.stressed.breaches.map((breach) => breach.code) ?? [],
      triggerEventId: request.triggerEventId ?? null
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
  const repairSource = request.repairOfRecommendationId
    ? await repository.getRecommendation(request.repairOfRecommendationId)
    : null;
  if (request.repairOfRecommendationId && !repairSource) {
    throw new HttpError(404, "Recommendation to repair was not found");
  }
  if (
    repairSource &&
    (repairSource.recommendation.householdId !== household.id || repairSource.runId !== run.runId)
  ) {
    throw new HttpError(422, "Repair source must belong to the same household and scenario run");
  }
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
        model: context.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
        requireZeroDataRetention: context.env.APP_ENV !== "demo",
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
  const recommendationContext = {
    household,
    scenarios: run.scenarios,
    conflicts: run.conflicts,
    citations,
    ...(run.resilience ? { resilience: run.resilience } : {}),
    ...(request.advisorRationale ? { advisorRationale: request.advisorRationale } : {}),
    ...(repairSource
      ? {
          complianceFeedback: {
            status: repairSource.compliance.status,
            reasons: repairSource.compliance.reasons,
            requiredActions: repairSource.compliance.requiredActions
          }
        }
      : {})
  };
  const recommendation =
    request.generationMode === "DETERMINISTIC_FALLBACK"
      ? createDeterministicRecommendation(recommendationContext)
      : await generator.generate(recommendationContext);
  const compliance = evaluateRecommendation({
    recommendation,
    scenarios: run.scenarios,
    conflicts: run.conflicts,
    ...(run.resilience ? { resilience: run.resilience } : {})
  });
  await repository.saveRecommendation(recommendation, compliance, run.runId);
  await repository.appendAudit({
    householdId: household.id,
    actorType: recommendation.generatedBy === "OPENROUTER" ? "MODEL" : "SYSTEM",
    actorId: recommendation.modelId,
    action: "RECOMMENDATION_DRAFTED",
    entityType: "recommendation",
    entityId: recommendation.id,
    metadata: {
      promptVersion: recommendation.promptVersion,
      generatedBy: recommendation.generatedBy,
      policyStatus: compliance.status,
      generationMode: request.generationMode,
      repairOfRecommendationId: request.repairOfRecommendationId ?? null
    }
  });
  await repository.appendAudit({
    householdId: household.id,
    actorType: "SYSTEM",
    actorId: compliance.policyVersion,
    action: "COMPLIANCE_CHECK_COMPLETED",
    entityType: "recommendation",
    entityId: recommendation.id,
    metadata: {
      status: compliance.status,
      reasonCodes: compliance.reasons.map((reason) => reason.code),
      requiredActions: compliance.requiredActions,
      repairOfRecommendationId: request.repairOfRecommendationId ?? null
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
  const blocked = approvalBlockReason(input.decision, input.attestation, stored.compliance.status);
  if (blocked) throw new HttpError(409, blocked);
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
  const auditEvent = await repository.appendAudit({
    householdId: stored.recommendation.householdId,
    actorType: "USER",
    actorId: context.get("advisor").id,
    action: "HUMAN_REVIEW_RECORDED",
    entityType: "recommendation",
    entityId: recommendationId,
    metadata: { reviewId, decision: input.decision, attestation: input.attestation }
  });
  let passportId: string | undefined;
  let passportStatus: "VALID" | undefined;
  if (input.decision === "APPROVE") {
    const [run, household] = await Promise.all([
      repository.getScenarioRun(stored.runId),
      repository.getHousehold(stored.recommendation.householdId)
    ]);
    if (!run || !household) throw new HttpError(409, "Passport source data is unavailable");
    const issued = await issueDecisionPassport(
      {
        recommendation: stored.recommendation,
        compliance: stored.compliance,
        run,
        household,
        reviewAuditEventId: auditEvent.id,
        now: new Date(reviewedAt)
      },
      passportSigningSecret(context.env)
    );
    await repository.saveDecisionPassport(issued.passport, issued.proof);
    passportId = issued.passport.id;
    passportStatus = "VALID";
    await repository.appendAudit({
      householdId: stored.recommendation.householdId,
      actorType: "SYSTEM",
      actorId: issued.proof.keyId,
      action: "DECISION_PASSPORT_ISSUED",
      entityType: "decision_passport",
      entityId: issued.passport.id,
      metadata: {
        recommendationId,
        runId: run.runId,
        contentHash: issued.proof.contentHash,
        validityConditions: issued.passport.validityEnvelope.length
      }
    });
  }
  return context.json(
    {
      id: reviewId,
      recommendationId,
      ...input,
      reviewedAt,
      auditEventId: auditEvent.id,
      ...(passportId ? { passportId, passportStatus } : {})
    },
    201
  );
});

app.get("/api/passports/:passportId", async (context) => {
  const repository = await repositoryFor(context.env);
  const stored = await repository.getDecisionPassport(context.req.param("passportId"));
  if (!stored) throw new HttpError(404, "Decision Passport not found");
  const response: DecisionPassportResponse = {
    ...stored,
    verification: {
      verified: await verifyDecisionPassport(
        stored.passport,
        stored.proof,
        passportSigningSecret(context.env)
      ),
      verifiedAt: new Date().toISOString()
    }
  };
  return context.json(response);
});

app.post("/api/passports/:passportId/monitor", async (context) => {
  const repository = await repositoryFor(context.env);
  const passportId = context.req.param("passportId");
  const input = passportMonitorRequestSchema.parse(await context.req.json());
  if (input.observations && context.env.APP_ENV !== "demo") {
    throw new HttpError(422, "Observation overrides are available only in synthetic demo mode");
  }
  const response = await monitorPassport(repository, context.env, passportId, input.observations);
  if (!response) throw new HttpError(404, "Decision Passport not found");
  return context.json(response);
});

app.get("/api/households/:householdId/audit", async (context) => {
  const repository = await repositoryFor(context.env);
  const household = await requireHousehold(repository, context.req.param("householdId"));
  const events = await repository.listAudit(household.id);
  const response: AuditResponse = {
    householdId: household.id,
    events,
    verification: await verifyAuditChain([...events].reverse())
  };
  return context.json(response);
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
  if (error instanceof RangeError) {
    return context.json({ error: error.message, requestId: context.get("requestId") }, 422);
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

function passportSigningSecret(env: Bindings): string {
  if (env.PASSPORT_SIGNING_SECRET) return env.PASSPORT_SIGNING_SECRET;
  if (env.APP_ENV === "production") {
    throw new Error("PASSPORT_SIGNING_SECRET is required in production");
  }
  return "fidt-local-demo-passport-signing-key-v1";
}

async function monitorPassport(
  repository: DatabaseRepository,
  env: Bindings,
  passportId: string,
  overrides?: Partial<Record<ValidityMetric, number>>
): Promise<DecisionPassportResponse | null> {
  const stored = await repository.getDecisionPassport(passportId);
  if (!stored) return null;
  const household = await repository.getHousehold(stored.passport.householdId);
  if (!household) return null;
  const liveData = await getLiveData(env.CACHE, { secUserAgent: env.SEC_USER_AGENT });
  const observations = {
    ...observationsForPassport(stored.passport, household, liveData),
    ...overrides
  };
  const check = evaluatePassportValidity(stored, observations);
  await repository.savePassportCheck(passportId, check);
  if (check.statusAfter !== check.statusBefore) {
    await repository.appendAudit({
      householdId: stored.passport.householdId,
      actorType: "SYSTEM",
      actorId: "passport-validity-monitor-v1",
      action:
        check.statusAfter === "INVALIDATED"
          ? "DECISION_PASSPORT_INVALIDATED"
          : "DECISION_PASSPORT_STATUS_CHANGED",
      entityType: "decision_passport",
      entityId: passportId,
      metadata: {
        statusBefore: check.statusBefore,
        statusAfter: check.statusAfter,
        reasons: check.reasons,
        checkId: check.id
      }
    });
  }
  const refreshed = await repository.getDecisionPassport(passportId);
  if (!refreshed) return null;
  return {
    ...refreshed,
    verification: {
      verified: await verifyDecisionPassport(
        refreshed.passport,
        refreshed.proof,
        passportSigningSecret(env)
      ),
      verifiedAt: new Date().toISOString()
    }
  };
}

class HttpError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 422 | 429;

  constructor(status: HttpError["status"], messageText: string) {
    super(messageText);
    this.status = status;
  }
}

export default {
  fetch: app.fetch,
  scheduled(
    _controller: ScheduledController,
    env: Bindings,
    executionContext: ExecutionContext
  ): void {
    executionContext.waitUntil(
      (async () => {
        const repository = await repositoryFor(env);
        const ids = await repository.listMonitorablePassportIds();
        for (const id of ids) await monitorPassport(repository, env, id);
      })()
    );
  }
};
