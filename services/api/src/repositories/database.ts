import type {
  AuditEventDto,
  ComplianceDecision,
  DecisionPassportPayload,
  DecisionPassportProof,
  DecisionPassportStatus,
  EvidenceDocument,
  ExecutionPlanDefinition,
  ExecutionReceipt,
  ExecutionReconciliation,
  ExtractedEvidenceFact,
  PassportValidityCheck,
  RecommendationDraft,
  ScenarioComparisonResponse,
  StrategyCompilation
} from "@fidt/contracts";
import {
  demoClientConstitution,
  demoEvents,
  demoHousehold,
  type ConflictFlag,
  type ClientConstitution,
  type FinancialEvent,
  type HouseholdSnapshot,
  type ScenarioResult
} from "@fidt/domain";
import { auditEventHash } from "../governance";

interface HouseholdRow {
  readonly id: string;
  readonly name: string;
  readonly advisor_name: string;
  readonly snapshot_json: string;
  readonly updated_at: string;
}

interface EventRow {
  readonly payload_json: string;
}

interface ScenarioRunRow {
  readonly id: string;
  readonly household_id: string;
  readonly trigger_event_id: string | null;
  readonly compilation_id: string | null;
  readonly created_at: string;
  readonly scenarios_json: string;
  readonly conflicts_json: string;
  readonly decision_capital_cents: number | null;
  readonly constitution_json: string | null;
  readonly analysis_json: string | null;
  readonly resilience_json: string | null;
}

interface ConstitutionRow {
  readonly constitution_json: string;
}

interface PassportRow {
  readonly id: string;
  readonly passport_json: string;
  readonly content_hash: string;
  readonly signature: string;
  readonly algorithm: DecisionPassportProof["algorithm"];
  readonly key_id: DecisionPassportProof["keyId"];
  readonly status: DecisionPassportStatus;
  readonly last_checked_at: string | null;
  readonly invalidated_at: string | null;
  readonly invalidation_reasons_json: string;
}

interface PassportCheckRow {
  readonly id: string;
  readonly checked_at: string;
  readonly status_before: DecisionPassportStatus;
  readonly status_after: DecisionPassportStatus;
  readonly results_json: string;
  readonly reasons_json: string;
}

export interface StoredDecisionPassport {
  readonly passport: DecisionPassportPayload;
  readonly proof: DecisionPassportProof;
  readonly state: {
    readonly status: DecisionPassportStatus;
    readonly lastCheckedAt: string | null;
    readonly invalidatedAt: string | null;
    readonly invalidationReasons: readonly string[];
  };
  readonly checks: readonly PassportValidityCheck[];
}

interface ExecutionPlanRow {
  readonly plan_json: string;
  readonly passport_status: DecisionPassportStatus;
}

interface ExecutionReceiptRow {
  readonly receipt_json: string;
}

interface ExecutionReconciliationRow {
  readonly reconciliation_json: string;
}

export interface StoredExecutionPlan {
  readonly definition: ExecutionPlanDefinition;
  readonly receipts: readonly ExecutionReceipt[];
  readonly reconciliations: readonly ExecutionReconciliation[];
  readonly passportStatus: DecisionPassportStatus;
}

interface RecommendationRow {
  readonly id: string;
  readonly household_id: string;
  readonly run_id: string;
  readonly draft_json: string;
  readonly compliance_json: string;
}

interface AuditRow {
  readonly id: string;
  readonly household_id: string;
  readonly actor_type: AuditEventDto["actorType"];
  readonly actor_id: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly occurred_at: string;
  readonly metadata_json: string;
  readonly previous_hash: string | null;
  readonly event_hash: string;
}

interface EvidenceDocumentRow {
  readonly id: string;
  readonly household_id: string;
  readonly document_type: EvidenceDocument["documentType"];
  readonly file_name: string;
  readonly status: EvidenceDocument["status"];
  readonly effective_at: string;
  readonly ingested_at: string;
  readonly confirmed_at: string | null;
  readonly reviewer_id: string | null;
  readonly content_hash: string;
  readonly extraction_method: EvidenceDocument["extractionMethod"];
}

interface EvidenceFactRow {
  readonly id: string;
  readonly field_path: string;
  readonly label: string;
  readonly value_json: string;
  readonly value_type: ExtractedEvidenceFact["valueType"];
  readonly unit: string | null;
  readonly source_excerpt: string;
  readonly confidence: number;
  readonly status: ExtractedEvidenceFact["status"];
  readonly affects_json: string;
}

