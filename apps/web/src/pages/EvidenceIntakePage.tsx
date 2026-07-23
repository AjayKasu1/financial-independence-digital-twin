import {
  ArrowRight,
  Check,
  CheckCircle2,
  FileCheck2,
  FileLock2,
  FileSearch,
  Hash,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  EvidenceDocument,
  EvidenceDocumentType,
  EvidenceDocumentsResponse,
  ExtractedEvidenceFact
} from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { date, fullCurrency, percent } from "../lib/format";

const demoHouseholdId = "household-patel-demo";

const sampleDocuments: Record<
  EvidenceDocumentType,
  { readonly label: string; readonly fileName: string; readonly content: string }
> = {
  RSU_STATEMENT: {
    label: "Equity award statement",
    fileName: "maya-acme-equity-award-synthetic.txt",
    content: `SYNTHETIC EQUITY AWARD STATEMENT
EMPLOYEE: Maya Patel
TICKER: ACME
UNVESTED VALUE: $305,000
NEXT VEST DATE: 2026-09-20
NEXT VEST VALUE: $82,000
WITHHOLDING RATE: 35%
DEMONSTRATION DATA ONLY`
  },
  PAYSTUB: {
    label: "Compensation statement",
    fileName: "maya-pay-statement-synthetic.txt",
    content: `SYNTHETIC COMPENSATION STATEMENT
EMPLOYEE: Maya Patel
ANNUAL BASE: $246,000
PAY FREQUENCY: BIWEEKLY
DEMONSTRATION DATA ONLY`
  },
  MORTGAGE_STATEMENT: {
    label: "Mortgage statement",
    fileName: "patel-mortgage-statement-synthetic.txt",
    content: `SYNTHETIC MORTGAGE STATEMENT
BORROWERS: Maya and Arjun Patel
CURRENT BALANCE: $536,000
INTEREST RATE: 3.125%
MONTHLY PAYMENT: $3,240
REMAINING MONTHS: 232
PROPERTY ESTIMATED VALUE: $1,115,000
DEMONSTRATION DATA ONLY`
  }
};

