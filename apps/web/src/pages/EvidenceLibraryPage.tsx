import {
  BookOpenCheck,
  Calculator,
  ExternalLink,
  FileCheck2,
  Globe2,
  ShieldCheck
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { HouseholdResponse, LiveDataResponse } from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { date, percent } from "../lib/format";

const demoHouseholdId = "household-patel-demo";
const nerdWalletResilienceEvidence = {
  score: 63.1,
  observedAt: "2026-07-09T00:00:00.000Z",
  publishedAt: "2026-07-21T00:00:00.000Z",
  sampleSize: 2_089,
  sourceUrl:
    "https://investors.nerdwallet.com/news-releases/news-release-details/nerdwallets-july-2026-financial-resilience-index-hits-new-high"
} as const;

interface EvidenceLibraryData {
  readonly household: HouseholdResponse;
  readonly live: LiveDataResponse;
}

export function EvidenceLibraryPage() {
  const [data, setData] = useState<EvidenceLibraryData | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    void Promise.all([api.household(demoHouseholdId), api.liveData()])
      .then(([household, live]) => setData({ household, live }))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };

  useEffect(() => {
    void Promise.all([api.household(demoHouseholdId), api.liveData()])
      .then(([household, live]) => setData({ household, live }))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, []);

  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Assembling the evidence catalog…" />;

  const staleRecords = data.live.observations.filter((observation) => observation.stale).length;
  const calculationRecords = data.household.latestScenarios.length;

  return (
    <>
      <section className="hero-row compact">
        <div>
          <span className="eyebrow coral">Governed knowledge</span>
          <h1>Evidence library</h1>
          <p>
            Inspect every source available to recommendations before it becomes part of an advisor
            decision or client-facing explanation.
          </p>
        </div>
        <div className="hero-side-stack">
          <div className="trust-stamp">
            <ShieldCheck />
            <div>
              <strong>Provenance required</strong>
              <span>Source, observation date, retrieval date, and freshness</span>
            </div>
          </div>
          <Link
            className="button primary full"
            to={`/households/${demoHouseholdId}/evidence-intake`}
          >
            Admit source evidence
          </Link>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Public observations"
          value={String(data.live.observations.length + 1)}
          detail="Government + population context"
          tone="positive"
        />
        <MetricCard label="Client snapshots" value="1" detail="Synthetic household only" />
        <MetricCard
          label="Calculation records"
          value={String(calculationRecords)}
          detail="Latest deterministic scenarios"
        />
        <MetricCard
          label="Freshness exceptions"
          value={String(staleRecords)}
          detail={staleRecords ? "Require advisor review" : "No stale records"}
          tone={staleRecords ? "warning" : "positive"}
        />
      </section>

      <section className="evidence-library-grid">
        <article className="panel evidence-catalog span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Source register</span>
              <h2>Available evidence</h2>
            </div>
            <Badge tone="good">
              <BookOpenCheck size={13} />
              Traceable
            </Badge>
          </div>

          <div className="evidence-record-list">
            <div className="evidence-record">
              <span className="evidence-record-icon client-evidence">
                <FileCheck2 />
              </span>
              <div>
                <div className="record-title-row">
                  <strong>{data.household.household.name} household snapshot</strong>
                  <Badge tone="info">Client fact</Badge>
                </div>
                <p>Canonical synthetic facts used by every scenario in this demonstration.</p>
                <span>As of {date(data.household.household.asOf)} · Synthetic data boundary</span>
              </div>
            </div>

            {data.household.latestScenarios.map((scenario) => (
              <div className="evidence-record" key={scenario.id}>
                <span className="evidence-record-icon calculation-evidence">
                  <Calculator />
                </span>
                <div>
                  <div className="record-title-row">
                    <strong>{scenario.label}</strong>
                    <Badge tone="neutral">Calculation</Badge>
                  </div>
                  <p>
                    Deterministic scenario output with a{" "}
                    {percent.format(scenario.successProbability)}
                    modeled success rate under its recorded assumptions.
                  </p>
                  <span>Engine-produced · Scenario ID {scenario.id}</span>
                </div>
              </div>
            ))}

            {data.live.observations.map((observation) => (
              <div className="evidence-record" key={observation.seriesId}>
                <span className="evidence-record-icon public-evidence">
                  <Globe2 />
                </span>
                <div>
                  <div className="record-title-row">
                    <strong>{observation.label}</strong>
                    <Badge tone={observation.stale ? "warn" : "good"}>
                      {observation.stale ? "Review age" : "Current"}
                    </Badge>
                  </div>
                  <p>
                    {observation.value.toLocaleString()} {observation.unit} · Series{" "}
                    {observation.seriesId}
                  </p>
                  <span>
                    Observed {date(observation.observationDate)} · Retrieved{" "}
                    {date(observation.retrievedAt)}
                  </span>
                </div>
                <a
                  className="record-source-link"
                  href={observation.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open source for ${observation.label}`}
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            ))}

            <div className="evidence-record">
              <span className="evidence-record-icon public-evidence">
                <Globe2 />
              </span>
              <div>
                <div className="record-title-row">
                  <strong>NerdWallet Consumer Financial Resilience Index</strong>
                  <Badge tone="info">Population context only</Badge>
                </div>
                <p>
                  July 2026 index {nerdWalletResilienceEvidence.score} · Survey sample{" "}
                  {nerdWalletResilienceEvidence.sampleSize.toLocaleString()} U.S. adults. This
                  evidence is never an input to the Household Optionality Score.
                </p>
                <span>
                  Observed {date(nerdWalletResilienceEvidence.observedAt)} · Published{" "}
                  {date(nerdWalletResilienceEvidence.publishedAt)} · Official NerdWallet release
                </span>
              </div>
              <a
                className="record-source-link"
                href={nerdWalletResilienceEvidence.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open NerdWallet Financial Resilience Index source"
              >
                <ExternalLink size={16} />
              </a>
            </div>
          </div>
        </article>

        <article className="panel evidence-policy-panel">
          <span className="eyebrow">Admission controls</span>
          <h2>What can be cited</h2>
          <ul className="policy-check-list">
            <li>
              <FileCheck2 /> Client facts must come from the versioned household snapshot.
            </li>
            <li>
              <Calculator /> Numeric claims must reference deterministic calculation paths.
            </li>
            <li>
              <Globe2 /> External facts require a live URL and a usable observation date.
            </li>
            <li>
              <ShieldCheck /> Stale or missing evidence blocks recommendation approval.
            </li>
          </ul>
          <div className="policy-note">
            <strong>AI is not an evidence source.</strong>
            <span>It may explain admitted evidence but cannot create facts or calculations.</span>
          </div>
        </article>
      </section>
    </>
  );
}
