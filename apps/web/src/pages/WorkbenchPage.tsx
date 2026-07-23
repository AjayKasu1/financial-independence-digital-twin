import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  Home,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ScenarioResult, WorkbenchRequest, WorkbenchResponse } from "@fidt/contracts";
import { Badge, ErrorState, MiniLine } from "../components/Ui";
import { api } from "../lib/api";
import { currency, fullCurrency, percent } from "../lib/format";

const householdId = "household-patel-demo";

const canonicalInputs: WorkbenchRequest = {
  rsuVestAmount: 71_000,
  employerStockPercent: 0.22,
  liquidityFloor: 150_000,
  targetFiAge: 52,
  maxRealEstateHoursPerMonth: 6,
  rentalPurchasePrice: 525_000,
  monthlyMarketRent: 3_650,
  mortgageRate: 0.0675
};

export function WorkbenchPage() {
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
  const promotionUrl = useMemo(() => {
    const search = new URLSearchParams({
      source: "workbench",
      capital: String(inputs.rsuVestAmount),
      price: String(inputs.rentalPurchasePrice),
      rent: String(inputs.monthlyMarketRent),
      rate: String(inputs.mortgageRate * 100),
      hours: String(inputs.maxRealEstateHoursPerMonth)
    });
    return `/households/${householdId}/compare?${search.toString()}`;
  }, [inputs]);

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

      <section className="workbench-layout">
        <aside className="panel workbench-controls">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Editable assumptions</span>
              <h2>Live what-if controls</h2>
            </div>
            {calculating ? <span className="calculation-pulse" aria-label="Recalculating" /> : null}
          </div>

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
        </aside>

        <main className={`workbench-results ${calculating ? "is-calculating" : ""}`}>
          {error ? <ErrorState message={error} /> : null}
          {result ? (
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
          ) : error ? null : (
            <div className="workbench-loading">
              <Gauge />
              <strong>Building the canonical comparison…</strong>
              <span>AI is not used for these calculations.</span>
            </div>
          )}
        </main>

        <aside className="workbench-rail">
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
            <ImpactRow changed={inputs.employerStockPercent > 0.25} label="Employer-stock limit" />
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

          <div className="workbench-actions">
            <Link className="button primary full" to={promotionUrl}>
              Promote to governed comparison
              <ArrowRight size={16} />
            </Link>
            <button className="button secondary full" onClick={reset} disabled={!changedInputs}>
              <RotateCcw size={15} /> Reset canonical household
            </button>
            <small>
              Promotion restores the signed Constitution and requires an explicit versioned run.
            </small>
          </div>
        </aside>
      </section>
    </>
  );
}

function changedInputCount(input: WorkbenchRequest): number {
  return Object.entries(input).filter(
    ([key, value]) => value !== canonicalInputs[key as keyof WorkbenchRequest]
  ).length;
}

function isCanonicalInput(input: WorkbenchRequest): boolean {
  return changedInputCount(input) === 0;
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
