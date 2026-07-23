import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CloudLightning,
  ExternalLink,
  Gauge,
  Home,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Umbrella,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  ResilienceShock,
  ScenarioResult,
  WorkbenchRequest,
  WorkbenchResponse
} from "@fidt/contracts";
import { Badge, ErrorState, MiniLine } from "../components/Ui";
import { api } from "../lib/api";
import { currency, fullCurrency, percent } from "../lib/format";

const householdId = "household-patel-demo";
const canonicalEmployerStockPercent = 292_000 / (292_000 + 568_000 + 216_000 + 255_000);

const canonicalInputs: WorkbenchRequest = {
  rsuVestAmount: 71_000,
  employerStockPercent: canonicalEmployerStockPercent,
  liquidityFloor: 150_000,
  targetFiAge: 52,
  maxRealEstateHoursPerMonth: 6,
  rentalPurchasePrice: 525_000,
  monthlyMarketRent: 3_650,
  mortgageRate: 0.0675,
  resilienceShock: emptyShock()
};

const shockPresets: readonly {
  id: "CALM" | "EMPLOYMENT" | "CONCENTRATION" | "COMPOUND";
  label: string;
  detail: string;
  shock: ResilienceShock;
}[] = [
  { id: "CALM", label: "No shock", detail: "Canonical household", shock: emptyShock() },
  {
    id: "EMPLOYMENT",
    label: "Income gap",
    detail: "Six months without income",
    shock: {
      ...emptyShock(),
      incomeLossPercent: 1,
      incomeLossMonths: 6
    }
  },
  {
    id: "CONCENTRATION",
    label: "Employer event",
    detail: "Stock falls 35%",
    shock: {
      ...emptyShock(),
      incomeLossPercent: 0.5,
      incomeLossMonths: 6,
      employerStockDecline: 0.35,
      broadMarketDecline: 0.1
    }
  },
  {
    id: "COMPOUND",
    label: "Compound stress",
    detail: "Income, markets, and $250K",
    shock: {
      emergencyExpense: 250_000,
      incomeLossPercent: 1,
      incomeLossMonths: 9,
      employerStockDecline: 0.4,
      broadMarketDecline: 0.25,
      spendingIncreaseRate: 0.08
    }
  }
];

