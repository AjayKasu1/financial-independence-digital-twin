import { Activity, ExternalLink, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { LiveDataResponse, SourceConnectorStatus } from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { date } from "../lib/format";

function connectorTone(
  status: SourceConnectorStatus["status"]
): "good" | "warn" | "danger" | "neutral" {
  if (status === "LIVE" || status === "CACHED") return "good";
  if (status === "UNAVAILABLE") return "danger";
  return "neutral";
}

export function DataConnectorsPage() {
  const [data, setData] = useState<LiveDataResponse | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = (force = false) => {
    setError("");
    setRefreshing(force);
    void api
      .liveData(force)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    void api
      .liveData()
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, []);

  if (error && !data) return <ErrorState message={error} retry={() => load()} />;
  if (!data) return <LoadingState label="Checking source connectors…" />;

  const available = data.connectors.filter(
    (connector) => connector.status === "LIVE" || connector.status === "CACHED"
  ).length;
  const unavailable = data.connectors.filter(
    (connector) => connector.status === "UNAVAILABLE"
  ).length;

  return (
    <>
      <section className="hero-row compact">
        <div>
          <span className="eyebrow coral">External data operations</span>
          <h1>Data connectors</h1>
          <p>
            Monitor the public sources that establish rates, inflation, housing context, and filing
            connectivity for the planning workspace.
          </p>
        </div>
        <button className="button secondary" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={refreshing ? "spin" : ""} size={16} />
          {refreshing ? "Refreshing…" : "Refresh sources"}
        </button>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Configured connectors"
          value={String(data.connectors.length)}
          detail="Keyless government sources"
        />
        <MetricCard
          label="Available"
          value={String(available)}
          detail="Live or safely cached"
          tone="positive"
        />
        <MetricCard
          label="Observations admitted"
          value={String(data.observations.length)}
          detail="With dates and provenance"
        />
        <MetricCard
          label="Unavailable"
          value={String(unavailable)}
          detail={unavailable ? "Fallback rules active" : "No connector failures"}
          tone={unavailable ? "warning" : "positive"}
        />
      </section>

      {error ? <div className="inline-warning">Refresh warning: {error}</div> : null}

      <article className="panel connector-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Connector registry</span>
            <h2>Source health and policy</h2>
          </div>
          <Badge tone="good">
            <ShieldCheck size={13} />
            Provenance enforced
          </Badge>
        </div>

        <div className="connector-list">
          {data.connectors.map((connector) => (
            <div className="connector-row" key={connector.source}>
              <span className="connector-icon">
                {connector.status === "LIVE" ? <Activity /> : <ServerCog />}
              </span>
              <div className="connector-copy">
                <div>
                  <strong>{connector.source}</strong>
                  <Badge tone={connectorTone(connector.status)}>
                    {connector.status.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p>{connector.detail}</p>
                <span>Checked {date(connector.checkedAt)}</span>
              </div>
              <a
                className="connector-source"
                href={connector.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${connector.source} source`}
              >
                Source
                <ExternalLink size={15} />
              </a>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}
