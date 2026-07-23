import {
  ArrowRight,
  CircleDollarSign,
  Clock3,
  FileWarning,
  Radar,
  Route,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdvisorOpportunity, OpportunityRadarResponse } from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { currency, date } from "../lib/format";

export function OpportunityRadarPage() {
  const [data, setData] = useState<OpportunityRadarResponse | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    void api
      .opportunities()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };

  useEffect(() => {
    void api
      .opportunities()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Testing the advisor opportunity surface…" />;

  const leading = data.opportunities[0];

  return (
    <>
      <section className="hero-row">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Continuous advice control plane</span>
            <span className="operating-status">
              <i /> Deterministic ranking live
            </span>
          </div>
          <h1>Advisor Opportunity Radar</h1>
          <p>
            Detect what needs advice, show what evidence is missing, and route the next governed
            action before the decision window closes.
          </p>
        </div>
        <div className="trust-stamp">
          <Radar />
          <div>
            <span className="trust-label">Methodology</span>
            <strong>Explainable priority, no model scoring</strong>
            <span>Deadline · capital · constitution · evidence · passport</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Action now"
          value={String(data.summary.actionNow)}
          detail="Priority score 75 or higher"
          tone="warning"
          icon={<Sparkles size={17} />}
          signal="Ranked"
        />
        <MetricCard
          label="Evidence blocked"
          value={String(data.summary.evidenceBlocked)}
          detail="Source confirmation required"
          icon={<FileWarning size={17} />}
          signal="Resolve"
        />
        <MetricCard
          label="Largest capital surface"
          value={currency.format(data.summary.decisionCapital)}
          detail="Largest modeled exposure in queue"
          tone="positive"
          icon={<CircleDollarSign size={17} />}
          signal="Modeled"
        />
        <MetricCard
          label="Passports at risk"
          value={String(data.summary.passportsAtRisk)}
          detail="Invalidated or review required"
          icon={<ShieldCheck size={17} />}
          signal="Controlled"
        />
      </section>

      {leading ? (
        <section className="radar-lead-grid">
          <article className="panel radar-lead">
            <div className="radar-lead-score" aria-label={`Priority score ${leading.score}`}>
              <span>{leading.score}</span>
              <small>priority</small>
            </div>
            <div className="radar-lead-copy">
              <div className="radar-badge-row">
                <Badge tone={priorityTone(leading)}>{leading.priority}</Badge>
                <Badge tone={readinessTone(leading)}>{leading.evidence.readiness} evidence</Badge>
                <span>{categoryLabel(leading.category)}</span>
              </div>
              <h2>{leading.title}</h2>
              <p>{leading.summary}</p>
              <div className="radar-reason-row">
                {leading.reasons.slice(0, 3).map((reason) => (
                  <span key={reason}>
                    <i />
                    {reason}
                  </span>
                ))}
              </div>
            </div>
            <div className="radar-lead-action">
              {leading.deadline ? (
                <span>
                  <Clock3 size={15} />
                  Deadline {date(leading.deadline)}
                </span>
              ) : (
                <span>
                  <Route size={15} />
                  Advisor-sequenced
                </span>
              )}
              <Link className="button primary" to={leading.action.to}>
                {leading.action.label}
                <ArrowRight size={16} />
              </Link>
            </div>
          </article>

          <article className="panel radar-control-card">
            <span className="eyebrow">Control state</span>
            <h2>Why this is actionable</h2>
            <dl>
              <div>
                <dt>Evidence</dt>
                <dd>{leading.evidence.readiness}</dd>
              </div>
              <div>
                <dt>Constitution</dt>
                <dd>{leading.constitution.status}</dd>
              </div>
              <div>
                <dt>Passport</dt>
                <dd>{leading.passport.status.replaceAll("_", " ")}</dd>
              </div>
            </dl>
            <p>{leading.passport.detail}</p>
            <small>
              The score controls queue order only. It never approves a recommendation or execution.
            </small>
          </article>
        </section>
      ) : null}

      <section className="panel radar-queue">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Ranked decision queue</span>
            <h2>Opportunities requiring advisor judgment</h2>
          </div>
          <Badge tone="info">{data.opportunities.length} continuously tested</Badge>
        </div>
        <div className="radar-opportunity-list">
          {data.opportunities.map((opportunity, index) => (
            <article className="radar-opportunity" key={opportunity.id}>
              <div className="radar-rank">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{opportunity.score}</strong>
              </div>
              <div className="radar-opportunity-main">
                <div>
                  <Badge tone={priorityTone(opportunity)}>{opportunity.priority}</Badge>
                  <span>{categoryLabel(opportunity.category)}</span>
                </div>
                <h3>{opportunity.title}</h3>
                <p>{opportunity.summary}</p>
                <div className="radar-control-chips">
                  <span data-state={opportunity.evidence.readiness.toLowerCase()}>
                    Evidence · {opportunity.evidence.readiness}
                  </span>
                  <span data-state={opportunity.constitution.status.toLowerCase()}>
                    Constitution · {opportunity.constitution.status}
                  </span>
                  <span>Passport · {opportunity.passport.status.replaceAll("_", " ")}</span>
                </div>
              </div>
              <div className="radar-opportunity-value">
                {opportunity.decisionValue ? (
                  <>
                    <strong>{currency.format(opportunity.decisionValue.amount)}</strong>
                    <span>{opportunity.decisionValue.label}</span>
                  </>
                ) : (
                  <>
                    <strong>Source gap</strong>
                    <span>Resolve before promotion</span>
                  </>
                )}
              </div>
              <Link
                className="round-link"
                to={opportunity.action.to}
                aria-label={opportunity.action.label}
              >
                <ArrowRight size={18} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="radar-method-grid">
        <article className="panel">
          <span className="eyebrow">Scoring contract</span>
          <h2>Every priority is reconstructable</h2>
          <p>
            The server ranks materiality and urgency with versioned rules. The household
            constitution and admitted evidence stay visible beside every score.
          </p>
        </article>
        <article className="panel radar-sequence">
          <span>Detect</span>
          <ArrowRight size={15} />
          <span>Reconcile evidence</span>
          <ArrowRight size={15} />
          <span>Compile strategy</span>
          <ArrowRight size={15} />
          <span>Govern</span>
        </article>
      </section>
    </>
  );
}

function priorityTone(opportunity: AdvisorOpportunity): "danger" | "warn" | "info" | "neutral" {
  if (opportunity.priority === "CRITICAL") return "danger";
  if (opportunity.priority === "HIGH") return "warn";
  if (opportunity.priority === "MEDIUM") return "info";
  return "neutral";
}

function readinessTone(opportunity: AdvisorOpportunity): "good" | "warn" | "danger" {
  if (opportunity.evidence.readiness === "READY") return "good";
  if (opportunity.evidence.readiness === "PARTIAL") return "warn";
  return "danger";
}

function categoryLabel(category: AdvisorOpportunity["category"]): string {
  return category
    .toLowerCase()
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
