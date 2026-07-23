import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileKey2,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  DecisionPassportResponse,
  DecisionPassportStatus,
  PassportConditionResult,
  ValidityCondition
} from "@fidt/contracts";
import { Badge, ErrorState, LoadingState } from "../components/Ui";
import { api } from "../lib/api";
import { currency, dateTime, fullCurrency, percent } from "../lib/format";

export function PassportPage() {
  const { householdId = "", passportId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DecisionPassportResponse | null>(null);
  const [error, setError] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [creatingExecution, setCreatingExecution] = useState(false);
  const load = useCallback(() => {
    setError("");
    void api
      .passport(passportId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [passportId]);
  useEffect(() => {
    void api
      .passport(passportId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [passportId]);
  const monitor = () => {
    setMonitoring(true);
    setError("");
    void api
      .monitorPassport(passportId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setMonitoring(false));
  };
  const createExecution = () => {
    setCreatingExecution(true);
    setError("");
    void api
      .createExecutionPlan(passportId)
      .then((plan) =>
        navigate(`/households/${householdId}/execution?plan=${encodeURIComponent(plan.id)}`)
      )
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setCreatingExecution(false));
  };
  if (error && !data) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Verifying signed Decision Passport…" />;
  const { passport, proof, state, verification, checks } = data;
  const latest = checks[0];
  return (
    <>
      <section className="hero-row compact passport-hero">
        <div>
          <Link className="back-link" to={`/households/${householdId}`}>
            <ArrowLeft size={15} />
            Household twin
          </Link>
          <span className="eyebrow coral">Live Fiduciary Decision Passport</span>
          <h1>Is this advice still valid?</h1>
          <p>
            A signed, continuously testable record of the facts, constraints, calculations,
            conflicts, and human approval behind this decision.
          </p>
        </div>
        <PassportStatus status={state.status} verified={verification.verified} />
      </section>

      <section className="passport-summary panel">
        <div>
          <span className="eyebrow">Approved recommendation</span>
          <h2>{passport.recommendedScenario.label}</h2>
          <p>
            Issued {dateTime(passport.issuedAt)} · Constitution v{passport.constitution.version} ·
            Run {passport.runId.slice(0, 8)}
          </p>
        </div>
        <div className="passport-metrics">
          <div>
            <span>Modeled FI success</span>
            <strong>{percent.format(passport.recommendedScenario.successProbability)}</strong>
          </div>
          <div>
            <span>FI age</span>
            <strong>{passport.recommendedScenario.fiAge ?? "Beyond horizon"}</strong>
          </div>
          <div>
            <span>Shared capital</span>
            <strong>{currency.format(passport.decisionCapital)}</strong>
          </div>
          <div>
            <span>1st-year advisor fee</span>
            <strong>
              {fullCurrency.format(passport.recommendedScenario.firstYearAdvisoryFee)}
            </strong>
          </div>
          {passport.resilience ? (
            <div className="passport-resilience-metric">
              <span>Optionality at approval</span>
              <strong>
                {passport.resilience.stressed.score} · {passport.resilience.stressed.band}
              </strong>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel passport-execution-handoff">
        <span className="passport-execution-icon">
          <ClipboardCheck />
        </span>
        <div>
          <span className="eyebrow">Execution & Outcome Ledger</span>
          <h2>
            {data.executionPlan
              ? `${Math.round(data.executionPlan.progress * 100)}% of controlled execution recorded`
              : "Turn approved advice into controlled implementation"}
          </h2>
          <p>
            Track owners, prerequisites, immutable receipts, realized outcomes, and automatic
            passport re-review without placing trades or moving money.
          </p>
        </div>
        {data.executionPlan ? (
          <Link
            className="button primary"
            to={`/households/${householdId}/execution?plan=${encodeURIComponent(data.executionPlan.id)}`}
          >
            Open execution ledger <ArrowRight size={15} />
          </Link>
        ) : (
          <button
            className="button primary"
            onClick={createExecution}
            disabled={creatingExecution || state.status !== "VALID" || !verification.verified}
          >
            {creatingExecution ? "Creating controls…" : "Create execution plan"}
            <ArrowRight size={15} />
          </button>
        )}
      </section>

      <section className="passport-layout">
        <article className="panel validity-panel">
          <header>
            <div>
              <span className="eyebrow">Validity envelope</span>
              <h2>{passport.validityEnvelope.length} executable conditions</h2>
            </div>
            <button className="button secondary" onClick={monitor} disabled={monitoring}>
              <RefreshCw size={15} className={monitoring ? "spin" : ""} />
              {monitoring ? "Checking…" : "Run live validity check"}
            </button>
          </header>
          <div className="condition-list">
            {passport.validityEnvelope.map((condition) => {
              const result = latest?.results.find((item) => item.conditionId === condition.id);
              return <ConditionRow key={condition.id} condition={condition} result={result} />;
            })}
          </div>
          {state.invalidationReasons.length ? (
            <div className="passport-invalidation">
              <XCircle />
              <div>
                <strong>Human review required before this advice can be reused</strong>
                {state.invalidationReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <aside className="passport-side">
          <article className="panel proof-card">
            <Fingerprint />
            <span className="eyebrow">Cryptographic proof</span>
            <h2>{verification.verified ? "Signature verified" : "Verification failed"}</h2>
            <dl>
              <div>
                <dt>Algorithm</dt>
                <dd>{proof.algorithm}</dd>
              </div>
              <div>
                <dt>Key</dt>
                <dd>{proof.keyId}</dd>
              </div>
              <div>
                <dt>Content hash</dt>
                <dd>
                  <code>{proof.contentHash.slice(0, 18)}…</code>
                </dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>
                  <code>{proof.signature.slice(0, 18)}…</code>
                </dd>
              </div>
            </dl>
            <small>Verified server-side at {dateTime(verification.verifiedAt)}</small>
          </article>
          <article className="panel constitution-proof">
            <ShieldCheck />
            <span className="eyebrow">Client Constitution</span>
            <h2>Version {passport.constitution.version}</h2>
            <p>{passport.constitution.preferences.values.join(" · ")}</p>
            <span>Approved by {passport.constitution.approvedBy}</span>
          </article>
          {passport.resilience ? (
            <article className="panel passport-resilience-proof">
              <ShieldCheck />
              <span className="eyebrow">Resilience proof</span>
              <h2>{passport.resilience.stressed.score}/100 optionality</h2>
              <p>
                {passport.resilience.stressed.metrics.creditFreeRunwayMonths.toFixed(1)} months
                credit-free runway · {passport.resilience.stressed.metrics.feasibleOptions} options
                preserved
              </p>
              <span>
                Method {passport.resilience.stressed.methodologyVersion} · Shock inputs signed with
                this passport
              </span>
            </article>
          ) : null}
          <article className="panel lineage-card">
            <FileKey2 />
            <span className="eyebrow">Proof bundle</span>
            <p>{passport.evidenceIds.length} evidence references</p>
            <p>{passport.calculationRefs.length} calculation references</p>
            <p>{passport.alternativesConsidered.length} alternatives considered</p>
            <Link
              className="button secondary full"
              to={`/households/${householdId}/audit?event=${encodeURIComponent(passport.auditReviewEventId)}`}
            >
              Open audit lineage
            </Link>
          </article>
        </aside>
      </section>
      {error ? <ErrorState message={error} /> : null}
    </>
  );
}

function PassportStatus({
  status,
  verified
}: {
  status: DecisionPassportStatus;
  verified: boolean;
}) {
  return (
    <div className={`passport-status status-${status.toLowerCase()}`}>
      {status === "VALID" ? <CheckCircle2 /> : status === "INVALIDATED" ? <XCircle /> : <Clock3 />}
      <div>
        <Badge tone={status === "VALID" ? "good" : status === "INVALIDATED" ? "danger" : "warn"}>
          {status.replace("_", " ")}
        </Badge>
        <strong>{verified ? "Signed proof verified" : "Proof verification failed"}</strong>
        <span>Automatic monitoring every six hours</span>
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  result
}: {
  condition: ValidityCondition;
  result: PassportConditionResult | undefined;
}) {
  const passed = result?.passed;
  const value = formatConditionValue(condition.baselineValue, condition.unit);
  const threshold = formatConditionValue(condition.threshold, condition.unit);
  const current =
    result?.actualValue === null || result?.actualValue === undefined
      ? "Unavailable"
      : formatConditionValue(result.actualValue, condition.unit);
  return (
    <div className="condition-row">
      <span
        className={`condition-state ${passed === false ? "fail" : passed === true ? "pass" : "pending"}`}
      >
        {passed === false ? <AlertTriangle /> : passed === true ? <CheckCircle2 /> : <Clock3 />}
      </span>
      <div>
        <strong>{condition.label}</strong>
        <p>{condition.rationale}</p>
        <small>{condition.source.replaceAll("_", " ")}</small>
      </div>
      <div>
        <span>{result ? `Current · baseline ${value}` : "Approved baseline"}</span>
        <strong>{result ? current : value}</strong>
        <small>
          {condition.operator === "LTE" ? "must remain ≤" : "must remain ≥"} {threshold}
        </small>
      </div>
    </div>
  );
}

function formatConditionValue(value: number, unit: ValidityCondition["unit"]): string {
  if (unit === "CURRENCY") return fullCurrency.format(value);
  if (unit === "RATE") return percent.format(value);
  if (unit === "HOURS") return `${value.toFixed(1)} hr/mo`;
  if (unit === "DAYS") return `${value.toFixed(0)} days`;
  return value.toFixed(1);
}
