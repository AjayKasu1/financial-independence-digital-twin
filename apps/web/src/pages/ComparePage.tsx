import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Fingerprint,
  Gauge,
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
  ScenarioComparisonResponse,
  ScenarioComparisonRequest
} from "@fidt/contracts";
import { Badge, ErrorState, MiniLine } from "../components/Ui";
import { api } from "../lib/api";
import { currency, fullCurrency, percent } from "../lib/format";

export function ComparePage() {
  const { householdId = "" } = useParams();
  const [search] = useSearchParams();
  const triggerEventId = search.get("event") ?? "";
  const preset = decisionPreset(triggerEventId, search);
  const promotedFromWorkbench = search.get("source") === "workbench";
  return (
    <CompareWorkflow
      key={`${householdId}:${search.toString()}`}
      householdId={householdId}
      triggerEventId={triggerEventId}
      preset={preset}
      promotedFromWorkbench={promotedFromWorkbench}
    />
  );
}

function CompareWorkflow({
  householdId,
  triggerEventId,
  preset,
  promotedFromWorkbench
}: {
  householdId: string;
  triggerEventId: string;
  preset: DecisionPreset;
  promotedFromWorkbench: boolean;
}) {
  const [capital, setCapital] = useState(preset.capital);
  const [purchasePrice, setPurchasePrice] = useState(preset.purchasePrice);
  const [rent, setRent] = useState(preset.rent);
  const [mortgageRate, setMortgageRate] = useState(preset.mortgageRate);
  const [propertyHours, setPropertyHours] = useState(preset.propertyHours);
  const [triggerEvent, setTriggerEvent] = useState<FinancialEvent | null>(null);
  const [constitution, setConstitution] = useState<ClientConstitution | null>(null);
  const [result, setResult] = useState<ScenarioComparisonResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    void api.household(householdId).then((data) => {
      setConstitution(data.clientConstitution);
      setTriggerEvent(data.events.find((event) => event.id === triggerEventId) ?? null);
    });
  }, [householdId, triggerEventId]);
  const request = useMemo<ScenarioComparisonRequest>(
    () => ({
      decisionCapital: capital,
      ...(triggerEventId ? { triggerEventId } : {}),
      strategies: [
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
    [capital, purchasePrice, rent, mortgageRate, propertyHours, triggerEventId]
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
          <span className="eyebrow coral">Decision lab · Same capital, same horizon</span>
          <h1>Rental or financial freedom?</h1>
          <p>
            Compare liquidity, modeled outcomes, client workload, risk, and advisor economics—not
            just headline return.
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
      {triggerEvent ? (
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
              and creates a versioned audit event.
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
              <h2>Planning assumptions</h2>
            </div>
          </div>
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
          {constitution ? <ConstitutionCard constitution={constitution} /> : null}
          <div className="assumption-note">
            <AlertTriangle size={16} />
            <p>
              Tax consequences, transaction-specific financing, and legal review are deliberately
              outside this demo.
            </p>
          </div>
          <button className="button primary full" onClick={run} disabled={loading}>
            {loading ? "Running 3,000 paths…" : "Run versioned comparison"}
            <ArrowRight size={16} />
          </button>
        </aside>
        <div className="compare-main">
          {error ? <ErrorState message={error} retry={run} /> : null}
          {!result && !error ? (
            <div className="empty-comparison">
              <Scale />
              <h2>Make the tradeoffs visible</h2>
              <p>
                Run the model to calculate rental cash flow and DSCR, a seeded portfolio simulation,
                and debt-paydown economics under one assumption set.
              </p>
              <div>
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
              </div>
            </div>
          ) : null}
          {result ? <ScenarioResults result={result} householdId={householdId} /> : null}
        </div>
      </section>
    </>
  );
}

function ScenarioResults({
  result,
  householdId
}: {
  result: ScenarioComparisonResponse;
  householdId: string;
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
      <div className="scenario-grid">
        {result.scenarios.map((scenario) => (
          <article
            className={`scenario-card ${scenario.id === leading?.id ? "leading" : ""}`}
            key={scenario.id}
          >
            <header>
              <div>
                <span className="scenario-icon">
                  {scenario.strategy === "RENTAL" ? (
                    <Home />
                  ) : scenario.strategy === "PORTFOLIO" ? (
                    <TrendingUp />
                  ) : (
                    <CheckCircle2 />
                  )}
                </span>
                <div>
                  <span>{scenario.strategy.replace("_", " ")}</span>
                  <h2>{scenario.label}</h2>
                </div>
              </div>
              {scenario.id === leading?.id ? <Badge tone="good">Leading model</Badge> : null}
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
                <dt>{scenario.capitalUse.feasible ? "Shared capital used" : "Capital required"}</dt>
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
        ))}
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

interface DecisionPreset {
  capital: number;
  purchasePrice: number;
  rent: number;
  mortgageRate: number;
  propertyHours: number;
}

function decisionPreset(eventId: string, search: URLSearchParams): DecisionPreset {
  const fromWorkbench = search.get("source") === "workbench";
  if (fromWorkbench) {
    return {
      capital: queryNumber(search, "capital", 71_000, 1, 100_000_000),
      purchasePrice: queryNumber(search, "price", 525_000, 1, 20_000_000),
      rent: queryNumber(search, "rent", 3_650, 0, 100_000),
      mortgageRate: queryNumber(search, "rate", 6.75, 0, 25),
      propertyHours: queryNumber(search, "hours", 6, 0, 80)
    };
  }
  if (eventId === "event-rsu-vest") {
    return {
      capital: 71_000,
      purchasePrice: 525_000,
      rent: 3_650,
      mortgageRate: 6.75,
      propertyHours: 6
    };
  }
  if (eventId === "event-concentration") {
    return {
      capital: 292_000,
      purchasePrice: 625_000,
      rent: 4_100,
      mortgageRate: 6.75,
      propertyHours: 6
    };
  }
  return {
    capital: 147_000,
    purchasePrice: 525_000,
    rent: 3_650,
    mortgageRate: 6.75,
    propertyHours: 6
  };
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
