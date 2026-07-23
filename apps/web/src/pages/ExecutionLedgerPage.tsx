import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Fingerprint,
  Gauge,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  ExecutionLedgerResponse,
  ExecutionOutcomeMetric,
  ExecutionPlan,
  ExecutionTask
} from "@fidt/contracts";
import { Badge, ErrorState, LoadingState, MetricCard } from "../components/Ui";
import { api } from "../lib/api";
import { dateTime, fullCurrency, percent } from "../lib/format";

export function ExecutionLedgerPage() {
  const { householdId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const selectedPlanId = search.get("plan");
  const [ledger, setLedger] = useState<ExecutionLedgerResponse | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [externalReference, setExternalReference] = useState("SYNTHETIC-DEMO-RECEIPT");
  const [notes, setNotes] = useState(
    "Synthetic demonstration receipt; no trade, transfer, or custodian action was initiated."
  );
  const [attestation, setAttestation] = useState(false);
  const [actuals, setActuals] = useState<Partial<Record<ExecutionOutcomeMetric, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    void api
      .executionPlans(householdId)
      .then(setLedger)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [householdId]);

  useEffect(() => {
    void api
      .executionPlans(householdId)
      .then(setLedger)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [householdId]);

  const plan = useMemo(
    () =>
      ledger?.plans.find((candidate) => candidate.id === selectedPlanId) ??
      ledger?.plans[0] ??
      null,
    [ledger, selectedPlanId]
  );
  const selectedTask =
    plan?.tasks.find((task) => task.id === selectedTaskId) ??
    plan?.tasks.find((task) => task.id === plan.nextTaskId) ??
    plan?.tasks.find((task) => task.status === "EXCEPTION") ??
    plan?.tasks[0] ??
    null;

  const replacePlan = (updated: ExecutionPlan) => {
    setLedger((current) =>
      current
        ? {
            ...current,
            plans: current.plans.map((candidate) =>
              candidate.id === updated.id ? updated : candidate
            ),
            summary: ledgerSummary(
              current.plans.map((candidate) => (candidate.id === updated.id ? updated : candidate))
            )
          }
        : current
    );
    setSelectedTaskId(
      updated.tasks.find((task) => task.id === updated.nextTaskId)?.id ??
        updated.tasks.find((task) => task.status === "EXCEPTION")?.id ??
        selectedTaskId
    );
    setAttestation(false);
  };

  const recordReceipt = (result: "COMPLETED" | "EXCEPTION") => {
    if (!plan || !selectedTask || selectedTask.code === "OUTCOME_RECONCILIATION") return;
    setBusy(true);
    setError("");
    void api
      .recordExecutionReceipt(plan.id, selectedTask.id, {
        result,
        evidenceType: selectedTask.requiredEvidence,
        externalReference,
        notes,
        attestation: true
      })
      .then(replacePlan)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setBusy(false));
  };

  const reconcile = () => {
    if (!plan) return;
    setBusy(true);
    setError("");
    void api
      .reconcileExecution(plan.id, {
        outcomes: plan.expectedOutcomes.map((outcome) => ({
          metric: outcome.metric,
          actualValue: actuals[outcome.metric] ?? outcome.expectedValue
        })),
        evidenceReference: externalReference,
        notes,
        attestation: true
      })
      .then(replacePlan)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setBusy(false));
  };

  const createFromLatestPassport = () => {
    if (!ledger?.eligiblePassport) return;
    setBusy(true);
    setError("");
    void api
      .createExecutionPlan(ledger.eligiblePassport.id)
      .then((created) => {
        setLedger({
          householdId,
          plans: [created, ...ledger.plans],
          summary: ledgerSummary([created, ...ledger.plans])
        });
        setSearch({ plan: created.id });
        setSelectedTaskId(created.nextTaskId);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setBusy(false));
  };

  if (error && !ledger) return <ErrorState message={error} retry={load} />;
  if (!ledger) return <LoadingState label="Loading controlled execution records…" />;

  return (
    <>
      <section className="hero-row">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Execution & Outcome Ledger</span>
            <span className="operating-status">
              <i /> Non-custodial control plane
            </span>
          </div>
          <h1>Prove the advice was carried out.</h1>
          <p>
            Coordinate approved work, capture immutable receipts, reconcile realized outcomes, and
            automatically reopen advice when execution no longer matches its signed passport.
          </p>
        </div>
        <div className="trust-stamp">
          <LockKeyhole />
          <div>
            <span className="trust-label">Execution boundary</span>
            <strong>No trades, transfers, or custodian writes</strong>
            <span>Tasks · receipts · reconciliation · re-review</span>
          </div>
        </div>
      </section>

      {ledger.plans.length === 0 ? (
        <section className="panel execution-empty">
          <span>
            <ClipboardCheck />
          </span>
          <div>
            <span className="eyebrow">No approved execution plan yet</span>
            <h2>
              {ledger.eligiblePassport
                ? `Latest signed advice is ready: ${ledger.eligiblePassport.recommendationLabel}`
                : "Approval creates the operational record"}
            </h2>
            <p>
              {ledger.eligiblePassport
                ? `Passport ${ledger.eligiblePassport.id.slice(0, 8)} was issued ${dateTime(ledger.eligiblePassport.issuedAt)} and can now create its controlled, non-custodial implementation sequence.`
                : "Complete a governed recommendation and human attestation. A signed Decision Passport will automatically create its controlled execution sequence."}
            </p>
          </div>
          {ledger.eligiblePassport ? (
            <button className="button primary" onClick={createFromLatestPassport} disabled={busy}>
              {busy ? "Creating controls…" : "Create from latest passport"}
              <ArrowRight size={15} />
            </button>
          ) : (
            <Link className="button primary" to={`/households/${householdId}/compare`}>
              Open Decision Lab <ArrowRight size={15} />
            </Link>
          )}
        </section>
      ) : (
        <>
          <section className="metric-grid">
            <MetricCard
              label="Execution plans"
              value={String(ledger.summary.totalPlans)}
              detail="Signed passport-linked records"
              icon={<ClipboardCheck size={17} />}
              signal="Immutable"
            />
            <MetricCard
              label="Open tasks"
              value={String(ledger.summary.openTasks)}
              detail="Controlled prerequisites remaining"
              icon={<Route size={17} />}
              signal="Owned"
            />
            <MetricCard
              label="Plans at risk"
              value={String(ledger.summary.plansAtRisk)}
              detail="Exceptions requiring attention"
              tone={ledger.summary.plansAtRisk ? "warning" : "positive"}
              icon={<ShieldAlert size={17} />}
              signal="Governed"
            />
            <MetricCard
              label="Completed"
              value={String(ledger.summary.completedPlans)}
              detail="Outcome-reconciled advice"
              tone="positive"
              icon={<CheckCircle2 size={17} />}
              signal="Proven"
            />
          </section>

          {plan ? (
            <>
              <section className="execution-flow-strip">
                <FlowStep
                  number="01"
                  label="Signed passport"
                  state="VERIFIED"
                  icon={<Fingerprint />}
                />
                <ArrowRight />
                <FlowStep
                  number="02"
                  label="Controlled tasks"
                  state={`${plan.tasks.filter((task) => task.status === "COMPLETED").length}/${plan.tasks.length}`}
                  icon={<Route />}
                />
                <ArrowRight />
                <FlowStep
                  number="03"
                  label="Execution receipts"
                  state={`${plan.tasks.filter((task) => task.receipt).length} RECORDED`}
                  icon={<ReceiptText />}
                />
                <ArrowRight />
                <FlowStep
                  number="04"
                  label="Outcome state"
                  state={plan.reconciliation?.status ?? "PENDING"}
                  icon={<Gauge />}
                />
              </section>

              <section className="panel execution-plan-header">
                <div>
                  <span className="eyebrow">Passport-controlled implementation</span>
                  <h2>{plan.title}</h2>
                  <p>
                    Passport {plan.passportId.slice(0, 8)} · Target{" "}
                    {dateTime(plan.targetCompletionAt)}
                  </p>
                </div>
                <div className="execution-header-actions">
                  {ledger.plans.length > 1 ? (
                    <select
                      aria-label="Execution plan"
                      value={plan.id}
                      onChange={(event) => {
                        setSearch({ plan: event.target.value });
                        setSelectedTaskId(null);
                        setActuals({});
                      }}
                    >
                      {ledger.plans.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Badge tone={planStatusTone(plan.status)}>
                    {plan.status.replaceAll("_", " ")}
                  </Badge>
                  <Link
                    className="button secondary compact-button"
                    to={`/households/${householdId}/passports/${encodeURIComponent(plan.passportId)}`}
                  >
                    Open passport
                  </Link>
                </div>
                <div className="execution-progress">
                  <span style={{ width: `${plan.progress * 100}%` }} />
                </div>
              </section>

              <section className="execution-ledger-layout">
                <article className="panel execution-task-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">Controlled task sequence</span>
                      <h2>Owners, prerequisites, and proof</h2>
                    </div>
                    <Badge tone="neutral">{Math.round(plan.progress * 100)}% complete</Badge>
                  </div>
                  <div className="execution-task-list">
                    {plan.tasks.map((task, index) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        index={index}
                        selected={selectedTask?.id === task.id}
                        onSelect={() => setSelectedTaskId(task.id)}
                      />
                    ))}
                  </div>
                  <div className="execution-boundary-note">
                    <ShieldCheck />
                    <span>{plan.boundary}</span>
                  </div>
                </article>

                <aside className="panel execution-action-panel">
                  {selectedTask ? (
                    <TaskAction
                      task={selectedTask}
                      plan={plan}
                      externalReference={externalReference}
                      setExternalReference={setExternalReference}
                      notes={notes}
                      setNotes={setNotes}
                      attestation={attestation}
                      setAttestation={setAttestation}
                      actuals={actuals}
                      setActuals={setActuals}
                      busy={busy}
                      recordReceipt={recordReceipt}
                      reconcile={reconcile}
                    />
                  ) : null}
                  {error ? <div className="execution-inline-error">{error}</div> : null}
                </aside>
              </section>

              <section className="panel execution-outcome-ledger">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Advice value & integrity</span>
                    <h2>Expected versus realized outcome ledger</h2>
                  </div>
                  <Badge tone={plan.reconciliation?.status === "MATCHED" ? "good" : "neutral"}>
                    {plan.reconciliation?.status ?? "AWAITING OUTCOMES"}
                  </Badge>
                </div>
                <OutcomeTable plan={plan} />
              </section>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function FlowStep({
  number,
  label,
  state,
  icon
}: {
  number: string;
  label: string;
  state: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <span>{icon}</span>
      <small>{number}</small>
      <div>
        <span>{label}</span>
        <strong>{state}</strong>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  index,
  selected,
  onSelect
}: {
  task: ExecutionTask;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`${selected ? "active" : ""} status-${task.status.toLowerCase()}`}
      onClick={onSelect}
    >
      <span className="execution-sequence">{String(index + 1).padStart(2, "0")}</span>
      <span className="execution-task-state">
        {task.status === "COMPLETED" ? (
          <Check />
        ) : task.status === "EXCEPTION" ? (
          <AlertTriangle />
        ) : task.status === "READY" ? (
          <Clock3 />
        ) : (
          <LockKeyhole />
        )}
      </span>
      <span className="execution-task-copy">
        <span>
          <strong>{task.title}</strong>
          <Badge tone={taskStatusTone(task.status)}>{task.status}</Badge>
        </span>
        <small>
          {task.ownerRole.replaceAll("_", " ")} · Due {dateTime(task.dueAt)}
        </small>
      </span>
      <ArrowRight />
    </button>
  );
}

function TaskAction({
  task,
  plan,
  externalReference,
  setExternalReference,
  notes,
  setNotes,
  attestation,
  setAttestation,
  actuals,
  setActuals,
  busy,
  recordReceipt,
  reconcile
}: {
  task: ExecutionTask;
  plan: ExecutionPlan;
  externalReference: string;
  setExternalReference: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  attestation: boolean;
  setAttestation: (value: boolean) => void;
  actuals: Partial<Record<ExecutionOutcomeMetric, number>>;
  setActuals: React.Dispatch<React.SetStateAction<Partial<Record<ExecutionOutcomeMetric, number>>>>;
  busy: boolean;
  recordReceipt: (result: "COMPLETED" | "EXCEPTION") => void;
  reconcile: () => void;
}) {
  const actionable = task.status === "READY" || task.status === "EXCEPTION";
  return (
    <>
      <div className="execution-action-heading">
        <span className={`status-${task.status.toLowerCase()}`}>
          {task.status === "COMPLETED" ? <CheckCircle2 /> : <ClipboardCheck />}
        </span>
        <div>
          <Badge tone={taskStatusTone(task.status)}>{task.status}</Badge>
          <h2>{task.title}</h2>
          <p>{task.description}</p>
        </div>
      </div>

      <dl className="execution-task-metadata">
        <div>
          <dt>Owner</dt>
          <dd>{task.ownerRole.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{task.requiredEvidence.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{dateTime(task.dueAt)}</dd>
        </div>
      </dl>

      {task.receipt ? (
        <div className={`execution-receipt-proof ${task.receipt.result.toLowerCase()}`}>
          <ReceiptText />
          <div>
            <span className="eyebrow">Latest immutable receipt</span>
            <strong>{task.receipt.externalReference}</strong>
            <p>{task.receipt.notes}</p>
            <small>
              {task.receipt.recordedBy} · {dateTime(task.receipt.recordedAt)}
            </small>
          </div>
        </div>
      ) : null}

      {task.status === "BLOCKED" ? (
        <div className="execution-blocked-message">
          <LockKeyhole />
          <div>
            <strong>Prerequisite enforcement active</strong>
            <span>
              Complete the prior receipt before this task can accept implementation evidence.
            </span>
          </div>
        </div>
      ) : null}

      {actionable ? (
        <div className="execution-evidence-form">
          {task.code === "OUTCOME_RECONCILIATION" ? (
            <div className="execution-actual-grid">
              {plan.expectedOutcomes.map((outcome) => (
                <label key={outcome.metric}>
                  <span>{outcome.label}</span>
                  <small>Expected {formatOutcome(outcome.expectedValue, outcome.unit)}</small>
                  <input
                    type="number"
                    step={outcome.unit === "RATE" ? 0.01 : 100}
                    value={actuals[outcome.metric] ?? outcome.expectedValue}
                    onChange={(event) =>
                      setActuals((current) => ({
                        ...current,
                        [outcome.metric]: Number(event.target.value)
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
          <label>
            <span>External evidence reference</span>
            <input
              value={externalReference}
              onChange={(event) => setExternalReference(event.target.value)}
              maxLength={160}
            />
          </label>
          <label>
            <span>Advisor record note</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1500}
            />
          </label>
          <label className="execution-attestation">
            <input
              type="checkbox"
              checked={attestation}
              onChange={(event) => setAttestation(event.target.checked)}
            />
            <span>
              I verified this synthetic evidence reference and remain responsible for the recorded
              execution state.
            </span>
          </label>
          {task.code === "OUTCOME_RECONCILIATION" ? (
            <button
              className="button primary full"
              disabled={!attestation || busy}
              onClick={reconcile}
            >
              {busy ? <RefreshCw className="spin" /> : <Gauge />}
              {busy ? "Reconciling outcomes…" : "Record governed reconciliation"}
            </button>
          ) : (
            <div className="execution-receipt-actions">
              <button
                className="button primary"
                disabled={!attestation || busy}
                onClick={() => recordReceipt("COMPLETED")}
              >
                <FileCheck2 /> {busy ? "Recording…" : "Record completed receipt"}
              </button>
              <button
                className="button secondary"
                disabled={!attestation || busy}
                onClick={() => recordReceipt("EXCEPTION")}
              >
                <AlertTriangle /> Record exception
              </button>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

function OutcomeTable({ plan }: { plan: ExecutionPlan }) {
  const results = new Map(
    plan.reconciliation?.results.map((result) => [result.metric, result]) ?? []
  );
  return (
    <>
      <div className="execution-outcome-table">
        <div className="outcome-table-head">
          <span>Measured outcome</span>
          <span>Approved expectation</span>
          <span>Realized</span>
          <span>Integrity state</span>
        </div>
        {plan.expectedOutcomes.map((outcome) => {
          const result = results.get(outcome.metric);
          return (
            <div className="outcome-table-row" key={outcome.metric}>
              <span>
                <strong>{outcome.label}</strong>
                <small>{outcome.source}</small>
              </span>
              <b>{formatOutcome(outcome.expectedValue, outcome.unit)}</b>
              <b>{result ? formatOutcome(result.actualValue, result.unit) : "Pending"}</b>
              <Badge tone={result?.status === "EXCEPTION" ? "danger" : result ? "good" : "neutral"}>
                {result?.status.replaceAll("_", " ") ?? "NOT OBSERVED"}
              </Badge>
            </div>
          );
        })}
      </div>
      <div className="execution-unmeasured">
        <ShieldAlert />
        <div>
          <strong>Explicitly outside this outcome ledger</strong>
          {plan.unmeasuredOutcomes.map((outcome) => (
            <span key={outcome}>{outcome}</span>
          ))}
        </div>
      </div>
      {plan.reconciliation ? (
        <div
          className={`execution-passport-effect ${plan.reconciliation.passportStatusAfter.toLowerCase()}`}
        >
          {plan.reconciliation.passportStatusAfter === "VALID" ? <ShieldCheck /> : <ShieldAlert />}
          <div>
            <strong>
              Passport state: {plan.reconciliation.passportStatusAfter.replaceAll("_", " ")}
            </strong>
            <span>
              {plan.reconciliation.reasons.length
                ? plan.reconciliation.reasons.join(" ")
                : "Realized values remained inside approved execution tolerances."}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ledgerSummary(plans: readonly ExecutionPlan[]): ExecutionLedgerResponse["summary"] {
  return {
    totalPlans: plans.length,
    activePlans: plans.filter((plan) => plan.status === "ACTIVE").length,
    plansAtRisk: plans.filter(
      (plan) => plan.status === "AT_RISK" || plan.status === "REVIEW_REQUIRED"
    ).length,
    completedPlans: plans.filter((plan) => plan.status === "COMPLETED").length,
    openTasks: plans
      .flatMap((plan) => plan.tasks)
      .filter((task) => task.status === "READY" || task.status === "BLOCKED").length
  };
}

function planStatusTone(status: ExecutionPlan["status"]): "good" | "warn" | "danger" | "info" {
  if (status === "COMPLETED") return "good";
  if (status === "REVIEW_REQUIRED") return "danger";
  if (status === "AT_RISK") return "warn";
  return "info";
}

function taskStatusTone(status: ExecutionTask["status"]): "good" | "warn" | "danger" | "neutral" {
  if (status === "COMPLETED") return "good";
  if (status === "EXCEPTION") return "danger";
  if (status === "READY") return "warn";
  return "neutral";
}

function formatOutcome(value: number, unit: "CURRENCY" | "RATE"): string {
  return unit === "RATE" ? percent.format(value) : fullCurrency.format(value);
}
