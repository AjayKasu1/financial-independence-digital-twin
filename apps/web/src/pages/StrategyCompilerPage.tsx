import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  FileWarning,
  GitBranch,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Route,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  CompiledStrategyCandidate,
  EvidenceDocumentsResponse,
  OpportunityRadarResponse,
  StrategyCompilation,
  StrategyConstitutionCheck
} from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { currency, date, fullCurrency, percent } from "../lib/format";

const demoHouseholdId = "household-patel-demo";

interface CompilerSourceData {
  readonly radar: OpportunityRadarResponse;
  readonly evidence: EvidenceDocumentsResponse;
}

export function StrategyCompilerPage() {
  const { householdId = demoHouseholdId } = useParams();
  const [search, setSearch] = useSearchParams();
  const opportunityId = search.get("opportunity");
  const compilationId = search.get("compilation");
  const [source, setSource] = useState<CompilerSourceData | null>(null);
  const [compilation, setCompilation] = useState<StrategyCompilation | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    void Promise.all([
      api.householdOpportunities(householdId),
      api.evidenceDocuments(householdId),
      compilationId ? api.strategyCompilation(compilationId) : Promise.resolve(null)
    ])
      .then(([radar, evidence, existing]) => {
        setSource({ radar, evidence });
        if (existing) {
          setCompilation(existing);
          setSelectedCandidateId(
            existing.frontierCandidateIds[0] ??
              existing.candidates.find((candidate) => candidate.status === "ELIGIBLE")?.id ??
              null
          );
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };

  useEffect(() => {
    void Promise.all([
      api.householdOpportunities(householdId),
      api.evidenceDocuments(householdId),
      compilationId ? api.strategyCompilation(compilationId) : Promise.resolve(null)
    ])
      .then(([radar, evidence, existing]) => {
        setSource({ radar, evidence });
        if (existing) {
          setCompilation(existing);
          setSelectedCandidateId(
            existing.frontierCandidateIds[0] ??
              existing.candidates.find((candidate) => candidate.status === "ELIGIBLE")?.id ??
              null
          );
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [compilationId, householdId]);

  const opportunity = useMemo(
    () =>
      source?.radar.opportunities.find((candidate) => candidate.id === opportunityId) ??
      source?.radar.opportunities.find(
        (candidate) => candidate.category === "EQUITY_COMPENSATION"
      ) ??
      null,
    [opportunityId, source]
  );
  const selectedCandidate =
    compilation?.candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  const compile = async () => {
    if (!opportunity) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.compileStrategies(householdId, {
        opportunityId: opportunity.id
      });
      setCompilation(result);
      const initialSelection =
        result.frontierCandidateIds[0] ??
        result.candidates.find((candidate) => candidate.status === "ELIGIBLE")?.id ??
        null;
      setSelectedCandidateId(initialSelection);
      const next = new URLSearchParams(search);
      next.set("opportunity", opportunity.id);
      next.set("compilation", result.id);
      setSearch(next, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (error && !source) return <ErrorState message={error} retry={load} />;
  if (!source) return <LoadingState label="Loading the strategy compilation controls…" />;
  if (!opportunity) {
    return (
      <ErrorState
        message="No RSU opportunity is currently available for Strategy Compiler v1."
        retry={load}
      />
    );
  }

  const evidenceReady = opportunity.evidence.readiness === "READY";
  const eligible = compilation?.candidates.filter((candidate) => candidate.status === "ELIGIBLE");

  return (
    <>
      <section className="hero-row">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Strategy Compiler · RSU control surface</span>
            <span className="operating-status">
              <i /> Versioned deterministic templates
            </span>
          </div>
          <h1>Compile choices before drafting advice</h1>
          <p>
            Convert an evidence-ready opportunity into constitution-tested strategies, expose
            conflicts and tradeoffs, then promote the locked bundle into governed comparison.
          </p>
        </div>
        <div className="trust-stamp">
          <GitBranch />
          <div>
            <span className="trust-label">Compiler boundary</span>
            <strong>No AI strategy generation or winner selection</strong>
            <span>Enumerate · calculate · reject · compare · preserve human choice</span>
          </div>
        </div>
      </section>

      <section className="compiler-source-strip">
        <div>
          <span className="compiler-step">01</span>
          <div>
            <span>Evidence state</span>
            <strong>{opportunity.evidence.readiness}</strong>
          </div>
        </div>
        <ArrowRight size={15} />
        <div>
          <span className="compiler-step">02</span>
          <div>
            <span>Opportunity</span>
            <strong>{opportunity.title}</strong>
          </div>
        </div>
        <ArrowRight size={15} />
        <div>
          <span className="compiler-step">03</span>
          <div>
            <span>Strategy set</span>
            <strong>{compilation ? "Compiled & locked" : "Awaiting compilation"}</strong>
          </div>
        </div>
        <ArrowRight size={15} />
        <div>
          <span className="compiler-step">04</span>
          <div>
            <span>Governed review</span>
            <strong>{compilation ? "Ready to promote" : "Not created"}</strong>
          </div>
        </div>
      </section>

      {!evidenceReady ? (
        <section className="panel compiler-blocked">
          <span className="compiler-lock">
            <LockKeyhole size={25} />
          </span>
          <div>
            <span className="eyebrow">Compilation gate enforced</span>
            <h2>Advisor-confirmed award evidence is required</h2>
            <p>
              The Radar detected this opportunity, but Strategy Compiler cannot create executable
              alternatives from an unconfirmed vest amount, date, or withholding assumption.
            </p>
            <div className="compiler-missing-list">
              {opportunity.evidence.missingSources.map((sourceLabel) => (
                <span key={sourceLabel}>
                  <FileWarning size={14} />
                  {sourceLabel}
                </span>
              ))}
            </div>
          </div>
          <Link
            className="button primary"
            to={`/households/${householdId}/evidence-intake?document=RSU_STATEMENT`}
          >
            Admit required evidence <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}

      {evidenceReady && !compilation ? (
        <section className="compiler-ready-grid">
          <article className="panel compiler-opportunity-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Evidence-ready opportunity</span>
                <h2>{opportunity.title}</h2>
              </div>
              <Badge tone="good">READY</Badge>
            </div>
            <p>{opportunity.summary}</p>
            <div className="compiler-source-facts">
              {opportunity.evidence.confirmedSources.map((sourceLabel) => (
                <span key={sourceLabel}>
                  <CheckCircle2 size={14} /> {sourceLabel}
                </span>
              ))}
            </div>
            <dl>
              <div>
                <dt>Radar priority</dt>
                <dd>{opportunity.score}/100</dd>
              </div>
              <div>
                <dt>Gross decision value</dt>
                <dd>{currency.format(opportunity.decisionValue?.amount ?? 0)}</dd>
              </div>
              <div>
                <dt>Constitution state</dt>
                <dd>{opportunity.constitution.status}</dd>
              </div>
              <div>
                <dt>Decision deadline</dt>
                <dd>{opportunity.deadline ? date(opportunity.deadline) : "Open"}</dd>
              </div>
            </dl>
          </article>
          <article className="panel compiler-manifest">
            <span className="eyebrow">Compilation manifest</span>
            <h2>Five bounded strategies, one locked decision surface</h2>
            <ul>
              <li>
                <Layers3 /> Enumerate five RSU action templates.
              </li>
              <li>
                <Scale /> Run each through the deterministic FI engine.
              </li>
              <li>
                <ShieldCheck /> Reject signed constitution breaches.
              </li>
              <li>
                <CircleDollarSign /> Calculate advisor-revenue differences.
              </li>
              <li>
                <Route /> Identify the non-dominated Pareto frontier.
              </li>
            </ul>
            {error ? <p className="compiler-inline-error">{error}</p> : null}
            <button className="button primary full" disabled={busy} onClick={() => void compile()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {busy ? "Compiling deterministic strategies…" : "Compile strategy set"}
            </button>
          </article>
        </section>
      ) : null}

      {compilation ? (
        <>
          <section className="metric-grid">
            <MetricCard
              label="Gross vest"
              value={currency.format(compilation.grossDecisionValue)}
              detail="Advisor-confirmed award value"
              icon={<CircleDollarSign size={17} />}
              signal="Evidence"
            />
            <MetricCard
              label="Deployable capital"
              value={currency.format(compilation.decisionCapital)}
              detail={`${percent.format(compilation.modeledWithholdingRate)} modeled withholding`}
              tone="positive"
              icon={<Layers3 size={17} />}
              signal="Shared"
            />
            <MetricCard
              label="Eligible strategies"
              value={String(eligible?.length ?? 0)}
              detail={`${compilation.rejectedCandidateIds.length} constitution-rejected`}
              icon={<ShieldCheck size={17} />}
              signal="Tested"
            />
            <MetricCard
              label="Pareto frontier"
              value={String(compilation.frontierCandidateIds.length)}
              detail="Non-dominated eligible alternatives"
              icon={<GitBranch size={17} />}
              signal="Explainable"
            />
          </section>

          <section className="compiler-workspace">
            <article className="panel compiler-candidate-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Compiled strategy set</span>
                  <h2>Choose a candidate to inspect</h2>
                </div>
                <Badge tone="info">{compilation.compilerVersion}</Badge>
              </div>
              <div className="compiler-candidate-list">
                {compilation.candidates.map((candidate, index) => (
                  <button
                    className={`${selectedCandidateId === candidate.id ? "active" : ""} ${candidate.status === "REJECTED" ? "rejected" : ""}`}
                    key={candidate.id}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    <span className="candidate-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="candidate-main">
                      <span>
                        <strong>{candidate.label}</strong>
                        <Badge tone={candidateStatusTone(candidate)}>
                          {candidate.dominance.replaceAll("_", " ")}
                        </Badge>
                      </span>
                      <small>{candidate.thesis}</small>
                      <AllocationBar candidate={candidate} capital={compilation.decisionCapital} />
                    </span>
                    <span className="candidate-outcome">
                      <strong>{percent.format(candidate.scenario.successProbability)}</strong>
                      <small>FI success</small>
                    </span>
                    {selectedCandidateId === candidate.id ? (
                      <span className="candidate-selected">
                        <Check size={14} />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </article>

            {selectedCandidate ? (
              <CandidateInspection candidate={selectedCandidate} compilation={compilation} />
            ) : null}
          </section>

          <section className="panel compiler-promotion">
            <div>
              <span className="compiler-promotion-icon">
                <Route size={20} />
              </span>
              <div>
                <span className="eyebrow">Promote to governed comparison</span>
                <h2>
                  {selectedCandidate?.status === "ELIGIBLE"
                    ? `Focus review on “${selectedCandidate.label}”`
                    : "The selected candidate is constitution-rejected"}
                </h2>
                <p>
                  All eligible strategies travel together. The focused candidate is not a
                  recommendation; the Decision Lab will rerun the locked bundle and preserve every
                  alternative.
                </p>
              </div>
            </div>
            {selectedCandidate?.status === "ELIGIBLE" ? (
              <Link
                className="button primary"
                to={promotionPath(householdId, compilation, selectedCandidate.id)}
              >
                Promote locked bundle <ArrowRight size={15} />
              </Link>
            ) : (
              <button className="button primary" disabled>
                Constitution gate blocked
              </button>
            )}
          </section>

          <p className="compiler-methodology-note">
            <ShieldCheck size={14} />
            {compilation.methodology}
          </p>
        </>
      ) : null}
    </>
  );
}

function CandidateInspection({
  candidate,
  compilation
}: {
  candidate: CompiledStrategyCandidate;
  compilation: StrategyCompilation;
}) {
  const concentration = candidate.constitutionChecks.find(
    (check) => check.id === "employer-stock-ceiling"
  );
  return (
    <aside className="panel compiler-inspection">
      <div className="compiler-inspection-heading">
        <span className={candidate.status === "ELIGIBLE" ? "eligible" : "rejected"}>
          {candidate.status === "ELIGIBLE" ? <ShieldCheck /> : <ShieldAlert />}
        </span>
        <div>
          <Badge tone={candidateStatusTone(candidate)}>{candidate.status}</Badge>
          <h2>{candidate.label}</h2>
          <p>{candidate.thesis}</p>
        </div>
      </div>

      <section>
        <span className="eyebrow">Capital allocation</span>
        <dl className="compiler-allocation-list">
          <Allocation label="Diversified portfolio" value={candidate.allocations.portfolio} />
          <Allocation label="Debt reduction" value={candidate.allocations.debtPaydown} />
          <Allocation label="Liquidity reserve" value={candidate.allocations.cashReserve} />
          <Allocation
            label="Employer stock retained"
            value={candidate.allocations.retainedEmployerStock}
          />
        </dl>
        <small>Total: {fullCurrency.format(compilation.decisionCapital)}</small>
      </section>

      <section>
        <span className="eyebrow">Constitution tests</span>
        <div className="compiler-check-list">
          {candidate.constitutionChecks.map((check) => (
            <ConstitutionCheck key={check.id} check={check} />
          ))}
        </div>
      </section>

      <section className="compiler-outcome-grid">
        <div>
          <span>Modeled FI success</span>
          <strong>{percent.format(candidate.scenario.successProbability)}</strong>
        </div>
        <div>
          <span>FI age</span>
          <strong>{candidate.scenario.fiAge ?? "—"}</strong>
        </div>
        <div>
          <span>Employer stock</span>
          <strong>{concentration ? percent.format(concentration.actual) : "—"}</strong>
        </div>
        <div>
          <span>Advisor revenue Δ</span>
          <strong className={candidate.advisorEconomics.direction.toLowerCase()}>
            {signedCurrency(candidate.advisorEconomics.annualRevenueDifference)}
          </strong>
        </div>
      </section>

      <section>
        <span className="eyebrow">Tradeoffs</span>
        <ul className="compiler-tradeoff-list">
          {candidate.tradeoffs.map((tradeoff) => (
            <li key={tradeoff}>{tradeoff}</li>
          ))}
        </ul>
      </section>

      <section>
        <span className="eyebrow">Execution evidence</span>
        <div className="compiler-evidence-list">
          {candidate.evidenceRequirements.map((requirement) => (
            <span key={requirement.label}>
              {requirement.status === "CONFIRMED" ? (
                <CheckCircle2 size={14} />
              ) : (
                <FileWarning size={14} />
              )}
              {requirement.label}
              <Badge tone={requirement.status === "CONFIRMED" ? "good" : "warn"}>
                {requirement.status}
              </Badge>
            </span>
          ))}
        </div>
      </section>
    </aside>
  );
}

function AllocationBar({
  candidate,
  capital
}: {
  candidate: CompiledStrategyCandidate;
  capital: number;
}) {
  const values = [
    ["portfolio", candidate.allocations.portfolio],
    ["debt", candidate.allocations.debtPaydown],
    ["cash", candidate.allocations.cashReserve],
    ["retained", candidate.allocations.retainedEmployerStock]
  ] as const;
  return (
    <span className="compiler-allocation-bar" aria-label="Capital allocation">
      {values.map(([key, value]) =>
        value > 0 ? (
          <i
            className={`allocation-${key}`}
            key={key}
            style={{ width: `${(value / capital) * 100}%` }}
          />
        ) : null
      )}
    </span>
  );
}

function ConstitutionCheck({ check }: { check: StrategyConstitutionCheck }) {
  return (
    <div className={check.passed ? "passed" : "failed"}>
      {check.passed ? <CheckCircle2 size={14} /> : <X size={14} />}
      <span>
        <strong>{check.label}</strong>
        <small>
          {formatCheck(check.actual, check.unit)} {check.operator === "LTE" ? "≤" : "≥"}{" "}
          {formatCheck(check.threshold, check.unit)}
        </small>
      </span>
    </div>
  );
}

function Allocation({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{fullCurrency.format(value)}</dd>
    </div>
  );
}

function candidateStatusTone(
  candidate: CompiledStrategyCandidate
): "good" | "danger" | "info" | "neutral" {
  if (candidate.status === "REJECTED") return "danger";
  if (candidate.dominance === "PARETO_FRONTIER") return "good";
  if (candidate.dominance === "DOMINATED") return "info";
  return "neutral";
}

function formatCheck(value: number, unit: StrategyConstitutionCheck["unit"]): string {
  if (unit === "CURRENCY") return currency.format(value);
  if (unit === "RATE") return percent.format(value);
  return value.toFixed(0);
}

function signedCurrency(value: number): string {
  if (Math.abs(value) < 1) return "$0";
  return `${value > 0 ? "+" : "−"}${fullCurrency.format(Math.abs(value))}`;
}

function promotionPath(
  householdId: string,
  compilation: StrategyCompilation,
  candidateId: string
): string {
  const search = new URLSearchParams({
    source: "compiler",
    compilation: compilation.id,
    candidate: candidateId
  });
  if (compilation.triggerEventId) search.set("event", compilation.triggerEventId);
  return `/households/${householdId}/compare?${search.toString()}`;
}
