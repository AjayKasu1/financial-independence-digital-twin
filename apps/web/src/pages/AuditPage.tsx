import { CheckCircle2, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { AuditResponse } from "@fidt/contracts";
import { Badge, ErrorState, LoadingState } from "../components/Ui";
import { api } from "../lib/api";
import { date } from "../lib/format";

export function AuditPage() {
  const { householdId = "" } = useParams();
  const [search] = useSearchParams();
  const highlightedEventId = search.get("event");
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api
      .audit(householdId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };
  useEffect(() => {
    void api
      .audit(householdId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [householdId]);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Verifying the audit chain…" />;
  const { events, verification } = data;
  return (
    <>
      <section className="hero-row compact">
        <div>
          <span className="eyebrow coral">Governance console</span>
          <h1>Evidence and audit trail</h1>
          <p>
            Every material workflow action is immutable, timestamped, actor-attributed, and linked
            to the prior record by SHA-256.
          </p>
        </div>
        <div className="trust-stamp">
          <ShieldCheck />
          <div>
            <strong>Append-only D1 ledger</strong>
            <span>Update and delete blocked by database triggers</span>
          </div>
        </div>
      </section>
      <section className="metric-grid audit-metrics">
        <article className="metric-card">
          <span>Recorded events</span>
          <strong>{events.length}</strong>
          <small>For this synthetic household</small>
        </article>
        <article className="metric-card">
          <span>Chain status</span>
          <strong>{verification.status === "EMPTY" ? "Ready" : verification.status}</strong>
          <small>
            {verification.verifiedEvents} of {verification.totalEvents} events cryptographically
            verified
          </small>
        </article>
        <article className="metric-card">
          <span>Human approvals</span>
          <strong>
            {events.filter((event) => event.action === "HUMAN_REVIEW_RECORDED").length}
          </strong>
          <small>Explicit attestations</small>
        </article>
      </section>
      <article className="panel audit-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Chronological ledger</span>
            <h2>Decision lineage</h2>
          </div>
          <Badge tone={verification.status === "FAILED" ? "danger" : "good"}>
            <CheckCircle2 size={13} />
            {verification.status === "FAILED" ? "Chain failure" : "Hash chain verified"}
          </Badge>
        </div>
        {events.length ? (
          <div className="audit-list">
            {events.map((event, index) => (
              <div
                className={`audit-row ${event.id === highlightedEventId ? "audit-row-highlighted" : ""}`}
                id={`audit-${event.id}`}
                key={event.id}
              >
                <div className="chain-rail">
                  <span>
                    <Fingerprint />
                  </span>
                  {index < events.length - 1 ? <i /> : null}
                </div>
                <div className="audit-copy">
                  <div>
                    <Badge tone={event.actorType === "MODEL" ? "info" : "neutral"}>
                      {event.actorType}
                    </Badge>
                    <span>{date(event.occurredAt)}</span>
                  </div>
                  <h3>{event.action.replaceAll("_", " ").toLowerCase()}</h3>
                  <p>
                    {event.entityType} · {event.entityId}
                  </p>
                  <code>
                    <Link2 size={12} />
                    {event.eventHash}
                  </code>
                  <details>
                    <summary>Recorded metadata</summary>
                    <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-audit">
            <Fingerprint />
            <h2>The ledger is ready</h2>
            <p>
              Run a decision comparison, generate a recommendation, or record human review to create
              the first cryptographically linked event.
            </p>
          </div>
        )}
      </article>
    </>
  );
}
