import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  RecommendationRequest,
  RecommendationResponse,
  ReviewResponse
} from "@fidt/contracts";
import { Badge, ErrorState, LoadingState } from "../components/Ui";
import { api } from "../lib/api";
import { date, dateTime } from "../lib/format";

const labelNames: Record<string, string> = {
  CLIENT_FACT: "Client fact",
  DETERMINISTIC_CALCULATION: "Engine calculation",
  EXTERNAL_FACT: "External fact",
  PLANNING_ASSUMPTION: "Planning assumption",
  ADVISOR_JUDGMENT: "Advisor judgment",
  AI_SUGGESTION: "AI suggestion"
};

type RecommendationAction = "generating" | "repairing" | "fallback" | "approving" | null;

export function RecommendationPage() {
  const { householdId = "" } = useParams();
  const [search] = useSearchParams();
  const runId = search.get("run") ?? "";
  const [rationale, setRationale] = useState("");
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState<RecommendationAction>(null);
  const [attestation, setAttestation] = useState(false);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const generate = (
    generationMode: RecommendationRequest["generationMode"] = "AI",
    repairOfRecommendationId?: string
  ) => {
    if (!runId) {
      setError("A scenario run is required before drafting a recommendation.");
      return;
    }
    setAction(
      generationMode === "DETERMINISTIC_FALLBACK"
        ? "fallback"
        : repairOfRecommendationId
          ? "repairing"
          : "generating"
    );
    setError("");
    void api
      .recommend(householdId, {
        runId,
        generationMode,
        ...(rationale ? { advisorRationale: rationale } : {}),
        ...(repairOfRecommendationId ? { repairOfRecommendationId } : {})
      })
      .then((response) => {
        setData(response);
        setAttestation(false);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setAction(null));
  };
  const approve = () => {
    if (!data) return;
    setAction("approving");
    void api
      .review(data.recommendation.id, {
        decision: "APPROVE",
        rationale:
          "I reviewed the cited evidence, deterministic calculations, alternatives, assumptions, risks, and disclosed conflicts.",
        attestation
      })
      .then(setReview)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setAction(null));
  };

  if (action === "generating" && !data) {
    return <LoadingState label="Drafting from approved evidence…" />;
  }
  return (
    <>
      <section className="hero-row compact">
        <div>
          <Link className="back-link" to={`/households/${householdId}/compare`}>
            <ArrowLeft size={15} />
            Decision lab
          </Link>
          <span className="eyebrow coral">Recommendation studio</span>
          <h1>Evidence before eloquence.</h1>
          <p>
            The language model may organize and explain; every number remains owned by the
            deterministic scenario run.
          </p>
        </div>
        <div className="trust-stamp small">
          <LockKeyhole />
          <div>
            <strong>Model boundary enforced</strong>
            <span>No calculations, no autonomous approval</span>
          </div>
        </div>
      </section>
      {!data ? (
        <section className="draft-launch panel">
          <div className="draft-illustration">
            <Sparkles />
          </div>
          <div>
            <span className="eyebrow">Advisor context</span>
            <h2>Create an evidence-linked draft</h2>
            <p>
              Add optional judgment or client context. The generator receives only the synthetic
              household, versioned scenario outputs, conflicts, and allowed citations.
            </p>
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Example: Maya values family time and wants to preserve at least $150K in liquid reserves."
              maxLength={2000}
            />
            <div className="draft-controls">
              <span>{rationale.length} / 2,000</span>
              <button className="button primary" onClick={() => generate()}>
                Generate governed draft
                <Sparkles size={16} />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <RecommendationView
          data={data}
          attestation={attestation}
          setAttestation={setAttestation}
          approve={approve}
          review={review}
          action={action}
          repair={() => generate("AI", data.recommendation.id)}
          useFallback={() => generate("DETERMINISTIC_FALLBACK", data.recommendation.id)}
        />
      )}
      {error ? <ErrorState message={error} /> : null}
    </>
  );
}

