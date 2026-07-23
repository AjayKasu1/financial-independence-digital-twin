import type {
  AuditEventDto,
  ComplianceDecision,
  DecisionPassportPayload,
  DecisionPassportProof,
  DecisionPassportStatus,
  PassportValidityCheck,
  RecommendationDraft,
  ScenarioComparisonResponse
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

  async saveScenarioRun(run: ScenarioComparisonResponse): Promise<void> {
    await this.#db
      .prepare(
        "INSERT INTO scenario_runs (id, household_id, trigger_event_id, created_at, assumptions_json, scenarios_json, conflicts_json, decision_capital_cents, constitution_json, analysis_json, resilience_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        run.runId,
        run.householdId,
        run.triggerEventId ?? null,
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
        "SELECT id, household_id, trigger_event_id, created_at, scenarios_json, conflicts_json, decision_capital_cents, constitution_json, analysis_json, resilience_json FROM scenario_runs WHERE id = ?"
      )
      .bind(id)
      .first<ScenarioRunRow>();
    if (!row) return null;
    return {
      runId: row.id,
      householdId: row.household_id,
      ...(row.trigger_event_id ? { triggerEventId: row.trigger_event_id } : {}),
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
          "UPDATE decision_passports SET status = ?, last_checked_at = ?, invalidated_at = CASE WHEN ? = 'INVALIDATED' THEN COALESCE(invalidated_at, ?) ELSE invalidated_at END, invalidation_reasons_json = CASE WHEN ? = 'INVALIDATED' THEN ? ELSE invalidation_reasons_json END WHERE id = ?"
        )
        .bind(
          check.statusAfter,
          check.checkedAt,
          check.statusAfter,
          check.checkedAt,
          check.statusAfter,
          JSON.stringify(check.reasons),
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
