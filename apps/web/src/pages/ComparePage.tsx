import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Fingerprint,
  Gauge,
  GitBranch,
  Home,
  ShieldCheck,
  Scale,
  TrendingUp
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  ClientConstitution,
  FinancialEvent,
  HouseholdResilienceComparison,
  ResilienceShock,
  ScenarioComparisonResponse,
  ScenarioComparisonRequest,
  StrategyCompilation
} from "@fidt/contracts";
import { Badge, ErrorState, MiniLine } from "../components/Ui";
import { api } from "../lib/api";
import { currency, fullCurrency, percent } from "../lib/format";

export function ComparePage() {
  const { householdId = "" } = useParams();
  const [search] = useSearchParams();
  const triggerEventId = search.get("event") ?? "";
  const compilationId = search.get("compilation") ?? "";
  const focusedCandidateId = search.get("candidate") ?? "";
  const preset = decisionPreset(triggerEventId, search);
  const promotedFromWorkbench = search.get("source") === "workbench";
  const promotedFromCompiler = search.get("source") === "compiler" && Boolean(compilationId);
  return (
    <CompareWorkflow
      key={`${householdId}:${search.toString()}`}
      householdId={householdId}
      triggerEventId={triggerEventId}
      compilationId={compilationId}
      focusedCandidateId={focusedCandidateId}
      preset={preset}
      promotedFromWorkbench={promotedFromWorkbench}
      promotedFromCompiler={promotedFromCompiler}
    />
  );
}