function RecommendationView({
  data,
  attestation,
  setAttestation,
  approve,
  review,
  action,
  repair,
  useFallback
}: {
  data: RecommendationResponse;
  attestation: boolean;
  setAttestation: (value: boolean) => void;
  approve: () => void;
  review: ReviewResponse | null;
  action: RecommendationAction;
  repair: () => void;
  useFallback: () => void;
}) {
  const { recommendation, compliance } = data;
  return (
    <section className="recommendation-layout">
      <article className="panel recommendation-document">
        <header>
          <div>
            <span className="eyebrow">Advisor review draft</span>
            <h1>{recommendation.headline}</h1>
            <p>{recommendation.executiveSummary}</p>
          </div>
          <Badge tone={recommendation.generatedBy === "OPENROUTER" ? "info" : "neutral"}>
            {recommendation.generatedBy === "OPENROUTER" ? "AI-assisted" : "Deterministic fallback"}
          </Badge>
        </header>
        <div className="statement-list">
          {recommendation.statements.map((statement) => (
            <section key={statement.id}>
              <Badge
                tone={
                  statement.label === "DETERMINISTIC_CALCULATION"
                    ? "good"
                    : statement.label === "ADVISOR_JUDGMENT"
                      ? "warn"
                      : "info"
                }
              >
                {labelNames[statement.label]}
              </Badge>
              <p>{statement.text}</p>
              {statement.calculationRefs.length ? (
                <code>{statement.calculationRefs.join(" · ")}</code>
              ) : null}
              <div>
                {statement.citationIds.map((citationId) => (
                  <span key={citationId}>#{citationId}</span>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="alternatives">
          <h2>Alternatives considered</h2>
          {recommendation.alternativesConsidered.map((alternative) => (
            <p key={alternative}>
              <CheckCircle2 />
              {alternative}
            </p>
          ))}
          <h2>Conflicts disclosed</h2>
          {recommendation.conflictsDisclosed.length ? (
            recommendation.conflictsDisclosed.map((conflict) => (
              <p key={conflict}>
                <AlertTriangle />
                {conflict}
              </p>
            ))
          ) : (
            <p>
              <CheckCircle2 />
              No material fee conflict returned by this scenario run.
            </p>
          )}
        </div>
        <footer>
          Drafted {date(recommendation.createdAt)} · Model {recommendation.modelId} · Prompt{" "}
          {recommendation.promptVersion}
        </footer>
      </article>
      <aside className="review-column">
        <article className="panel policy-card">
          <div className={`policy-icon policy-${compliance.status.toLowerCase()}`}>
            {compliance.status === "APPROVE" ? <FileCheck2 /> : <AlertTriangle />}
          </div>
          <span className="eyebrow">Automated policy check</span>
          <h2>{compliance.status.replace("_", " ")}</h2>
          <p>Automated controls do not replace human fiduciary review.</p>
          {compliance.reasons.map((reason) => (
            <div className="policy-reason" key={`${reason.code}-${reason.statementId ?? "all"}`}>
              <Badge
                tone={
                  reason.severity === "BLOCKING"
                    ? "danger"
                    : reason.severity === "WARNING"
                      ? "warn"
                      : "good"
                }
              >
                {reason.severity}
              </Badge>
              <span>{reason.message}</span>
            </div>
          ))}
          {compliance.status !== "APPROVE" ? (
            <div className="repair-controls">
              <p>The draft cannot be approved until every blocking control passes.</p>
              <button className="button primary full" onClick={repair} disabled={action !== null}>
                <Sparkles size={15} />
                {action === "repairing"
                  ? "Repairing draft…"
                  : "Regenerate with compliance feedback"}
              </button>
              <button
                className="button secondary full"
                onClick={useFallback}
                disabled={action !== null}
              >
                <LockKeyhole size={15} />
                {action === "fallback"
                  ? "Preparing governed fallback…"
                  : "Use governed deterministic fallback"}
              </button>
            </div>
          ) : null}
        </article>
        <article className="panel citation-card">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Evidence bundle</span>
              <h2>{recommendation.citations.length} sources</h2>
            </div>
          </div>
          {recommendation.citations.map((citation) => (
            <div key={citation.id}>
              <span className="source-mark">{citation.sourceType.slice(0, 2)}</span>
              <div>
                <strong>{citation.title}</strong>
                <span>As of {date(citation.asOf)}</span>
              </div>
              {citation.sourceUrl ? (
                <a
                  href={citation.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${citation.title}`}
                >
                  <ExternalLink size={15} />
                </a>
              ) : null}
            </div>
          ))}
        </article>
        <article className="panel attestation-card">
          {review ? (
            <div className="approval-confirmation" role="status">
              <CheckCircle2 />
              <span className="eyebrow">Human approval recorded</span>
              <strong>Cece Sterling</strong>
              <p>{dateTime(review.reviewedAt)}</p>
              {review.passportId ? (
                <Link
                  className="button primary full"
                  to={`/households/${recommendation.householdId}/passports/${encodeURIComponent(review.passportId)}`}
                >
                  Open signed Decision Passport
                  <FileCheck2 size={16} />
                </Link>
              ) : null}
              {review.executionPlanId ? (
                <Link
                  className="button secondary full"
                  to={`/households/${recommendation.householdId}/execution?plan=${encodeURIComponent(review.executionPlanId)}`}
                >
                  Open execution ledger
                  <ClipboardCheck size={16} />
                </Link>
              ) : null}
              <Link
                className="button secondary full"
                to={`/households/${recommendation.householdId}/audit?event=${encodeURIComponent(review.auditEventId)}`}
              >
                View verified audit trail
              </Link>
            </div>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={attestation}
                  onChange={(event) => setAttestation(event.target.checked)}
                />
                <span>
                  I reviewed the evidence, assumptions, calculations, alternatives, risks, and
                  compensation conflicts. I remain responsible for the recommendation.
                </span>
              </label>
              <button
                className="button primary full"
                disabled={!attestation || compliance.status !== "APPROVE" || action !== null}
                onClick={approve}
              >
                {action === "approving" ? "Recording approval…" : "Record human approval"}
                <FileCheck2 size={16} />
              </button>
            </>
          )}
        </article>
      </aside>
    </section>
  );
}
