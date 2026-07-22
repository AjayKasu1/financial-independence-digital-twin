import type {
  AuditEventDto,
  ComplianceDecision,
  RecommendationDraft,
  ScenarioComparisonResponse
} from "@fidt/contracts";
import {
  demoEvents,
  demoHousehold,
  type ConflictFlag,
  type FinancialEvent,
  type HouseholdSnapshot,
  type ScenarioResult
} from "@fidt/domain";

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
  readonly created_at: string;
  readonly scenarios_json: string;
  readonly conflicts_json: string;
}

interface RecommendationRow {
  readonly id: string;
  readonly household_id: string;
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
    if (row) return;
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.#db
        .prepare(
          "INSERT OR IGNORE INTO households (id, name, advisor_name, snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          demoHousehold.id,
          demoHousehold.name,
          "Elena Morgan, CFP®",
          JSON.stringify(demoHousehold),
          now,
          now
        )
    ];
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
        "INSERT INTO scenario_runs (id, household_id, created_at, assumptions_json, scenarios_json, conflicts_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(
        run.runId,
        run.householdId,
        run.createdAt,
        JSON.stringify(run.scenarios[0]?.assumptions ?? {}),
        JSON.stringify(run.scenarios),
        JSON.stringify(run.conflicts)
      )
      .run();
  }

  async getScenarioRun(id: string): Promise<ScenarioComparisonResponse | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, household_id, created_at, scenarios_json, conflicts_json FROM scenario_runs WHERE id = ?"
      )
      .bind(id)
      .first<ScenarioRunRow>();
    if (!row) return null;
    return {
      runId: row.id,
      householdId: row.household_id,
      createdAt: row.created_at,
      scenarios: parseJson<ScenarioResult[]>(row.scenarios_json),
      conflicts: parseJson<ConflictFlag[]>(row.conflicts_json)
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

  async getRecommendation(
    id: string
  ): Promise<{ recommendation: RecommendationDraft; compliance: ComplianceDecision } | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, household_id, draft_json, compliance_json FROM recommendations WHERE id = ?"
      )
      .bind(id)
      .first<RecommendationRow>();
    if (!row) return null;
    return {
      recommendation: parseJson<RecommendationDraft>(row.draft_json),
      compliance: parseJson<ComplianceDecision>(row.compliance_json)
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
    const canonical = JSON.stringify({
      id,
      ...input,
      occurredAt,
      previousHash
    });
    const eventHash = await sha256(canonical);
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
    return { id, ...input, occurredAt, previousHash, eventHash };
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

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