export function WorkbenchPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"DECISION" | "RESILIENCE">(
    searchParams.get("mode") === "resilience" ? "RESILIENCE" : "DECISION"
  );
  const [inputs, setInputs] = useState<WorkbenchRequest>(canonicalInputs);
  const [result, setResult] = useState<WorkbenchResponse | null>(null);
  const [baseline, setBaseline] = useState<WorkbenchResponse | null>(null);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(true);
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const timeout = window.setTimeout(() => {
      void api
        .workbench(householdId, inputs)
        .then((response) => {
          if (sequence !== requestSequence.current) return;
          setResult(response);
          if (isCanonicalInput(inputs)) setBaseline(response);
          setError("");
        })
        .catch((reason: unknown) => {
          if (sequence !== requestSequence.current) return;
          setError(reason instanceof Error ? reason.message : "Unknown error");
        })
        .finally(() => {
          if (sequence === requestSequence.current) setCalculating(false);
        });
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [inputs]);

  const update = <Key extends keyof WorkbenchRequest>(key: Key, value: WorkbenchRequest[Key]) => {
    setCalculating(true);
    setInputs((current) => ({ ...current, [key]: value }));
  };
  const updateShock = <Key extends keyof ResilienceShock>(
    key: Key,
    value: ResilienceShock[Key]
  ) => {
    setCalculating(true);
    setInputs((current) => ({
      ...current,
      resilienceShock: { ...current.resilienceShock, [key]: value }
    }));
  };
  const applyShockPreset = (shock: ResilienceShock) => {
    setCalculating(true);
    setInputs((current) => ({ ...current, resilienceShock: { ...shock } }));
  };
  const reset = () => {
    setCalculating(true);
    setInputs(canonicalInputs);
  };
  const changedInputs = changedInputCount(inputs);
  const leading = leadingScenario(result?.scenarios ?? []);
  const baselineEquivalent = baseline?.scenarios.find(
    (scenario) => scenario.strategy === leading?.strategy
  );
  const successDelta =
    leading && baselineEquivalent
      ? leading.successProbability - baselineEquivalent.successProbability
      : 0;
  const stressed = result?.resilience.stressed;
  const promotableCapital = stressed?.metrics.availableDecisionCapital ?? inputs.rsuVestAmount;
  const activePreset = shockPresets.find((preset) =>
    sameShock(preset.shock, inputs.resilienceShock)
  );
  const promotionUrl = useMemo(() => {
    const search = new URLSearchParams({
      source: "workbench",
      capital: String(promotableCapital),
      originalCapital: String(inputs.rsuVestAmount),
      price: String(inputs.rentalPurchasePrice),
      rent: String(inputs.monthlyMarketRent),
      rate: String(inputs.mortgageRate * 100),
      hours: String(inputs.maxRealEstateHoursPerMonth),
      shockEmergency: String(inputs.resilienceShock.emergencyExpense),
      shockIncome: String(inputs.resilienceShock.incomeLossPercent),
      shockMonths: String(inputs.resilienceShock.incomeLossMonths),
      shockEmployer: String(inputs.resilienceShock.employerStockDecline),
      shockMarket: String(inputs.resilienceShock.broadMarketDecline),
      shockSpending: String(inputs.resilienceShock.spendingIncreaseRate)
    });
    return `/households/${householdId}/compare?${search.toString()}`;
  }, [inputs, promotableCapital]);

  return (
    <>
      <section className="hero-row compact workbench-hero">
        <div>
          <div className="hero-meta">
            <span className="eyebrow coral">Advisor workbench</span>
            <span className="operating-status">
              <i /> Session isolated
            </span>
          </div>
          <h1>Pressure-test the advice.</h1>
          <p>
            Change the few assumptions that matter in a client conversation. Results recalculate
            deterministically without changing Maya and Arjun’s canonical twin or audit ledger.
          </p>
        </div>
        <div className="trust-stamp workbench-trust">
          <LockKeyhole />
          <div>
            <span className="trust-label">Workspace policy</span>
            <strong>Non-destructive session</strong>
            <span>No record is created until promoted to governed review</span>
          </div>
        </div>
      </section>

      <section className="workbench-notice">
        <span>
          <SlidersHorizontal size={16} />
          <strong>Maya & Arjun Patel</strong>
          <small>Synthetic twin · canonical assumptions loaded</small>
        </span>
        <span>
          <Badge tone={changedInputs ? "warn" : "good"}>
            {changedInputs ? `${changedInputs} modified` : "Canonical"}
          </Badge>
          <button className="text-button" onClick={reset} disabled={!changedInputs}>
            <RotateCcw size={14} /> Reset
          </button>
        </span>
      </section>

      <div className="workbench-mode-switch" role="tablist" aria-label="Workbench mode">
        <button
          className={mode === "DECISION" ? "active" : ""}
          role="tab"
          aria-selected={mode === "DECISION"}
          onClick={() => setMode("DECISION")}
        >
          <SlidersHorizontal />
          <span>
            <strong>Decision economics</strong>
            <small>Compare uses of capital</small>
          </span>
        </button>
        <button
          className={mode === "RESILIENCE" ? "active" : ""}
          role="tab"
          aria-selected={mode === "RESILIENCE"}
          onClick={() => setMode("RESILIENCE")}
        >
          <Umbrella />
          <span>
            <strong>Resilience mode</strong>
            <small>Measure options under uncertainty</small>
          </span>
        </button>
      </div>

      <section className="workbench-layout">
        <aside className="panel workbench-controls">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                {mode === "DECISION" ? "Editable assumptions" : "Deterministic stress"}
              </span>
              <h2>{mode === "DECISION" ? "Live what-if controls" : "Resilience controls"}</h2>
            </div>
            {calculating ? <span className="calculation-pulse" aria-label="Recalculating" /> : null}
          </div>

          {mode === "DECISION" ? (
            <>
              <div className="control-section">
                <span>Decision event</span>
                <WorkbenchControl
                  label="RSU vest available"
                  value={inputs.rsuVestAmount}
                  min={25_000}
                  max={300_000}
                  step={1_000}
                  prefix="$"
                  format={(value) => fullCurrency.format(value)}
                  onChange={(value) => update("rsuVestAmount", value)}
                />
                <WorkbenchControl
                  label="Employer stock concentration"
                  value={inputs.employerStockPercent}
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  scale={100}
                  suffix="%"
                  format={(value) => `${(value * 100).toFixed(0)}%`}
                  onChange={(value) => update("employerStockPercent", value)}
                />
              </div>

              <div className="control-section">
                <span>Rental underwriting</span>
                <WorkbenchControl
                  label="Purchase price"
                  value={inputs.rentalPurchasePrice}
                  min={250_000}
                  max={1_000_000}
                  step={5_000}
                  prefix="$"
                  format={(value) => fullCurrency.format(value)}
                  onChange={(value) => update("rentalPurchasePrice", value)}
                />
                <WorkbenchControl
                  label="Monthly market rent"
                  value={inputs.monthlyMarketRent}
                  min={1_500}
                  max={8_000}
                  step={50}
                  prefix="$"
                  format={(value) => `${fullCurrency.format(value)}/mo`}
                  onChange={(value) => update("monthlyMarketRent", value)}
                />
                <WorkbenchControl
                  label="Mortgage rate"
                  value={inputs.mortgageRate}
                  min={0.03}
                  max={0.12}
                  step={0.0005}
                  scale={100}
                  suffix="%"
                  format={(value) => `${(value * 100).toFixed(2)}%`}
                  onChange={(value) => update("mortgageRate", value)}
                />
                <WorkbenchControl
                  label="Property workload"
                  value={inputs.maxRealEstateHoursPerMonth}
                  min={0}
                  max={20}
                  step={1}
                  suffix="hr/mo"
                  format={(value) => `${value} hr/mo`}
                  onChange={(value) => update("maxRealEstateHoursPerMonth", value)}
                />
              </div>

              <div className="control-section">
                <span>Client constraints</span>
                <WorkbenchControl
                  label="Liquidity floor"
                  value={inputs.liquidityFloor}
                  min={50_000}
                  max={500_000}
                  step={5_000}
                  prefix="$"
                  format={(value) => fullCurrency.format(value)}
                  onChange={(value) => update("liquidityFloor", value)}
                />
                <WorkbenchControl
                  label="Target FI age"
                  value={inputs.targetFiAge}
                  min={45}
                  max={65}
                  step={1}
                  format={(value) => `Age ${value}`}
                  onChange={(value) => update("targetFiAge", value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="control-section">
                <span>Stress library</span>
                <div className="shock-preset-grid">
                  {shockPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className={activePreset?.id === preset.id ? "active" : ""}
                      onClick={() => applyShockPreset(preset.shock)}
                    >
                      <strong>{preset.label}</strong>
                      <span>{preset.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="control-section">
                <span>Cash-flow disruption</span>
                <WorkbenchControl
                  label="Emergency expense"
                  value={inputs.resilienceShock.emergencyExpense}
                  min={0}
                  max={750_000}
                  step={5_000}
                  prefix="$"
                  format={(value) => fullCurrency.format(value)}
                  onChange={(value) => updateShock("emergencyExpense", value)}
                />
                <WorkbenchControl
                  label="Income reduction"
                  value={inputs.resilienceShock.incomeLossPercent}
                  min={0}
                  max={1}
                  step={0.05}
                  scale={100}
                  suffix="%"
                  format={(value) => percent.format(value)}
                  onChange={(value) => updateShock("incomeLossPercent", value)}
                />
                <WorkbenchControl
                  label="Interruption period"
                  value={inputs.resilienceShock.incomeLossMonths}
                  min={0}
                  max={24}
                  step={1}
                  suffix="months"
                  format={(value) => `${value} months`}
                  onChange={(value) => updateShock("incomeLossMonths", value)}
                />
              </div>
              <div className="control-section">
                <span>Market disruption</span>
                <WorkbenchControl
                  label="Employer stock decline"
                  value={inputs.resilienceShock.employerStockDecline}
                  min={0}
                  max={0.8}
                  step={0.05}
                  scale={100}
                  suffix="%"
                  format={(value) => percent.format(value)}
                  onChange={(value) => updateShock("employerStockDecline", value)}
                />
                <WorkbenchControl
                  label="Broad market decline"
                  value={inputs.resilienceShock.broadMarketDecline}
                  min={0}
                  max={0.6}
                  step={0.05}
                  scale={100}
                  suffix="%"
                  format={(value) => percent.format(value)}
                  onChange={(value) => updateShock("broadMarketDecline", value)}
                />
                <WorkbenchControl
                  label="Spending-cost increase"
                  value={inputs.resilienceShock.spendingIncreaseRate}
                  min={0}
                  max={0.2}
                  step={0.01}
                  scale={100}
                  suffix="%"
                  format={(value) => percent.format(value)}
                  onChange={(value) => updateShock("spendingIncreaseRate", value)}
                />
              </div>
            </>
          )}
        </aside>

        <main className={`workbench-results ${calculating ? "is-calculating" : ""}`}>
          {error ? <ErrorState message={error} /> : null}
          {result && mode === "DECISION" ? (
            <>
              <div className="workbench-results-heading">
                <div>
                  <span className="eyebrow">Deterministic comparison</span>
                  <h2>{leading?.label ?? "Calculating alternatives"}</h2>
                  <p>
                    {leading
                      ? `${percent.format(leading.successProbability)} modeled FI success under this session’s assumptions.`
                      : "Evaluating the three capital uses."}
                  </p>
                </div>
                <div className="workbench-run-state">
                  <span className={calculating ? "calculation-pulse" : "calculation-ready"} />
                  {calculating ? "Recalculating" : "Current"}
                </div>
              </div>
              <div className="workbench-scenario-stack">
                {result.scenarios.map((scenario) => (
                  <WorkbenchScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    leading={scenario.id === leading?.id}
                  />
                ))}
              </div>
            </>
          ) : result && mode === "RESILIENCE" ? (
            <ResilienceResults result={result} calculating={calculating} />
          ) : error ? null : (
            <div className="workbench-loading">
              <Gauge />
              <strong>Building the canonical comparison…</strong>
              <span>AI is not used for these calculations.</span>
            </div>
          )}
        </main>

        <aside className="workbench-rail">
          {mode === "DECISION" ? (
            <>
              <article className="panel workbench-signal-card">
                <span className="eyebrow">Decision signal</span>
                <div className="signal-icon">
                  <TrendingUp />
                </div>
                <h2>{leading?.strategy.replaceAll("_", " ") ?? "Evaluating"}</h2>
                <p>{leading?.label ?? "Waiting for deterministic results"}</p>
                <dl>
                  <div>
                    <dt>FI success delta</dt>
                    <dd className={successDelta < 0 ? "negative" : "positive"}>
                      {successDelta > 0 ? "+" : ""}
                      {(successDelta * 100).toFixed(1)} pts
                    </dd>
                  </div>
                  <div>
                    <dt>Inputs modified</dt>
                    <dd>{changedInputs}</dd>
                  </div>
                  <div>
                    <dt>Audit events</dt>
                    <dd>0</dd>
                  </div>
                </dl>
              </article>

              <article className="panel workbench-boundaries">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Tipping points</span>
                    <h2>What must change?</h2>
                  </div>
                </div>
                <div>
                  <span>Market rent crossover</span>
                  <strong>
                    {result?.analysis?.breakEvenMonthlyRent
                      ? `${fullCurrency.format(result.analysis.breakEvenMonthlyRent)}/mo`
                      : "No crossover"}
                  </strong>
                </div>
                <div>
                  <span>Capital-feasible price</span>
                  <strong>
                    {result?.analysis
                      ? fullCurrency.format(result.analysis.maxAffordablePurchasePrice)
                      : "—"}
                  </strong>
                </div>
              </article>

              <article className="panel workbench-impact">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Governance boundary</span>
                    <h2>Passport impact</h2>
                  </div>
                  <ShieldCheck />
                </div>
                <ImpactRow
                  changed={inputs.liquidityFloor !== canonicalInputs.liquidityFloor}
                  label="Liquidity floor"
                />
                <ImpactRow
                  changed={inputs.employerStockPercent > 0.25}
                  label="Employer-stock limit"
                />
                <ImpactRow
                  changed={inputs.maxRealEstateHoursPerMonth !== 6}
                  label="Property workload"
                />
                <ImpactRow changed={inputs.targetFiAge !== 52} label="FI objective" />
                <p>
                  Workbench constraint changes are stress tests—not amendments to the signed Client
                  Constitution.
                </p>
              </article>
            </>
          ) : result ? (
            <ResilienceRail result={result} />
          ) : null}

          <div className="workbench-actions">
            {promotableCapital > 0 ? (
              <Link className="button primary full" to={promotionUrl}>
                Promote to governed comparison
                <ArrowRight size={16} />
              </Link>
            ) : (
              <button className="button primary full" disabled>
                No capital remains to promote
              </button>
            )}
            <button className="button secondary full" onClick={reset} disabled={!changedInputs}>
              <RotateCcw size={15} /> Reset canonical household
            </button>
            <small>
              Promotion restores the signed Constitution, locks the selected shock, and requires an
              explicit versioned run.
            </small>
          </div>
        </aside>
      </section>
    </>
  );
}

function changedInputCount(input: WorkbenchRequest): number {
  const decisionChanges = Object.entries(input).filter(
    ([key, value]) =>
      key !== "resilienceShock" && value !== canonicalInputs[key as keyof WorkbenchRequest]
  ).length;
  const shockChanges = Object.entries(input.resilienceShock).filter(
    ([key, value]) => value !== canonicalInputs.resilienceShock[key as keyof ResilienceShock]
  ).length;
  return decisionChanges + shockChanges;
}

function isCanonicalInput(input: WorkbenchRequest): boolean {
  return changedInputCount(input) === 0;
}

function emptyShock(): ResilienceShock {
  return {
    emergencyExpense: 0,
    incomeLossPercent: 0,
    incomeLossMonths: 0,
    employerStockDecline: 0,
    broadMarketDecline: 0,
    spendingIncreaseRate: 0
  };
}

function sameShock(left: ResilienceShock, right: ResilienceShock): boolean {
  return (Object.keys(left) as (keyof ResilienceShock)[]).every((key) => left[key] === right[key]);
}

function WorkbenchControl({
  label,
  value,
  min,
  max,
  step,
  scale = 1,
  prefix,
  suffix,
  format,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  scale?: number;
  prefix?: string;
  suffix?: string;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="workbench-control">
      <span>
        <strong>{label}</strong>
        <output>{format(value)}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="workbench-number">
        {prefix ? <i>{prefix}</i> : null}
        <input
          type="number"
          min={min * scale}
          max={max * scale}
          step={step * scale}
          value={Number((value * scale).toFixed(4))}
          onChange={(event) => onChange(Number(event.target.value) / scale)}
        />
        {suffix ? <i>{suffix}</i> : null}
      </span>
    </label>
  );
}

function WorkbenchScenarioCard({
  scenario,
  leading
}: {
  scenario: ScenarioResult;
  leading: boolean;
}) {
  return (
    <article className={`workbench-scenario ${leading ? "leading" : ""}`}>
      <div className="workbench-scenario-icon">
        {scenario.strategy === "RENTAL" ? (
          <Home />
        ) : scenario.strategy === "PORTFOLIO" ? (
          <TrendingUp />
        ) : (
          <CheckCircle2 />
        )}
      </div>
      <div className="workbench-scenario-copy">
        <span>{scenario.strategy.replaceAll("_", " ")}</span>
        <strong>{scenario.label}</strong>
        <small>
          {scenario.capitalUse.feasible
            ? `${fullCurrency.format(scenario.capitalUse.deployed)} deployed`
            : `${fullCurrency.format(scenario.capitalUse.required - scenario.capitalUse.available)} shortfall`}
        </small>
      </div>
      <MiniLine
        values={scenario.timeline.map((year) => year.liquidAssets)}
        tone={
          scenario.strategy === "RENTAL"
            ? "coral"
            : scenario.strategy === "PORTFOLIO"
              ? "teal"
              : "gold"
        }
      />
      <dl>
        <div>
          <dt>FI success</dt>
          <dd>{percent.format(scenario.successProbability)}</dd>
        </div>
        <div>
          <dt>FI age</dt>
          <dd>{scenario.fiAge ?? "—"}</dd>
        </div>
        <div>
          <dt>Net worth</dt>
          <dd>{currency.format(scenario.projectedNetWorth)}</dd>
        </div>
        <div>
          <dt>Annual cash flow</dt>
          <dd>{fullCurrency.format(scenario.annualCashFlow)}</dd>
        </div>
      </dl>
      <span className={`workbench-verdict ${scenario.capitalUse.feasible ? "pass" : "fail"}`}>
        {scenario.capitalUse.feasible ? <CheckCircle2 /> : <AlertTriangle />}
        {scenario.capitalUse.feasible ? "Capital feasible" : "Capital constraint breached"}
      </span>
      {leading ? <Badge tone="good">Leading</Badge> : null}
    </article>
  );
}

function ResilienceResults({
  result,
  calculating
}: {
  result: WorkbenchResponse;
  calculating: boolean;
}) {
  const { baseline, stressed, scoreDelta, optionsLost } = result.resilience;
  const hasStress = scoreDelta !== 0 || stressed.metrics.shockFundingNeed > 0;

  return (
    <>
      <div className="workbench-results-heading resilience-heading">
        <div>
          <span className="eyebrow">Household Optionality Score</span>
          <h2>
            {hasStress ? "Options after the selected shock" : "Prepared before uncertainty arrives"}
          </h2>
          <p>{result.resilience.definition}</p>
        </div>
        <div className="workbench-run-state">
          <span className={calculating ? "calculation-pulse" : "calculation-ready"} />
          {calculating ? "Recalculating" : "Current"}
        </div>
      </div>

      <article
        className={`optionality-hero band-${stressed.band.toLowerCase()} ${stressed.breaches.length ? "has-breaches" : ""}`}
      >
        <div
          className="optionality-score-dial"
          aria-label={`Optionality score ${stressed.score} out of 100`}
        >
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="score-dial-track" cx="60" cy="60" r="48" pathLength="100" />
            <circle
              className="score-dial-value"
              cx="60"
              cy="60"
              r="48"
              pathLength="100"
              strokeDasharray={`${stressed.score} 100`}
            />
          </svg>
          <span>
            <strong>{stressed.score}</strong>
            <small>/ 100</small>
          </span>
        </div>
        <div className="optionality-hero-copy">
          <span className="optionality-band">{stressed.band}</span>
          <h3>
            {hasStress
              ? `${Math.abs(scoreDelta).toFixed(1)} points under baseline`
              : "All signed floors preserved"}
          </h3>
          <p>
            {stressed.breaches.length
              ? `${stressed.breaches.length} client-approved ${stressed.breaches.length === 1 ? "boundary is" : "boundaries are"} breached under this stress.`
              : "The household absorbs this stress without modeled credit or loss of its approved controls."}
          </p>
          <div className="optionality-baseline">
            <span>
              Before shock <strong>{baseline.score}</strong>
            </span>
            <ArrowRight />
            <span>
              After shock <strong>{stressed.score}</strong>
            </span>
            {optionsLost ? (
              <Badge tone="warn">
                {optionsLost} option{optionsLost === 1 ? "" : "s"} lost
              </Badge>
            ) : null}
          </div>
        </div>
      </article>

      <div className="optionality-metric-grid">
        <ResilienceMetric
          icon={<Activity />}
          label="Credit-free runway"
          value={`${stressed.metrics.creditFreeRunwayMonths.toFixed(1)} mo`}
          detail={`Floor ${stressed.policy.minimumCreditFreeRunwayMonths} months`}
          passed={
            stressed.metrics.creditFreeRunwayMonths >= stressed.policy.minimumCreditFreeRunwayMonths
          }
        />
        <ResilienceMetric
          icon={<WalletCards />}
          label="Accessible liquidity"
          value={currency.format(stressed.metrics.accessibleLiquidityAfter)}
          detail={`${currency.format(baseline.metrics.accessibleLiquidityAfter)} before shock`}
          passed={
            stressed.metrics.accessibleLiquidityAfter >=
            result.clientConstitution.constraints.liquidityFloor
          }
        />
        <ResilienceMetric
          icon={<CloudLightning />}
          label="External credit"
          value={currency.format(stressed.metrics.creditRequired)}
          detail={`${currency.format(stressed.metrics.shockFundingNeed)} funding need`}
          passed={stressed.metrics.creditRequired <= stressed.policy.maximumShockCreditRequired}
        />
        <ResilienceMetric
          icon={<BriefcaseBusiness />}
          label="Options preserved"
          value={`${stressed.metrics.feasibleOptions} / ${stressed.optionTests.length}`}
          detail={`${currency.format(stressed.metrics.availableDecisionCapital)} capital remains`}
          passed={stressed.metrics.feasibleOptions >= stressed.policy.minimumFeasibleOptions}
        />
      </div>

      <section className="panel optionality-components">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Transparent calculation</span>
            <h2>Six weighted controls</h2>
          </div>
          <span className="method-chip">v1 deterministic</span>
        </div>
        <div className="optionality-component-list">
          {stressed.components.map((component) => (
            <div className="optionality-component" key={component.id}>
              <span
                className={component.passed ? "component-status pass" : "component-status fail"}
              >
                {component.passed ? <CheckCircle2 /> : <AlertTriangle />}
              </span>
              <div>
                <span>
                  <strong>{component.label}</strong>
                  <small>{Math.round(component.weight * 100)}% weight</small>
                </span>
                <div className="component-meter">
                  <i style={{ width: `${component.score}%` }} />
                </div>
                <p>{component.explanation}</p>
              </div>
              <strong className="component-score">{component.score}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel optionality-options">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Optionality ledger</span>
            <h2>Which decisions remain available?</h2>
          </div>
          <Badge
            tone={
              stressed.metrics.feasibleOptions >= stressed.policy.minimumFeasibleOptions
                ? "good"
                : "warn"
            }
          >
            {stressed.metrics.feasibleOptions} feasible
          </Badge>
        </div>
        <div className="optionality-option-list">
          {stressed.optionTests.map((option) => (
            <div
              className={
                option.feasible ? "optionality-option feasible" : "optionality-option blocked"
              }
              key={option.id}
            >
              <span>{option.feasible ? <CheckCircle2 /> : <LockKeyhole />}</span>
              <div>
                <strong>{option.label}</strong>
                <small>{currency.format(option.capitalRequired)} required</small>
              </div>
              <b>{option.feasible ? "Available" : `${currency.format(option.shortfall)} short`}</b>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ResilienceMetric({
  icon,
  label,
  value,
  detail,
  passed
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  passed: boolean;
}) {
  return (
    <article className={`optionality-metric ${passed ? "pass" : "fail"}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function ResilienceRail({ result }: { result: WorkbenchResponse }) {
  const { stressed, firstFailure } = result.resilience;
  const publicContext = result.publicContext;

  return (
    <>
      <article className="panel resilience-break-card">
        <span className="eyebrow">Stress diagnosis</span>
        <div className="signal-icon">
          <CloudLightning />
        </div>
        <h2>{firstFailure?.label ?? "No control breaks"}</h2>
        <p>
          {firstFailure?.explanation ??
            "The selected stress remains inside every signed household boundary."}
        </p>
        <div className="resilience-break-value">
          <span>Lowest component</span>
          <strong>{firstFailure?.score ?? 100}/100</strong>
        </div>
      </article>

      <article className="panel resilience-policy-card">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Client Constitution</span>
            <h2>Executable resilience floors</h2>
          </div>
          <ShieldCheck />
        </div>
        <PolicyRow
          label="Optionality score"
          actual={stressed.score}
          target={stressed.policy.minimumScore}
          suffix=""
        />
        <PolicyRow
          label="Credit-free runway"
          actual={stressed.metrics.creditFreeRunwayMonths}
          target={stressed.policy.minimumCreditFreeRunwayMonths}
          suffix=" mo"
        />
        <PolicyRow
          label="External credit"
          actual={stressed.metrics.creditRequired}
          target={stressed.policy.maximumShockCreditRequired}
          suffix=""
          currencyValue
          inverse
        />
        <PolicyRow
          label="Feasible options"
          actual={stressed.metrics.feasibleOptions}
          target={stressed.policy.minimumFeasibleOptions}
          suffix=""
        />
      </article>

      <article className="panel public-resilience-card">
        <div className="public-context-header">
          <div>
            <span className="eyebrow">External context · July 2026</span>
            <h2>Consumer resilience</h2>
          </div>
          <strong>{publicContext.score}</strong>
        </div>
        <p>{publicContext.methodology}</p>
        <dl>
          <div>
            <dt>Expect to rely on credit</dt>
            <dd>{publicContext.creditReliancePercent}%</dd>
          </div>
          <div>
            <dt>Can cover $1,000 in cash</dt>
            <dd>{publicContext.thousandDollarCashCoveragePercent}%</dd>
          </div>
          <div>
            <dt>Survey sample</dt>
            <dd>{publicContext.sampleSize.toLocaleString()}</dd>
          </div>
        </dl>
        <div className="public-context-boundary">
          <AlertTriangle />
          <span>{publicContext.usageBoundary}</span>
        </div>
        <a href={publicContext.sourceUrl} target="_blank" rel="noreferrer">
          View source and methodology <ExternalLink />
        </a>
      </article>
    </>
  );
}

function PolicyRow({
  label,
  actual,
  target,
  suffix,
  currencyValue = false,
  inverse = false
}: {
  label: string;
  actual: number;
  target: number;
  suffix: string;
  currencyValue?: boolean;
  inverse?: boolean;
}) {
  const passed = inverse ? actual <= target : actual >= target;
  const formatValue = (value: number) =>
    currencyValue ? currency.format(value) : `${value}${suffix}`;
  return (
    <div className={`resilience-policy-row ${passed ? "pass" : "fail"}`}>
      <span>{passed ? <CheckCircle2 /> : <AlertTriangle />}</span>
      <div>
        <strong>{label}</strong>
        <small>Signed floor {formatValue(target)}</small>
      </div>
      <b>{formatValue(actual)}</b>
    </div>
  );
}

function ImpactRow({ changed, label }: { changed: boolean; label: string }) {
  return (
    <div className={changed ? "impact-row changed" : "impact-row"}>
      {changed ? <AlertTriangle /> : <CheckCircle2 />}
      <span>{label}</span>
      <strong>{changed ? "Stress" : "Canonical"}</strong>
    </div>
  );
}

function leadingScenario(scenarios: readonly ScenarioResult[]): ScenarioResult | undefined {
  return [...scenarios]
    .filter((scenario) => scenario.capitalUse.feasible)
    .sort((left, right) => right.successProbability - left.successProbability)[0];
}
