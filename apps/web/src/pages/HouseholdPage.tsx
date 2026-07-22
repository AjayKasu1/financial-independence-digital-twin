import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Home,
  Landmark,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { HouseholdResponse } from "@fidt/contracts";
import {
  Badge,
  ErrorState,
  EvidenceCheck,
  LoadingState,
  MetricCard,
  MiniLine
} from "../components/Ui";
import { api } from "../lib/api";
import { currency, date, fullCurrency, percent } from "../lib/format";

export function HouseholdPage() {
  const { householdId = "" } = useParams();
  const [data, setData] = useState<HouseholdResponse | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api
      .household(householdId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  };
  useEffect(() => {
    void api
      .household(householdId)
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [householdId]);
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <LoadingState label="Assembling the household twin…" />;
  const { household } = data;
  const liquid = household.accounts.reduce((sum, account) => sum + account.balance, 0);
  const propertyEquity = household.properties.reduce(
    (sum, property) => sum + property.marketValue - property.mortgageBalance,
    0
  );
  const liabilities = household.liabilities.reduce((sum, liability) => sum + liability.balance, 0);
  const income = household.incomeSources.reduce((sum, source) => sum + source.annualAmount, 0);
  const scenario = data.latestScenarios[0];

  return (
    <>
      <section className="hero-row compact">
        <div>
          <span className="eyebrow coral">
            Household digital twin · As of {date(household.asOf)}
          </span>
          <h1>{household.name}</h1>
          <p>
            {household.members.map((person) => `${person.firstName}, ${person.age}`).join(" · ")} ·
            Growth profile · Work-optional goal
          </p>
        </div>
        <div className="hero-actions">
          <EvidenceCheck>100% synthetic demo data</EvidenceCheck>
          <Link className="button primary" to="compare">
            Compare decisions
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="metric-grid">
        <MetricCard
          label="Liquid assets"
          value={currency.format(liquid)}
          detail={`${household.accounts.length} modeled accounts`}
          tone="positive"
        />
        <MetricCard
          label="Property equity"
          value={currency.format(propertyEquity)}
          detail="Primary residence excluded from FI assets"
        />
        <MetricCard
          label="Annual cash inflow"
          value={currency.format(income)}
          detail={`${currency.format(income - household.annualSpending)} available before taxes/other goals`}
        />
        <MetricCard
          label="Tracked liabilities"
          value={currency.format(liabilities)}
          detail={`${household.liabilities.length} obligations`}
          tone="warning"
        />
      </section>
      <section className="twin-grid">
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Balance sheet</span>
              <h2>Household architecture</h2>
            </div>
            <Badge tone="info">Source traceable</Badge>
          </div>
          <div className="balance-groups">
            <BalanceGroup icon={<WalletCards />} title="Accounts" total={liquid}>
              {household.accounts.map((account) => (
                <BalanceRow
                  key={account.id}
                  label={account.name}
                  value={account.balance}
                  tag={account.managed ? "Managed" : "External"}
                />
              ))}
            </BalanceGroup>
            <BalanceGroup
              icon={<Home />}
              title="Property"
              total={household.properties.reduce((sum, property) => sum + property.marketValue, 0)}
            >
              {household.properties.map((property) => (
                <BalanceRow
                  key={property.id}
                  label={property.label}
                  value={property.marketValue}
                  tag={property.location}
                />
              ))}
            </BalanceGroup>
            <BalanceGroup icon={<Landmark />} title="Liabilities" total={liabilities}>
              {household.liabilities.map((liability) => (
                <BalanceRow
                  key={liability.id}
                  label={liability.name}
                  value={liability.balance}
                  tag={percent.format(liability.annualRate)}
                />
              ))}
            </BalanceGroup>
          </div>
        </article>
        <article className="panel goal-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Primary goal</span>
              <h2>{household.goals[0]?.label}</h2>
            </div>
          </div>
          <div className="goal-number">
            <strong>{currency.format(household.goals[0]?.targetAmount ?? 0)}</strong>
            <span>stated target</span>
          </div>
          {scenario ? (
            <>
              <MiniLine values={scenario.timeline.map((year) => year.liquidAssets)} />
              <div className="goal-caption">
                <span>Current liquid</span>
                <span>Modeled horizon</span>
              </div>
              <p className="callout">
                Under the latest scenario, FI is modeled at age{" "}
                <strong>{scenario.fiAge ?? "beyond horizon"}</strong>. This is an
                assumption-dependent result.
              </p>
            </>
          ) : (
            <p className="empty-note">
              Run a comparison to create the first versioned FI projection.
            </p>
          )}
        </article>
        <article className="panel span-2">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Upcoming decisions</span>
              <h2>Event timeline</h2>
            </div>
            <CalendarClock size={20} />
          </div>
          <div className="timeline-list">
            {data.events.map((event) => (
              <div key={event.id}>
                <span className={`timeline-dot severity-${event.severity.toLowerCase()}`} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.description}</p>
                  <small>{date(event.occurredAt)}</small>
                </div>
                <Badge tone={event.severity === "HIGH" ? "danger" : "warn"}>{event.status}</Badge>
              </div>
            ))}
          </div>
        </article>
        <article className="panel values-panel">
          <BriefcaseBusiness />
          <span className="eyebrow">Decision preferences</span>
          <h2>What the model must respect</h2>
          <dl>
            {household.preferences.values.map((value) => (
              <div key={value}>
                <dt>{value}</dt>
                <dd>Explicit household value</dd>
              </div>
            ))}
            <div>
              <dt>{currency.format(household.preferences.liquidityFloor)}</dt>
              <dd>Minimum liquidity floor</dd>
            </div>
            <div>
              <dt>{household.preferences.maxRealEstateHoursPerMonth} hours</dt>
              <dd>Monthly property-work ceiling</dd>
            </div>
          </dl>
        </article>
      </section>
    </>
  );
}

function BalanceGroup({
  icon,
  title,
  total,
  children
}: {
  icon: React.ReactNode;
  title: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="balance-group">
      <header>
        <span className="balance-icon">{icon}</span>
        <div>
          <span>{title}</span>
          <strong>{fullCurrency.format(total)}</strong>
        </div>
      </header>
      {children}
    </section>
  );
}

function BalanceRow({ label, value, tag }: { label: string; value: number; tag: string }) {
  return (
    <div className="balance-row">
      <div>
        <strong>{label}</strong>
        <span>{tag}</span>
      </div>
      <strong>{fullCurrency.format(value)}</strong>
    </div>
  );
}
