import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Home,
  Scale,
  TrendingUp
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
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
  return (
    <CompareWorkflow
      key={`${householdId}:${triggerEventId}`}
      householdId={householdId}
      triggerEventId={triggerEventId}
    />
  );
}

function CompareWorkflow({
  householdId,
  triggerEventId
}: {
  householdId: string;
  triggerEventId: string;
}) {
  const preset = decisionPreset(triggerEventId);
  const [capital, setCapital] = useState(preset.capital);
  const [purchasePrice, setPurchasePrice] = useState(preset.purchasePrice);
  const [rent, setRent] = useState(preset.rent);
  const [mortgageRate, setMortgageRate] = useState(preset.mortgageRate);
  const [triggerEvent, setTriggerEvent] = useState<FinancialEvent | null>(null);
  const [result, setResult] = useState<ScenarioComparisonResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!triggerEventId) return;
    void api
      .household(householdId)
      .then((data) =>
        setTriggerEvent(data.events.find((event) => event.id === triggerEventId) ?? null)
      );
  }, [householdId, triggerEventId]);
  const request = useMemo<ScenarioComparisonRequest>(
    () => ({
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
            hoursPerMonth: 6,
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
    [capital, purchasePrice, rent, mortgageRate, triggerEventId]
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
      ) : null}
      <section className="compare-layout">
        <aside className="panel assumption-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Decision inputs</span>
              <h2>Planning assumptions</h2>
            </div>
          </div>
          <Input
            label="Decision capital"
            prefix="$"
            value={capital}
            onChange={setCapital}
            step={1000}
          />
          <Input
            label="Rental purchase price"
            prefix="$"
            value={purchasePrice}
            onChange={setPurchasePrice}
            step={5000}
          />
          <Input label="Monthly market rent" prefix="$" value={rent} onChange={setRent} step={50} />
          <Input
            label="Mortgage rate"
            suffix="%"
            value={mortgageRate}
            onChange={setMortgageRate}
            step={0.05}
          />
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
  const leading = [...result.scenarios].sort(
    (a, b) => b.successProbability - a.successProbability
  )[0];
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

function decisionPreset(eventId: string): {
  capital: number;
  purchasePrice: number;
  rent: number;
  mortgageRate: number;
} {
  if (eventId === "event-rsu-vest") {
    return { capital: 71_000, purchasePrice: 525_000, rent: 3_650, mortgageRate: 6.75 };
  }
  if (eventId === "event-concentration") {
    return { capital: 292_000, purchasePrice: 625_000, rent: 4_100, mortgageRate: 6.75 };
  }
  return { capital: 147_000, purchasePrice: 525_000, rent: 3_650, mortgageRate: 6.75 };
}

function Input({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step: number;
}) {
  return (
    <label className="input-group">
      <span>{label}</span>
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