export function EvidenceIntakePage() {
  const { householdId = demoHouseholdId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedType = searchParams.get("document") as EvidenceDocumentType | null;
  const [selectedType, setSelectedType] = useState<EvidenceDocumentType>(
    requestedType && requestedType in sampleDocuments ? requestedType : "RSU_STATEMENT"
  );
  const [data, setData] = useState<EvidenceDocumentsResponse | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [selectedFactIds, setSelectedFactIds] = useState<Set<string>>(new Set());
  const [rationale, setRationale] = useState(
    "I reviewed the source excerpts and confirm these synthetic facts match the statement."
  );
  const [busy, setBusy] = useState<"ingest" | "confirm" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setError("");
    void api
      .evidenceDocuments(householdId)
      .then((response) => {
        setData(response);
        const proposed = response.documents.find((document) => document.status === "EXTRACTED");
        if (proposed && !activeDocumentId) activateDocument(proposed);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };

  useEffect(() => {
    void api
      .evidenceDocuments(householdId)
      .then((response) => {
        setData(response);
        const proposed = response.documents.find((document) => document.status === "EXTRACTED");
        if (proposed) {
          setActiveDocumentId(proposed.id);
          setSelectedFactIds(
            new Set(
              proposed.facts.filter((fact) => fact.status === "PROPOSED").map((fact) => fact.id)
            )
          );
        } else {
          setActiveDocumentId(null);
          setSelectedFactIds(new Set());
        }
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [householdId]);

  const activeDocument = useMemo(
    () => data?.documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, data]
  );

  const ingest = async () => {
    setBusy("ingest");
    setError("");
    setSuccess("");
    const sample = sampleDocuments[selectedType];
    try {
      const document = await api.ingestEvidenceDocument(householdId, {
        documentType: selectedType,
        fileName: sample.fileName,
        content: sample.content,
        effectiveAt: "2026-07-23T14:00:00.000Z"
      });
      setData((current) =>
        current
          ? {
              ...current,
              documents: [document, ...current.documents],
              summary: {
                ...current.summary,
                totalDocuments: current.summary.totalDocuments + 1,
                proposedFacts: current.summary.proposedFacts + document.facts.length
              }
            }
          : current
      );
      activateDocument(document);
      setSuccess("Extraction complete. Review each proposed fact before it can update the twin.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const review = async (decision: "CONFIRM" | "REJECT") => {
    if (!activeDocument) return;
    setBusy(decision === "CONFIRM" ? "confirm" : "reject");
    setError("");
    setSuccess("");
    try {
      const response = await api.reviewEvidenceDocument(activeDocument.id, {
        decision,
        factIds: [...selectedFactIds],
        rationale
      });
      setSuccess(
        decision === "CONFIRM"
          ? `${response.appliedFieldPaths.length} facts admitted. The twin and Opportunity Radar are now using the confirmed values.`
          : "The extraction was rejected. No household facts changed."
      );
      setActiveDocumentId(null);
      setSelectedFactIds(new Set());
      const refreshed = await api.evidenceDocuments(householdId);
      setData(refreshed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  function activateDocument(document: EvidenceDocument) {
    setActiveDocumentId(document.id);
    setSelectedFactIds(
      new Set(document.facts.filter((fact) => fact.status === "PROPOSED").map((fact) => fact.id))
    );
  }

  if (!data && !error) return <LoadingState label="Opening the evidence admission queue…" />;
  if (!data && error) return <ErrorState message={error} retry={load} />;
  if (!data) return null;

  return (
    <>
      <section className="hero-row">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Evidence-to-Twin</span>
            <span className="operating-status">
              <i /> Advisor confirmation enforced
            </span>
          </div>
          <h1>Turn source evidence into testable facts</h1>
          <p>
            Extract only allowed fields, reconcile them with an advisor, then version the digital
            twin with source lineage and a hash-chained audit record.
          </p>
        </div>
        <div className="trust-stamp">
          <FileLock2 />
          <div>
            <span className="trust-label">Demo boundary</span>
            <strong>Synthetic structured statements only</strong>
            <span>No personal documents, OCR, or autonomous fact admission</span>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          label="Documents"
          value={String(data.summary.totalDocuments)}
          detail="Content-hashed at intake"
          icon={<FileSearch size={17} />}
          signal="Versioned"
        />
        <MetricCard
          label="Confirmed sources"
          value={String(data.summary.confirmedDocuments)}
          detail="Advisor-reviewed document classes"
          tone="positive"
          icon={<FileCheck2 size={17} />}
          signal="Admitted"
        />
        <MetricCard
          label="Facts awaiting review"
          value={String(data.summary.proposedFacts)}
          detail="Cannot affect calculations yet"
          tone={data.summary.proposedFacts ? "warning" : "default"}
          icon={<ShieldCheck size={17} />}
          signal="Controlled"
        />
        <MetricCard
          label="Twin facts admitted"
          value={String(data.summary.confirmedFacts)}
          detail="Field-level provenance retained"
          icon={<CheckCircle2 size={17} />}
          signal="Traceable"
        />
      </section>

      {error ? (
        <div className="inline-feedback feedback-error">
          <X size={16} />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="inline-feedback feedback-success">
          <CheckCircle2 size={16} />
          <span>{success}</span>
          <Link to="/opportunities">
            Open updated Radar <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}

      <section className="evidence-intake-grid">
        <article className="panel intake-source-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">01 · Select source</span>
              <h2>Load a controlled demo statement</h2>
            </div>
            <Badge tone="info">Synthetic</Badge>
          </div>
          <div className="document-type-grid">
            {(Object.keys(sampleDocuments) as EvidenceDocumentType[]).map((type) => (
              <button
                className={selectedType === type ? "active" : ""}
                key={type}
                onClick={() => setSelectedType(type)}
              >
                <FileCheck2 size={17} />
                <span>
                  <strong>{sampleDocuments[type].label}</strong>
                  <small>{sampleDocuments[type].fileName}</small>
                </span>
                {selectedType === type ? <Check size={15} /> : null}
              </button>
            ))}
          </div>
          <div className="structured-preview">
            <span>
              <Hash size={14} /> Structured source preview
            </span>
            <pre>{sampleDocuments[selectedType].content}</pre>
          </div>
          <button
            className="button primary full"
            onClick={() => void ingest()}
            disabled={busy !== null}
          >
            {busy === "ingest" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FileSearch size={16} />
            )}
            Extract proposed facts
          </button>
          <p className="intake-boundary">
            Extraction is deterministic and field-allowlisted. It does not call the LLM and cannot
            modify the household.
          </p>
        </article>

        <article className="panel intake-review-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">02 · Reconcile</span>
              <h2>Advisor fact review</h2>
            </div>
            {activeDocument ? (
              <Badge tone="warn">Admission pending</Badge>
            ) : (
              <Badge>Queue clear</Badge>
            )}
          </div>
          {activeDocument ? (
            <>
              <div className="active-document-heading">
                <span className="document-glyph">
                  <FileCheck2 size={20} />
                </span>
                <div>
                  <strong>{activeDocument.fileName}</strong>
                  <span>
                    Effective {date(activeDocument.effectiveAt)} ·{" "}
                    {activeDocument.contentHash.slice(0, 12)}…
                  </span>
                </div>
              </div>
              <div className="extracted-fact-list">
                {activeDocument.facts.map((fact) => {
                  const selected = selectedFactIds.has(fact.id);
                  return (
                    <label className={selected ? "selected" : ""} key={fact.id}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setSelectedFactIds((current) => {
                            const next = new Set(current);
                            if (next.has(fact.id)) next.delete(fact.id);
                            else next.add(fact.id);
                            return next;
                          })
                        }
                      />
                      <span className="fact-check">{selected ? <Check size={13} /> : null}</span>
                      <span className="fact-copy">
                        <span>
                          <strong>{fact.label}</strong>
                          <b>{formatFact(fact)}</b>
                        </span>
                        <small>{fact.sourceExcerpt}</small>
                        <em>
                          → {fact.fieldPath} · {percent.format(fact.confidence)} confidence
                        </em>
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="review-rationale">
                <span>Advisor rationale</span>
                <textarea
                  rows={3}
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                />
              </label>
              <div className="intake-review-actions">
                <button
                  className="button secondary"
                  disabled={busy !== null}
                  onClick={() => void review("REJECT")}
                >
                  {busy === "reject" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <X size={16} />
                  )}
                  Reject extraction
                </button>
                <button
                  className="button primary"
                  disabled={busy !== null || selectedFactIds.size === 0}
                  onClick={() => void review("CONFIRM")}
                >
                  {busy === "confirm" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Confirm {selectedFactIds.size} facts & update twin
                </button>
              </div>
            </>
          ) : (
            <div className="intake-empty-state">
              <FileSearch size={28} />
              <strong>No extraction awaiting review</strong>
              <span>Load a controlled statement to see its proposed twin changes here.</span>
            </div>
          )}
        </article>
      </section>

      <section className="panel evidence-history">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Evidence register</span>
            <h2>Document admission history</h2>
          </div>
          <Link className="button secondary" to={`/households/${householdId}/audit`}>
            View audit chain <ArrowRight size={15} />
          </Link>
        </div>
        {data.documents.length ? (
          <div className="evidence-history-list">
            {data.documents.map((document) => (
              <button
                key={document.id}
                onClick={() => document.status === "EXTRACTED" && activateDocument(document)}
                disabled={document.status !== "EXTRACTED"}
              >
                <span className={`history-state state-${document.status.toLowerCase()}`}>
                  {document.status === "CONFIRMED" ? <Check size={15} /> : <FileCheck2 size={15} />}
                </span>
                <span>
                  <strong>{document.fileName}</strong>
                  <small>
                    {documentTypeLabel(document.documentType)} · {document.facts.length} extracted
                    facts · {date(document.ingestedAt)}
                  </small>
                </span>
                <Badge
                  tone={
                    document.status === "CONFIRMED"
                      ? "good"
                      : document.status === "REJECTED"
                        ? "neutral"
                        : "warn"
                  }
                >
                  {document.status}
                </Badge>
                {document.status === "EXTRACTED" ? <RotateCcw size={15} /> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="intake-empty-state compact">
            <FileSearch size={24} />
            <strong>No evidence documents yet</strong>
            <span>The synthetic household currently relies on onboarding snapshot facts.</span>
          </div>
        )}
      </section>
    </>
  );
}

function formatFact(fact: ExtractedEvidenceFact): string {
  if (fact.valueType === "CURRENCY" && typeof fact.value === "number") {
    return fullCurrency.format(fact.value);
  }
  if (fact.valueType === "RATE" && typeof fact.value === "number") {
    return percent.format(fact.value);
  }
  if (fact.valueType === "DATE") return date(String(fact.value));
  return String(fact.value);
}

function documentTypeLabel(type: EvidenceDocumentType): string {
  return sampleDocuments[type].label;
}