function CompareWorkflow({
  householdId,
  triggerEventId,
  compilationId,
  focusedCandidateId,
  preset,
  promotedFromWorkbench,
  promotedFromCompiler
}: {
  householdId: string;
  triggerEventId: string;
  compilationId: string;
  focusedCandidateId: string;
  preset: DecisionPreset;
  promotedFromWorkbench: boolean;
  promotedFromCompiler: boolean;
}) {
  const [capital, setCapital] = useState(preset.capital);
  const [purchasePrice, setPurchasePrice] = useState(preset.purchasePrice);
  const [rent, setRent] = useState(preset.rent);
  const [mortgageRate, setMortgageRate] = useState(preset.mortgageRate);
  const [propertyHours, setPropertyHours] = useState(preset.propertyHours);
  const [triggerEvent, setTriggerEvent] = useState<FinancialEvent | null>(null);
  const [constitution, setConstitution] = useState<ClientConstitution | null>(null);
  const [compilation, setCompilation] = useState<StrategyCompilation | null>(null);
  const [result, setResult] = useState<ScenarioComparisonResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    void api.household(householdId).then((data) => {
      setConstitution(data.clientConstitution);
      setTriggerEvent(data.events.find((event) => event.id === triggerEventId) ?? null);
    });
  }, [householdId, triggerEventId]);
  useEffect(() => {
    if (!compilationId) return;
    void api
      .strategyCompilation(compilationId)
      .then(setCompilation)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [compilationId]);
  const effectiveCapital = compilation?.promotion.decisionCapital ?? capital;
  const focusedCandidate = compilation?.candidates.find(
    (candidate) => candidate.id === focusedCandidateId
  );
  const request = useMemo<ScenarioComparisonRequest>(
    () => ({
      decisionCapital: effectiveCapital,
      ...(hasActiveShock(preset.resilienceShock)
        ? {
            preShockDecisionCapital: preset.preShockDecisionCapital,
            resilienceShock: preset.resilienceShock
          }
        : {}),
      ...(triggerEventId ? { triggerEventId } : {}),
      ...(compilationId ? { compilationId } : {}),
      strategies: compilation
        ? [...compilation.promotion.strategies]
        : [
            {
              type: "RENTAL",
              rental: {
                purchasePrice,
                downPaymentPercent: 0.25,
                closingCostPercent: 0.03,
                mortgageRate: mortgageRate / 100,
                mortgageTermYears: 30,
                monthlyRent: rent,
                vacancyRate: 0.06,
                managementRate: 0.08,
                annualPropertyTax: purchasePrice * 0.013,
                annualInsurance: purchasePrice * 0.0042,
                annualMaintenanceRate: 0.01,
                annualCapexRate: 0.0075,
                appreciationRate: 0.03,
                rentGrowthRate: 0.025,
                sellingCostPercent: 0.06,
                hoursPerMonth: propertyHours,
                hourlyTimeValue: 90
              }
            },
            {
              type: "PORTFOLIO",
              portfolio: {
                initialInvestment: capital,
                annualContribution: 0,
                equityAllocation: 0.75,
                bondAllocation: 0.2,
                cashAllocation: 0.05,
                fundExpenseRate: 0.0012
              }
            },
            {
              type: "DEBT_PAYDOWN",
              debt: { liabilityId: "liability-student", lumpSum: Math.min(42_000, capital) }
            }
          ]
    }),
    [
      capital,
      compilation,
      compilationId,
      effectiveCapital,
      purchasePrice,
      rent,
      mortgageRate,
      propertyHours,
      triggerEventId,
      preset
    ]
  );
  const run = () => {
    setLoading(true);
    setError("");
    void api
      .compare(householdId, request)
      .then(setResult)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      )
      .finally(() => setLoading(false));
  };

  return (
    <>
      <section className="hero-row compact">
        <div>
          <span className="eyebrow coral">
            {promotedFromCompiler
              ? "Decision lab · Compiler-locked strategy set"
              : "Decision lab · Same capital, same horizon"}
          </span>
          <h1>
            {promotedFromCompiler
              ? "How should the next RSU vest be deployed?"
              : "Rental or financial freedom?"}
          </h1>
          <p>
            {promotedFromCompiler
              ? "Rerun every constitution-eligible strategy under one assumption version, with the selected candidate focused for human review—not automatically recommended."
              : "Compare liquidity, modeled outcomes, client workload, risk, and advisor economics—not just headline return."}
          </p>
        </div>
        <div className="trust-stamp small">
          <Calculator />
          <div>
            <strong>TypeScript calculation engine</strong>
            <span>AI cannot alter the numbers</span>
          </div>
        </div>
      </section>
      {compilation ? (
        <section className="decision-trigger compiler-promotion-trigger">
          <span className="timeline-dot severity-low" />
          <div>
            <span className="eyebrow">Promoted from Strategy Compiler</span>
            <strong>{compilation.opportunity.title}</strong>
            <p>
              {compilation.promotion.strategies.length} eligible strategies locked by{" "}
              {compilation.compilerVersion}
              {focusedCandidate ? ` · Advisor focus: ${focusedCandidate.label}` : ""}.
            </p>
          </div>
          <Badge tone="good">Compiled</Badge>
        </section>
      ) : triggerEvent ? (
        <section className="decision-trigger" aria-label="Triggering decision event">
          <span className={`timeline-dot severity-${triggerEvent.severity.toLowerCase()}`} />
          <div>
            <span className="eyebrow">Triggered by household event</span>
            <strong>{triggerEvent.title}</strong>
            <p>{triggerEvent.description}</p>
          </div>
          <Badge tone={triggerEvent.severity === "HIGH" ? "danger" : "warn"}>
            {triggerEvent.severity}
          </Badge>
        </section>
      ) : promotedFromWorkbench ? (
        <section className="decision-trigger workbench-promotion" aria-label="Workbench promotion">
          <span className="timeline-dot severity-low" />
          <div>
            <span className="eyebrow">Promoted from Advisor Workbench</span>
            <strong>Session assumptions ready for governed review</strong>
            <p>
              No record exists yet. Running this comparison restores the signed Client Constitution
              and creates a versioned audit event
              {hasActiveShock(preset.resilienceShock)
                ? " with the selected resilience stress locked into the run."
                : "."}
            </p>
          </div>
          <Badge tone="info">Unsaved</Badge>
        </section>
      ) : null}
      <section className="compare-layout">
        <aside className="panel assumption-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Decision inputs</span>
              <h2>{compilation ? "Compiled assumptions" : "Planning assumptions"}</h2>
            </div>
          </div>
          {compilation ? (
            <div className="compiled-decision-inputs">
              <div className="input-scope shared">
                <strong>Locked by Strategy Compiler</strong>
                <span>
                  Evidence, shared capital, and strategy definitions cannot drift during review.
                </span>
              </div>
              <dl>
                <div>
                  <dt>Confirmed gross vest</dt>
                  <dd>{fullCurrency.format(compilation.grossDecisionValue)}</dd>
                </div>
                <div>
                  <dt>Modeled withholding</dt>
                  <dd>{percent.format(compilation.modeledWithholdingRate)}</dd>
                </div>
                <div>
                  <dt>Deployable capital</dt>
                  <dd>{fullCurrency.format(compilation.decisionCapital)}</dd>
                </div>
                <div>
                  <dt>Eligible alternatives</dt>
                  <dd>{compilation.promotion.strategies.length}</dd>
                </div>
              </dl>
              <div className="compiled-strategy-mini-list">
                {compilation.candidates.map((candidate) => (
                  <span
                    className={`${candidate.status.toLowerCase()} ${candidate.id === focusedCandidate?.id ? "focused" : ""}`}
                    key={candidate.id}
                  >
                    <GitBranch size={12} />
                    <b>{candidate.label}</b>
                    <small>
                      {candidate.id === focusedCandidate?.id
                        ? "Advisor focus"
                        : candidate.status === "REJECTED"
                          ? "Rejected"
                          : candidate.dominance.replaceAll("_", " ")}
                    </small>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="input-scope shared">
                <strong>Shared across every strategy</strong>
                <span>Controls Portfolio funding, Debt capacity, and Rental feasibility.</span>
              </div>
              <Input
                label="Decision capital"
                hint="Affects all three alternatives"
                prefix="$"
                value={capital}
                onChange={setCapital}
                step={1000}
              />
              <div className="input-scope rental-only">
                <strong>Rental-only underwriting</strong>
                <span>These values should change only the Rental scenario.</span>
              </div>
              <Input
                label="Rental purchase price"
                hint="Rental only"
                prefix="$"
                value={purchasePrice}
                onChange={setPurchasePrice}
                step={5000}
              />
              <Input
                label="Monthly market rent"
                hint="Rental only"
                prefix="$"
                value={rent}
                onChange={setRent}
                step={50}
              />
              <Input
                label="Mortgage rate"
                hint="Rental only"
                suffix="%"
                value={mortgageRate}
                onChange={setMortgageRate}
                step={0.05}
              />
              <Input
                label="Property workload"
                hint="Rental only"
                suffix="hr/mo"
                value={propertyHours}
                onChange={setPropertyHours}
                step={1}
              />
              {hasActiveShock(preset.resilienceShock) ? (
                <div className="resilience-promotion-summary">
                  <div>
                    <ShieldCheck size={16} />
                    <strong>Resilience stress locked</strong>
                  </div>
                  <span>
                    {preset.resilienceShock.incomeLossMonths} months ·{" "}
                    {percent.format(preset.resilienceShock.incomeLossPercent)} income reduction
                  </span>
                  <span>
                    {fullCurrency.format(preset.resilienceShock.emergencyExpense)} emergency ·{" "}
                    {percent.format(preset.resilienceShock.broadMarketDecline)} market decline
                  </span>
                  <small>
                    Pre-shock decision capital:{" "}
                    {fullCurrency.format(preset.preShockDecisionCapital)}
                  </small>
                </div>
              ) : null}
            </>
          )}
          {constitution ? <ConstitutionCard constitution={constitution} /> : null}
          <div className="assumption-note">
            <AlertTriangle size={16} />
            <p>
              Tax consequences, transaction-specific financing, and legal review are deliberately
              outside this demo.
            </p>
          </div>
          <button
            className="button primary full"
            onClick={run}
            disabled={loading || (promotedFromCompiler && !compilation)}
          >
            {loading
              ? compilation
                ? "Running locked strategy set…"
                : "Running 3,000 paths…"
              : compilation
                ? `Run locked ${compilation.promotion.strategies.length}-strategy comparison`
                : "Run versioned comparison"}
            <ArrowRight size={16} />
          </button>
        </aside>
        <div className="compare-main">
          {error ? <ErrorState message={error} retry={run} /> : null}
          {!result && !error ? (
            <div className="empty-comparison">
              {compilation ? <GitBranch /> : <Scale />}
              <h2>{compilation ? "Rerun the compiled frontier" : "Make the tradeoffs visible"}</h2>
              <p>
                {compilation
                  ? "Every eligible RSU strategy will be recalculated from its locked allocation. The focused option is a review lens—not a recommendation."
                  : "Run the model to calculate rental cash flow and DSCR, a seeded portfolio simulation, and debt-paydown economics under one assumption set."}
              </p>
              <div>
                {compilation ? (
                  compilation.promotion.strategies.slice(0, 3).map((strategy) => (
                    <span key={strategy.rsuAction?.planType}>
                      <GitBranch />
                      {strategy.rsuAction?.planType.replaceAll("_", " ")}
                    </span>
                  ))
                ) : (
                  <>
                    <span>
                      <Home />
                      Rental property
                    </span>
                    <span>
                      <TrendingUp />
                      Diversified portfolio
                    </span>
                    <span>
                      <CheckCircle2 />
                      Debt reduction
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : null}
          {result ? (
            <ScenarioResults
              result={result}
              householdId={householdId}
              focusedPlanType={focusedCandidate?.planType ?? null}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

function ScenarioResults({
  result,
  householdId,
  focusedPlanType
}: {
  result: ScenarioComparisonResponse;
  householdId: string;
  focusedPlanType: string | null;
}) {
  const leading = [...result.scenarios]
    .filter((scenario) => scenario.capitalUse.feasible)
    .sort((a, b) => b.successProbability - a.successProbability)[0];
  return (
    <>
      <div className="result-banner">
        <div>
          <Badge tone="good">Model run complete</Badge>
          <strong>{leading?.label} leads on modeled success</strong>
          <span>Run {result.runId.slice(0, 8)} · Assumptions locked to this comparison</span>
        </div>
        <Link
          className="button primary"
          to={`/households/${householdId}/recommendation?run=${result.runId}`}
        >
          Draft recommendation
          <ArrowRight size={16} />
        </Link>
      </div>
      {result.resilience ? <GovernedResilienceResult resilience={result.resilience} /> : null}
      <div className="scenario-grid">
        {result.scenarios.map((scenario) => {
          const advisorFocused = scenario.calculations.planType === focusedPlanType;
          return (
            <article
              className={`scenario-card ${scenario.id === leading?.id ? "leading" : ""} ${advisorFocused ? "advisor-focused" : ""}`}
              key={scenario.id}
            >
              <header>
                <div>
                  <span className="scenario-icon">
                    {scenario.strategy === "RENTAL" ? (
                      <Home />
                    ) : scenario.strategy === "PORTFOLIO" ? (
                      <TrendingUp />
                    ) : scenario.strategy === "RSU_ACTION" ? (
                      <GitBranch />
                    ) : (
                      <CheckCircle2 />
                    )}
                  </span>
                  <div>
                    <span>{scenario.strategy.replace("_", " ")}</span>
                    <h2>{scenario.label}</h2>
                  </div>
                </div>
                <div className="scenario-badge-stack">
                  {advisorFocused ? <Badge tone="info">Advisor focus</Badge> : null}
                  {scenario.id === leading?.id ? <Badge tone="good">Leading model</Badge> : null}
                </div>
              </header>
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
              <dl className="scenario-stats">
                <div>
                  <dt>
                    {scenario.capitalUse.feasible ? "Shared capital used" : "Capital required"}
                  </dt>
                  <dd>{fullCurrency.format(scenario.capitalUse.deployed)}</dd>
                </div>
                <div>
                  <dt>Capital remaining</dt>
                  <dd>{fullCurrency.format(scenario.capitalUse.residual)}</dd>
                </div>
                <div>
                  <dt>Modeled FI success</dt>
                  <dd>{percent.format(scenario.successProbability)}</dd>
                </div>
                <div>
                  <dt>FI age</dt>
                  <dd>{scenario.fiAge ?? "—"}</dd>
                </div>
                <div>
                  <dt>Horizon net worth</dt>
                  <dd>{currency.format(scenario.projectedNetWorth)}</dd>
                </div>
                <div>
                  <dt>Annual cash flow</dt>
                  <dd>{fullCurrency.format(scenario.annualCashFlow)}</dd>
                </div>
                <div>
                  <dt>Client time cost</dt>
                  <dd>{fullCurrency.format(scenario.clientTimeCost)}</dd>
                </div>
                <div>
                  <dt>1st-year advisory fee</dt>
                  <dd>{fullCurrency.format(scenario.firstYearAdvisoryFee)}</dd>
                </div>
              </dl>
              <div className={`capital-verdict ${scenario.capitalUse.feasible ? "pass" : "fail"}`}>
                {scenario.capitalUse.feasible ? <CheckCircle2 /> : <AlertTriangle />}
                <div>
                  <strong>
                    {scenario.capitalUse.feasible
                      ? "Within shared-capital constraint"
                      : `Capital shortfall: ${fullCurrency.format(scenario.capitalUse.required - scenario.capitalUse.available)}`}
                  </strong>
                  <span>{scenario.capitalUse.affectedInputs.join(" · ")}</span>
                </div>
              </div>
              <div className="risk-stack">
                {scenario.risks.length ? (
                  scenario.risks.map((risk) => (
                    <span key={risk.code}>
                      <AlertTriangle />
                      {risk.message}
                    </span>
                  ))
                ) : (
                  <span className="no-risk">
                    <CheckCircle2 />
                    No engine threshold breached
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {result.analysis ? <CounterfactualAnalysis analysis={result.analysis} /> : null}
      {result.conflicts.length ? (
        <div className="conflict-banner">
          <AlertTriangle />
          <div>
            <strong>Advisor compensation conflict detected</strong>
            {result.conflicts.map((conflict) => (
              <p key={conflict.code}>
                {conflict.message} Estimated annual difference:{" "}
                {fullCurrency.format(conflict.annualRevenueDifference)}.
              </p>
            ))}
            <p className="economics-explainer">
              This comparison includes advisory fees so we can detect when a client-first
              recommendation may also reduce assets under management and advisor revenue.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function GovernedResilienceResult({ resilience }: { resilience: HouseholdResilienceComparison }) {
  const stressed = resilience.stressed;
  return (
    <article className="governed-resilience-result">
      <div className="governed-resilience-score">
        <Gauge />
        <span>Household Optionality Score</span>
        <strong>{stressed.score.toFixed(1)}</strong>
        <Badge tone={stressed.breaches.length ? "warn" : "good"}>{stressed.band}</Badge>
      </div>
      <dl>
        <div>
          <dt>Score change</dt>
          <dd>{resilience.scoreDelta.toFixed(1)} pts</dd>
        </div>
        <div>
          <dt>Credit-free runway</dt>
          <dd>{stressed.metrics.creditFreeRunwayMonths.toFixed(1)} mo</dd>
        </div>
        <div>
          <dt>Capital preserved</dt>
          <dd>{fullCurrency.format(stressed.metrics.availableDecisionCapital)}</dd>
        </div>
        <div>
          <dt>Credit required</dt>
          <dd>{fullCurrency.format(stressed.metrics.creditRequired)}</dd>
        </div>
      </dl>
      <div className={`governed-resilience-status ${stressed.breaches.length ? "breach" : "pass"}`}>
        {stressed.breaches.length ? <AlertTriangle /> : <CheckCircle2 />}
        <div>
          <strong>
            {stressed.breaches.length
              ? `${stressed.breaches.length} signed resilience control(s) breached`
              : "All signed resilience controls preserved"}
          </strong>
          <span>
            This deterministic stress record will enter compliance review and the Decision Passport.
          </span>
        </div>
      </div>
    </article>
  );
}

interface DecisionPreset {
  capital: number;
  preShockDecisionCapital: number;
  purchasePrice: number;
  rent: number;
  mortgageRate: number;
  propertyHours: number;
  resilienceShock: ResilienceShock;
}

function decisionPreset(eventId: string, search: URLSearchParams): DecisionPreset {
  const fromWorkbench = search.get("source") === "workbench";
  if (fromWorkbench) {
    return {
      capital: queryNumber(search, "capital", 71_000, 1, 100_000_000),
      preShockDecisionCapital: queryNumber(search, "originalCapital", 71_000, 1, 100_000_000),
      purchasePrice: queryNumber(search, "price", 525_000, 1, 20_000_000),
      rent: queryNumber(search, "rent", 3_650, 0, 100_000),
      mortgageRate: queryNumber(search, "rate", 6.75, 0, 25),
      propertyHours: queryNumber(search, "hours", 6, 0, 80),
      resilienceShock: shockFromQuery(search)
    };
  }
  if (eventId === "event-rsu-vest") {
    return {
      capital: 71_000,
      preShockDecisionCapital: 71_000,
      purchasePrice: 525_000,
      rent: 3_650,
      mortgageRate: 6.75,
      propertyHours: 6,
      resilienceShock: emptyShock()
    };
  }
  if (eventId === "event-concentration") {
    return {
      capital: 292_000,
      preShockDecisionCapital: 292_000,
      purchasePrice: 625_000,
      rent: 4_100,
      mortgageRate: 6.75,
      propertyHours: 6,
      resilienceShock: emptyShock()
    };
  }
  return {
    capital: 147_000,
    preShockDecisionCapital: 147_000,
    purchasePrice: 525_000,
    rent: 3_650,
    mortgageRate: 6.75,
    propertyHours: 6,
    resilienceShock: emptyShock()
  };
}

function shockFromQuery(search: URLSearchParams): ResilienceShock {
  return {
    emergencyExpense: queryNumber(search, "shockEmergency", 0, 0, 10_000_000),
    incomeLossPercent: queryNumber(search, "shockIncome", 0, 0, 1),
    incomeLossMonths: queryNumber(search, "shockMonths", 0, 0, 36),
    employerStockDecline: queryNumber(search, "shockEmployer", 0, 0, 1),
    broadMarketDecline: queryNumber(search, "shockMarket", 0, 0, 1),
    spendingIncreaseRate: queryNumber(search, "shockSpending", 0, 0, 1)
  };
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

function hasActiveShock(shock: ResilienceShock): boolean {
  return Object.values(shock).some((value) => value > 0);
}

function queryNumber(
  search: URLSearchParams,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const value = Number(search.get(key));
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

function Input({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  step
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step: number;
}) {
  return (
    <label className="input-group">
      <span>
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
      <div>
        {prefix ? <span>{prefix}</span> : null}
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <span>{suffix}</span> : null}
      </div>
    </label>
  );
}

function ConstitutionCard({ constitution }: { constitution: ClientConstitution }) {
  return (
    <div className="constitution-card">
      <div>
        <ShieldCheck size={17} />
        <span>
          <strong>Client Constitution v{constitution.version}</strong>
          <small>Executable constraints locked to this run</small>
        </span>
      </div>
      <dl>
        <div>
          <dt>Liquidity floor</dt>
          <dd>{currency.format(constitution.constraints.liquidityFloor)}</dd>
        </div>
        <div>
          <dt>Employer stock</dt>
          <dd>≤ {percent.format(constitution.constraints.maxEmployerStockPercent)}</dd>
        </div>
        <div>
          <dt>Property workload</dt>
          <dd>≤ {constitution.constraints.maxRealEstateHoursPerMonth} hr/mo</dd>
        </div>
        <div>
          <dt>FI objective</dt>
          <dd>
            Age {constitution.constraints.targetFiAge} · ≥{" "}
            {percent.format(constitution.constraints.minimumFiSuccessProbability)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CounterfactualAnalysis({
  analysis
}: {
  analysis: NonNullable<ScenarioComparisonResponse["analysis"]>;
}) {
  return (
    <section className="counterfactual-panel panel">
      <header>
        <div>
          <span className="eyebrow coral">Counterfactual decision boundaries</span>
          <h2>What would have to change?</h2>
          <p>{analysis.definition}</p>
        </div>
        <Fingerprint />
      </header>
      <div className="boundary-grid">
        <article>
          <Gauge />
          <span>Mortgage crossover</span>
          <strong>
            {analysis.breakEvenMortgageRate === null
              ? "No crossover ≤ 20%"
              : `≤ ${percent.format(analysis.breakEvenMortgageRate)}`}
          </strong>
          <small>Rental matches {analysis.targetScenarioLabel}</small>
        </article>
        <article>
          <Home />
          <span>Market-rent crossover</span>
          <strong>
            {analysis.breakEvenMonthlyRent === null
              ? "No modeled crossover"
              : `≥ ${fullCurrency.format(analysis.breakEvenMonthlyRent)}/mo`}
          </strong>
          <small>Same assumptions and FI success threshold</small>
        </article>
        <article>
          <Scale />
          <span>Capital-feasible price</span>
          <strong>≤ {fullCurrency.format(analysis.maxAffordablePurchasePrice)}</strong>
          <small>Down payment plus closing costs fit shared capital</small>
        </article>
      </div>
      <div className="sensitivity-section">
        <div>
          <strong>3 × 3 sensitivity surface</strong>
          <span>Annual rental cash flow as rate and rent move</span>
        </div>
        <div className="sensitivity-grid">
          {analysis.sensitivity.map((cell) => (
            <div
              className={cell.rentalLeads ? "sensitivity-cell leads" : "sensitivity-cell"}
              key={`${cell.mortgageRate}-${cell.monthlyRent}`}
            >
              <small>
                {percent.format(cell.mortgageRate)} · {currency.format(cell.monthlyRent)} rent
              </small>
              <strong>{fullCurrency.format(cell.annualCashFlow)}</strong>
              <span>{cell.rentalLeads ? "Rental leads" : "Alternative leads"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