interface StrategyCompilationRow {
  readonly compilation_json: string;
}

export class DatabaseRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async ensureDemoSeed(): Promise<void> {
    const row = await this.#db
      .prepare("SELECT id FROM households WHERE id = ?")
      .bind(demoHousehold.id)
      .first<{ id: string }>();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    if (!row) {
      statements.push(
        this.#db
          .prepare(
            "INSERT OR IGNORE INTO households (id, name, advisor_name, snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
          )
          .bind(
            demoHousehold.id,
            demoHousehold.name,
            "Cece Sterling",
            JSON.stringify(demoHousehold),
            now,
            now
          )
      );
      for (const event of demoEvents) {
        statements.push(
          this.#db
            .prepare(
              "INSERT OR IGNORE INTO financial_events (id, household_id, event_type, severity, status, occurred_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(
              event.id,
              event.householdId,
              event.type,
              event.severity,
              event.status,
              event.occurredAt,
              JSON.stringify(event)
            )
        );
      }
      statements.push(
        this.#db
          .prepare(
            "INSERT OR IGNORE INTO source_facts (id, household_id, category, field_path, value_json, source_id, source_type, observed_at, recorded_at, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            "fact-annual-spending",
            demoHousehold.id,
            "CLIENT_FACT",
            "annualSpending",
            JSON.stringify(demoHousehold.annualSpending),
            "synthetic-demo-onboarding",
            "SANDBOX",
            demoHousehold.asOf,
            now,
            1
          )
      );
    }
    statements.push(
      this.#db
        .prepare(
          "INSERT OR IGNORE INTO client_constitutions (id, household_id, version, effective_at, constitution_json) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(
          demoClientConstitution.id,
          demoHousehold.id,
          demoClientConstitution.version,
          demoClientConstitution.effectiveAt,
          JSON.stringify(demoClientConstitution)
        )
    );
    await this.#db.batch(statements);
  }

  async getHousehold(id: string): Promise<HouseholdSnapshot | null> {
    const row = await this.#db
      .prepare("SELECT snapshot_json FROM households WHERE id = ?")
      .bind(id)
      .first<{ snapshot_json: string }>();
    return row ? parseJson<HouseholdSnapshot>(row.snapshot_json) : null;
  }

  async listHouseholds(): Promise<readonly HouseholdRow[]> {
    const result = await this.#db
      .prepare(
        "SELECT id, name, advisor_name, snapshot_json, updated_at FROM households ORDER BY updated_at DESC"
      )
      .all<HouseholdRow>();
    return result.results;
  }

  async getCurrentConstitution(householdId: string): Promise<ClientConstitution> {
    const row = await this.#db
      .prepare(
        "SELECT constitution_json FROM client_constitutions WHERE household_id = ? ORDER BY version DESC LIMIT 1"
      )
      .bind(householdId)
      .first<ConstitutionRow>();
    return normalizeConstitution(
      row
        ? parseJson<ClientConstitution>(row.constitution_json)
        : { ...demoClientConstitution, householdId }
    );
  }

  async listEvents(householdId?: string): Promise<readonly FinancialEvent[]> {
    const statement = householdId
      ? this.#db
          .prepare(
            "SELECT payload_json FROM financial_events WHERE household_id = ? ORDER BY occurred_at DESC"
          )
          .bind(householdId)
      : this.#db.prepare(
          "SELECT payload_json FROM financial_events ORDER BY occurred_at DESC LIMIT 50"
        );
    const result = await statement.all<EventRow>();
    return result.results.map((row) => parseJson<FinancialEvent>(row.payload_json));
  }

  async saveEvidenceDocument(document: EvidenceDocument, sourceText: string): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          "INSERT INTO evidence_documents (id, household_id, document_type, file_name, status, effective_at, ingested_at, confirmed_at, reviewer_id, content_hash, source_text, extraction_method, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          document.id,
          document.householdId,
          document.documentType,
          document.fileName,
          document.status,
          document.effectiveAt,
          document.ingestedAt,
          document.confirmedAt,
          document.reviewerId,
          document.contentHash,
          sourceText,
          document.extractionMethod,
          JSON.stringify({ factCount: document.facts.length })
        )
    ];
    for (const fact of document.facts) {
      statements.push(
        this.#db
          .prepare(
            "INSERT INTO evidence_extractions (id, document_id, household_id, field_path, label, value_json, value_type, unit, source_excerpt, confidence, status, affects_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            fact.id,
            document.id,
            document.householdId,
            fact.fieldPath,
            fact.label,
            JSON.stringify(fact.value),
            fact.valueType,
            fact.unit,
            fact.sourceExcerpt,
            fact.confidence,
            fact.status,
            JSON.stringify(fact.affectsOpportunities)
          )
      );
    }
    await this.#db.batch(statements);
  }

  async listEvidenceDocuments(householdId: string): Promise<readonly EvidenceDocument[]> {
    const rows = await this.#db
      .prepare(
        "SELECT id, household_id, document_type, file_name, status, effective_at, ingested_at, confirmed_at, reviewer_id, content_hash, extraction_method FROM evidence_documents WHERE household_id = ? ORDER BY ingested_at DESC"
      )
      .bind(householdId)
      .all<EvidenceDocumentRow>();
    return Promise.all(rows.results.map((row) => this.hydrateEvidenceDocument(row)));
  }

  async getEvidenceDocument(id: string): Promise<EvidenceDocument | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, household_id, document_type, file_name, status, effective_at, ingested_at, confirmed_at, reviewer_id, content_hash, extraction_method FROM evidence_documents WHERE id = ?"
      )
      .bind(id)
      .first<EvidenceDocumentRow>();
    return row ? this.hydrateEvidenceDocument(row) : null;
  }

  async reviewEvidenceDocument(input: {
    readonly document: EvidenceDocument;
    readonly reviewerId: string;
    readonly reviewedAt: string;
    readonly decision: "CONFIRM" | "REJECT";
    readonly selectedFacts: readonly ExtractedEvidenceFact[];
    readonly updatedHousehold: HouseholdSnapshot | null;
  }): Promise<void> {
    const factIds = new Set(input.selectedFacts.map((fact) => fact.id));
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          "UPDATE evidence_documents SET status = ?, confirmed_at = ?, reviewer_id = ? WHERE id = ? AND status = 'EXTRACTED'"
        )
        .bind(
          input.decision === "CONFIRM" ? "CONFIRMED" : "REJECTED",
          input.decision === "CONFIRM" ? input.reviewedAt : null,
          input.reviewerId,
          input.document.id
        )
    ];
    for (const fact of input.document.facts) {
      const selected = factIds.has(fact.id);
      const status =
        input.decision === "CONFIRM" && selected
          ? "CONFIRMED"
          : input.decision === "REJECT" || !selected
            ? "REJECTED"
            : fact.status;
      statements.push(
        this.#db
          .prepare(
            "UPDATE evidence_extractions SET status = ? WHERE id = ? AND document_id = ? AND status = 'PROPOSED'"
          )
          .bind(status, fact.id, input.document.id)
      );
      if (status !== "CONFIRMED") continue;
      statements.push(
        this.#db
          .prepare(
            "INSERT INTO source_facts (id, household_id, category, field_path, value_json, source_id, source_type, observed_at, recorded_at, confidence) VALUES (?, ?, 'CLIENT_FACT', ?, ?, ?, 'DOCUMENT', ?, ?, ?)"
          )
          .bind(
            fact.id,
            input.document.householdId,
            fact.fieldPath,
            JSON.stringify(fact.value),
            input.document.id,
            input.document.effectiveAt,
            input.reviewedAt,
            fact.confidence
          ),
        this.#db
          .prepare(
            "UPDATE source_facts SET superseded_by = ? WHERE household_id = ? AND field_path = ? AND id != ? AND superseded_by IS NULL"
          )
          .bind(fact.id, input.document.householdId, fact.fieldPath, fact.id)
      );
    }
    if (input.updatedHousehold) {
      statements.push(
        this.#db
          .prepare("UPDATE households SET snapshot_json = ?, updated_at = ? WHERE id = ?")
          .bind(
            JSON.stringify(input.updatedHousehold),
            input.reviewedAt,
            input.document.householdId
          )
      );
    }
    await this.#db.batch(statements);
  }

  async getLatestPassportStatus(householdId: string): Promise<DecisionPassportStatus | null> {
    const row = await this.#db
      .prepare(
        "SELECT status FROM decision_passports WHERE household_id = ? ORDER BY issued_at DESC LIMIT 1"
      )
      .bind(householdId)
      .first<{ status: DecisionPassportStatus }>();
    return row?.status ?? null;
  }

  async saveStrategyCompilation(compilation: StrategyCompilation): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO strategy_compilations (id, household_id, opportunity_id, trigger_event_id, compiler_version, compiled_at, compilation_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        compilation.id,
        compilation.householdId,
        compilation.opportunityId,
        compilation.triggerEventId,
        compilation.compilerVersion,
        compilation.compiledAt,
        JSON.stringify(compilation)
      )
      .run();
  }

  async getStrategyCompilation(id: string): Promise<StrategyCompilation | null> {
    const row = await this.#db
      .prepare("SELECT compilation_json FROM strategy_compilations WHERE id = ?")
      .bind(id)
      .first<StrategyCompilationRow>();
    return row ? parseJson<StrategyCompilation>(row.compilation_json) : null;
  }

  async saveScenarioRun(run: ScenarioComparisonResponse): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO scenario_runs (id, household_id, trigger_event_id, compilation_id, created_at, assumptions_json, scenarios_json, conflicts_json, decision_capital_cents, constitution_json, analysis_json, resilience_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        run.runId,
        run.householdId,
        run.triggerEventId ?? null,
        run.compilationId ?? null,
        run.createdAt,
        JSON.stringify(run.scenarios[0]?.assumptions ?? {}),
        JSON.stringify(run.scenarios),
        JSON.stringify(run.conflicts),
        Math.round(run.decisionCapital * 100),
        JSON.stringify(run.clientConstitution),
        JSON.stringify(run.analysis),
        run.resilience ? JSON.stringify(run.resilience) : null
      )
      .run();
  }

  async getScenarioRun(id: string): Promise<ScenarioComparisonResponse | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, household_id, trigger_event_id, compilation_id, created_at, scenarios_json, conflicts_json, decision_capital_cents, constitution_json, analysis_json, resilience_json FROM scenario_runs WHERE id = ?"
      )
      .bind(id)
      .first<ScenarioRunRow>();
    if (!row) return null;
    return {
      runId: row.id,
      householdId: row.household_id,
      ...(row.trigger_event_id ? { triggerEventId: row.trigger_event_id } : {}),
      ...(row.compilation_id ? { compilationId: row.compilation_id } : {}),
      createdAt: row.created_at,
      decisionCapital:
        row.decision_capital_cents === null
          ? (parseJson<ScenarioResult[]>(row.scenarios_json)[0]?.capitalUse.available ?? 0)
          : row.decision_capital_cents / 100,
      clientConstitution: row.constitution_json
        ? parseJson<ClientConstitution>(row.constitution_json)
        : demoClientConstitution,
      analysis: row.analysis_json
        ? parseJson<ScenarioComparisonResponse["analysis"]>(row.analysis_json)
        : null,
      scenarios: parseJson<ScenarioResult[]>(row.scenarios_json),
      conflicts: parseJson<ConflictFlag[]>(row.conflicts_json),
      ...(row.resilience_json
        ? {
            resilience: parseJson<NonNullable<ScenarioComparisonResponse["resilience"]>>(
              row.resilience_json
            )
          }
        : {})
    };
  }

  async getLatestScenarios(householdId: string): Promise<readonly ScenarioResult[]> {
    const row = await this.#db
      .prepare(
        "SELECT scenarios_json FROM scenario_runs WHERE household_id = ? ORDER BY created_at DESC LIMIT 1"
      )
      .bind(householdId)
      .first<{ scenarios_json: string }>();
    return row ? parseJson<ScenarioResult[]>(row.scenarios_json) : [];
  }

  async saveRecommendation(
    recommendation: RecommendationDraft,
    compliance: ComplianceDecision,
    runId: string
  ): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO recommendations (id, household_id, run_id, status, created_at, draft_json, compliance_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        recommendation.id,
        recommendation.householdId,
        runId,
        compliance.status,
        recommendation.createdAt,
        JSON.stringify(recommendation),
        JSON.stringify(compliance)
      )
      .run();
  }

  async getRecommendation(id: string): Promise<{
    recommendation: RecommendationDraft;
    compliance: ComplianceDecision;
    runId: string;
  } | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, household_id, run_id, draft_json, compliance_json FROM recommendations WHERE id = ?"
      )
      .bind(id)
      .first<RecommendationRow>();
    if (!row) return null;
    return {
      recommendation: parseJson<RecommendationDraft>(row.draft_json),
      compliance: parseJson<ComplianceDecision>(row.compliance_json),
      runId: row.run_id
    };
  }

  async saveHumanReview(input: {
    readonly id: string;
    readonly recommendationId: string;
    readonly householdId: string;
    readonly reviewerId: string;
    readonly decision: string;
    readonly rationale: string;
    readonly attestation: boolean;
    readonly reviewedAt: string;
  }): Promise<void> {
    await this.#db.batch([
      this.#db
        .prepare(
          "INSERT INTO human_reviews (id, recommendation_id, household_id, reviewer_id, decision, rationale, attestation, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          input.id,
          input.recommendationId,
          input.householdId,
          input.reviewerId,
          input.decision,
          input.rationale,
          input.attestation ? 1 : 0,
          input.reviewedAt
        ),
      this.#db
        .prepare("UPDATE recommendations SET status = ?, reviewed_at = ? WHERE id = ?")
        .bind(input.decision, input.reviewedAt, input.recommendationId)
    ]);
  }

  async saveDecisionPassport(
    passport: DecisionPassportPayload,
    proof: DecisionPassportProof
  ): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO decision_passports (id, recommendation_id, household_id, run_id, issued_at, passport_json, content_hash, signature, algorithm, key_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALID')"
      )
      .bind(
        passport.id,
        passport.recommendationId,
        passport.householdId,
        passport.runId,
        passport.issuedAt,
        JSON.stringify(passport),
        proof.contentHash,
        proof.signature,
        proof.algorithm,
        proof.keyId
      )
      .run();
  }

  async getDecisionPassport(id: string): Promise<StoredDecisionPassport | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, passport_json, content_hash, signature, algorithm, key_id, status, last_checked_at, invalidated_at, invalidation_reasons_json FROM decision_passports WHERE id = ?"
      )
      .bind(id)
      .first<PassportRow>();
    if (!row) return null;
    const checkRows = await this.#db
      .prepare(
        "SELECT id, checked_at, status_before, status_after, results_json, reasons_json FROM passport_validity_checks WHERE passport_id = ? ORDER BY checked_at DESC LIMIT 20"
      )
      .bind(id)
      .all<PassportCheckRow>();
    return {
      passport: parseJson<DecisionPassportPayload>(row.passport_json),
      proof: {
        algorithm: row.algorithm,
        keyId: row.key_id,
        contentHash: row.content_hash,
        signature: row.signature
      },
      state: {
        status: row.status,
        lastCheckedAt: row.last_checked_at,
        invalidatedAt: row.invalidated_at,
        invalidationReasons: parseJson<string[]>(row.invalidation_reasons_json)
      },
      checks: checkRows.results.map((check) => ({
        id: check.id,
        checkedAt: check.checked_at,
        statusBefore: check.status_before,
        statusAfter: check.status_after,
        results: parseJson<PassportValidityCheck["results"]>(check.results_json),
        reasons: parseJson<string[]>(check.reasons_json)
      }))
    };
  }

  async getLatestDecisionPassport(householdId: string): Promise<StoredDecisionPassport | null> {
    const row = await this.#db
      .prepare(
        "SELECT id FROM decision_passports WHERE household_id = ? ORDER BY issued_at DESC LIMIT 1"
      )
      .bind(householdId)
      .first<{ id: string }>();
    return row ? this.getDecisionPassport(row.id) : null;
  }

  async saveExecutionPlan(plan: ExecutionPlanDefinition): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO execution_plans (id, passport_id, household_id, created_at, plan_json) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(plan.id, plan.passportId, plan.householdId, plan.createdAt, JSON.stringify(plan))
      .run();
  }

  async getExecutionPlan(id: string): Promise<StoredExecutionPlan | null> {
    const row = await this.#db
      .prepare(
        "SELECT ep.plan_json, dp.status AS passport_status FROM execution_plans ep JOIN decision_passports dp ON dp.id = ep.passport_id WHERE ep.id = ?"
      )
      .bind(id)
      .first<ExecutionPlanRow>();
    return row ? this.hydrateExecutionPlan(row) : null;
  }

  async getExecutionPlanByPassport(passportId: string): Promise<StoredExecutionPlan | null> {
    const row = await this.#db
      .prepare(
        "SELECT ep.plan_json, dp.status AS passport_status FROM execution_plans ep JOIN decision_passports dp ON dp.id = ep.passport_id WHERE ep.passport_id = ?"
      )
      .bind(passportId)
      .first<ExecutionPlanRow>();
    return row ? this.hydrateExecutionPlan(row) : null;
  }

  async listExecutionPlans(householdId: string): Promise<readonly StoredExecutionPlan[]> {
    const rows = await this.#db
      .prepare(
        "SELECT ep.plan_json, dp.status AS passport_status FROM execution_plans ep JOIN decision_passports dp ON dp.id = ep.passport_id WHERE ep.household_id = ? ORDER BY ep.created_at DESC"
      )
      .bind(householdId)
      .all<ExecutionPlanRow>();
    return Promise.all(rows.results.map((row) => this.hydrateExecutionPlan(row)));
  }

  async saveExecutionReceipt(receipt: ExecutionReceipt): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO execution_receipts (id, plan_id, task_id, recorded_at, receipt_json) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(receipt.id, receipt.planId, receipt.taskId, receipt.recordedAt, JSON.stringify(receipt))
      .run();
  }

  async saveExecutionReconciliation(reconciliation: ExecutionReconciliation): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO execution_reconciliations (id, plan_id, passport_id, recorded_at, reconciliation_json) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(
        reconciliation.id,
        reconciliation.planId,
        reconciliation.passportId,
        reconciliation.recordedAt,
        JSON.stringify(reconciliation)
      )
      .run();
  }

  async transitionPassportStatus(input: {
    readonly passportId: string;
    readonly status: "REVIEW_REQUIRED" | "INVALIDATED";
    readonly occurredAt: string;
    readonly reasons: readonly string[];
  }): Promise<void> {
    await this.#db
      .prepare(
        "UPDATE decision_passports SET status = CASE WHEN status = 'INVALIDATED' THEN status ELSE ? END, last_checked_at = ?, invalidated_at = CASE WHEN ? = 'INVALIDATED' THEN COALESCE(invalidated_at, ?) ELSE invalidated_at END, invalidation_reasons_json = CASE WHEN status = 'INVALIDATED' THEN invalidation_reasons_json ELSE ? END WHERE id = ?"
      )
      .bind(
        input.status,
        input.occurredAt,
        input.status,
        input.occurredAt,
        JSON.stringify(input.reasons),
        input.passportId
      )
      .run();
  }

  async listMonitorablePassportIds(): Promise<readonly string[]> {
    const result = await this.#db
      .prepare(
        "SELECT id FROM decision_passports WHERE status != 'INVALIDATED' ORDER BY COALESCE(last_checked_at, issued_at) ASC LIMIT 100"
      )
      .all<{ id: string }>();
    return result.results.map((row) => row.id);
  }

  async savePassportCheck(passportId: string, check: PassportValidityCheck): Promise<void> {
    await this.#db.batch([
      this.#db
        .prepare(
          "INSERT INTO passport_validity_checks (id, passport_id, checked_at, status_before, status_after, results_json, reasons_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          check.id,
          passportId,
          check.checkedAt,
          check.statusBefore,
          check.statusAfter,
          JSON.stringify(check.results),
          JSON.stringify(check.reasons)
        ),
      this.#db
        .prepare(
          "UPDATE decision_passports SET status = ?, last_checked_at = ?, invalidated_at = CASE WHEN ? = 'INVALIDATED' THEN COALESCE(invalidated_at, ?) ELSE invalidated_at END, invalidation_reasons_json = CASE WHEN ? IN ('INVALIDATED', 'REVIEW_REQUIRED') THEN ? WHEN ? = 'VALID' THEN '[]' ELSE invalidation_reasons_json END WHERE id = ?"
        )
        .bind(
          check.statusAfter,
          check.checkedAt,
          check.statusAfter,
          check.checkedAt,
          check.statusAfter,
          JSON.stringify(check.reasons),
          check.statusAfter,
          passportId
        )
    ]);
  }

  async appendAudit(input: {
    readonly householdId: string;
    readonly actorType: AuditEventDto["actorType"];
    readonly actorId: string;
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly occurredAt?: string;
  }): Promise<AuditEventDto> {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const previous = await this.#db
      .prepare(
        "SELECT event_hash FROM audit_events WHERE household_id = ? ORDER BY sequence_number DESC LIMIT 1"
      )
      .bind(input.householdId)
      .first<{ event_hash: string }>();
    const previousHash = previous?.event_hash ?? null;
    const id = crypto.randomUUID();
    const auditEvent = {
      id,
      ...input,
      occurredAt,
      previousHash
    };
    const eventHash = await auditEventHash(auditEvent);
    await this.#db
      .prepare(
        "INSERT INTO audit_events (id, household_id, actor_type, actor_id, action, entity_type, entity_id, occurred_at, metadata_json, previous_hash, event_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        input.householdId,
        input.actorType,
        input.actorId,
        input.action,
        input.entityType,
        input.entityId,
        occurredAt,
        JSON.stringify(input.metadata),
        previousHash,
        eventHash
      )
      .run();
    return { ...auditEvent, eventHash };
  }

  async listAudit(householdId: string): Promise<readonly AuditEventDto[]> {
    const result = await this.#db
      .prepare(
        "SELECT id, household_id, actor_type, actor_id, action, entity_type, entity_id, occurred_at, metadata_json, previous_hash, event_hash FROM audit_events WHERE household_id = ? ORDER BY sequence_number DESC"
      )
      .bind(householdId)
      .all<AuditRow>();
    return result.results.map((row) => ({
      id: row.id,
      householdId: row.household_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      occurredAt: row.occurred_at,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json),
      previousHash: row.previous_hash,
      eventHash: row.event_hash
    }));
  }

  private async hydrateExecutionPlan(row: ExecutionPlanRow): Promise<StoredExecutionPlan> {
    const definition = parseJson<ExecutionPlanDefinition>(row.plan_json);
    const [receiptRows, reconciliationRows] = await Promise.all([
      this.#db
        .prepare(
          "SELECT receipt_json FROM execution_receipts WHERE plan_id = ? ORDER BY recorded_at ASC, rowid ASC"
        )
        .bind(definition.id)
        .all<ExecutionReceiptRow>(),
      this.#db
        .prepare(
          "SELECT reconciliation_json FROM execution_reconciliations WHERE plan_id = ? ORDER BY recorded_at ASC, rowid ASC"
        )
        .bind(definition.id)
        .all<ExecutionReconciliationRow>()
    ]);
    return {
      definition,
      receipts: receiptRows.results.map((receipt) =>
        parseJson<ExecutionReceipt>(receipt.receipt_json)
      ),
      reconciliations: reconciliationRows.results.map((reconciliation) =>
        parseJson<ExecutionReconciliation>(reconciliation.reconciliation_json)
      ),
      passportStatus: row.passport_status
    };
  }

  private async hydrateEvidenceDocument(row: EvidenceDocumentRow): Promise<EvidenceDocument> {
    const facts = await this.#db
      .prepare(
        "SELECT id, field_path, label, value_json, value_type, unit, source_excerpt, confidence, status, affects_json FROM evidence_extractions WHERE document_id = ? ORDER BY rowid ASC"
      )
      .bind(row.id)
      .all<EvidenceFactRow>();
    return {
      id: row.id,
      householdId: row.household_id,
      documentType: row.document_type,
      fileName: row.file_name,
      status: row.status,
      effectiveAt: row.effective_at,
      ingestedAt: row.ingested_at,
      confirmedAt: row.confirmed_at,
      reviewerId: row.reviewer_id,
      contentHash: row.content_hash,
      extractionMethod: row.extraction_method,
      facts: facts.results.map((fact) => ({
        id: fact.id,
        fieldPath: fact.field_path,
        label: fact.label,
        value: parseJson<string | number>(fact.value_json),
        valueType: fact.value_type,
        unit: fact.unit,
        sourceExcerpt: fact.source_excerpt,
        confidence: fact.confidence,
        status: fact.status,
        affectsOpportunities: parseJson<string[]>(fact.affects_json)
      }))
    };
  }
}

function normalizeConstitution(constitution: ClientConstitution): ClientConstitution {
  return {
    ...constitution,
    constraints: {
      ...constitution.constraints,
      minimumResilienceScore: constitution.constraints.minimumResilienceScore ?? 75,
      minimumCreditFreeRunwayMonths: constitution.constraints.minimumCreditFreeRunwayMonths ?? 12,
      maximumShockCreditRequired: constitution.constraints.maximumShockCreditRequired ?? 0,
      minimumFeasibleOptions: constitution.constraints.minimumFeasibleOptions ?? 2
    }
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
