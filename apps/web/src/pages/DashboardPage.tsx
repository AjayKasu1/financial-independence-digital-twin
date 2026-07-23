import {
  ArrowRight,
  Database,
  Landmark,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardResponse } from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { currency, date, percent } from "../lib/format";

export function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api
      .dashboard()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };
  useEffect(() => {
    void api
      .dashboard()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, []);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Loading advisor intelligence…" />;
  const household = data.households[0];

  return (
    <>
      <section className="hero-row">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Wednesday · July 22</span>
            <span className="operating-status">
              <i /> Workspace current
            </span>
          </div>
          <h1>Good afternoon, Elena.</h1>
          <p>
            Three decision moments need attention. The household twin has already assembled the
            relevant evidence.
          </p>
        </div>
        <div className="trust-stamp">
          <ShieldCheck />
          <div>
            <span className="trust-label">Governance status</span>
            <strong>Evidence controls active</strong>
            <span>Human review required for every recommendation</span>
          </div>
        </div>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="Households in focus"
          value={String(data.summary.households)}
          detail="Synthetic demonstration workspace"
          icon={<Users size={17} />}
          signal="Focused"
        />
        <MetricCard
          label="Assets modeled"
          value={currency.format(data.summary.assetsTracked)}
          detail="Across liquid accounts"
          tone="positive"
          icon={<Landmark size={17} />}
          signal="Modeled"
        />
        <MetricCard
          label="Open decision events"
          value={String(data.summary.openOpportunities)}
          detail={`${data.events.filter((event) => event.severity === "HIGH").length} high-priority`}
          tone="warning"
          icon={<Radar size={17} />}
          signal="Review"
        />
        <MetricCard
          label="Public data feeds"
          value={`${data.liveData.length} live`}
          detail="Treasury · BLS · FHFA"
          icon={<Database size={17} />}
          signal="Current"
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Decision queue</span>
              <h2>What changed</h2>
            </div>
            <div className="panel-heading-actions">
              <span className="quiet-status">
                <i /> Continuously monitored
              </span>
              <Badge tone="warn">{data.events.length} signals</Badge>
            </div>
          </div>
          <div className="event-list">
            {data.events.map((event) => (
              <div className="event-row" key={event.id}>
                <div className={`event-icon severity-${event.severity.toLowerCase()}`}>
                  <Sparkles size={17} />
                </div>
                <div className="event-copy">
                  <div>
                    <strong>{event.title}</strong>
                    <Badge tone={event.severity === "HIGH" ? "danger" : "warn"}>
                      {event.severity}
                    </Badge>
                  </div>
                  <p>{event.description}</p>
                  <span>{date(event.occurredAt)} · Source-linked event</span>
                </div>
                <Link
                  className="round-link"
                  to={`/households/${event.householdId}/compare?event=${encodeURIComponent(event.id)}`}
                  aria-label={`Review ${event.title}`}
                >
                  <ArrowRight size={18} />
                </Link>
              </div>
            ))}
          </div>
        </article>
        <article className="panel household-focus">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Household in focus</span>
              <h2>{household?.name ?? "Demo household"}</h2>
            </div>
            <Badge tone="good">Twin current</Badge>
          </div>
          {household ? (
            <>
              <div
                className="probability-ring"
                style={
                  { "--progress": `${household.fiProbability * 360}deg` } as React.CSSProperties
                }
              >
                <div>
                  <strong>{percent.format(household.fiProbability)}</strong>
                  <span>modeled FI success</span>
                </div>
              </div>
              <dl className="compact-stats">
                <div>
                  <dt>Investable assets</dt>
                  <dd>{currency.format(household.investableAssets)}</dd>
                </div>
                <div>
                  <dt>FI target</dt>
                  <dd>{currency.format(household.fiTarget)}</dd>
                </div>
                <div>
                  <dt>Open risks</dt>
                  <dd>{household.highRiskEvents}</dd>
                </div>
              </dl>
              <Link className="button primary full" to={`/households/${household.id}`}>
                Open household twin
                <ArrowRight size={16} />
              </Link>
            </>
          ) : null}
        </article>
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Evidence network</span>
              <h2>Live planning context</h2>
            </div>
            <span className="as-of">
              <Database size={15} />
              Retrieved with provenance
            </span>
          </div>
          <div className="feed-grid">
            {data.liveData.map((item) => (
              <div className="feed-card" key={item.seriesId}>
                <div>
                  <span className="source-mark">
                    {item.source
                      .split(" ")
                      .map((word) => word[0])
                      .join("")
                      .slice(0, 3)}
                  </span>
                  <Badge tone={item.stale ? "warn" : "good"}>
                    {item.stale ? "Review age" : "Current"}
                  </Badge>
                </div>
                <strong>
                  {item.unit === "rate" ? percent.format(item.value) : item.value.toFixed(1)}
                </strong>
                <p>{item.label}</p>
                <span>Observed {date(item.observationDate)}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel insight-panel">
          <TrendingUp size={22} />
          <span className="eyebrow">Advisor insight</span>
          <h2>Decision quality, not product selection</h2>
          <p>
            The current rental question changes liquidity, workload, diversification, taxes, and
            advisor revenue. Compare all five before recommending.
          </p>
          <Link to={`/households/${household?.id ?? "household-patel-demo"}/compare`}>
            Open decision lab <ArrowRight size={15} />
          </Link>
        </article>
      </section>
    </>
  );
}
