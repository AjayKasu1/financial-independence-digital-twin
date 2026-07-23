import { AlertTriangle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function LoadingState({ label = "Building the evidence view…" }: { label?: string }) {
  return (
    <div className="state-card">
      <div className="loading-orbit">
        <LoaderCircle className="spin" />
      </div>
      <div className="loading-copy">
        <strong>{label}</strong>
        <span>Calculations remain deterministic while data loads.</span>
      </div>
      <div className="loading-skeleton" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-card error-state">
      <AlertTriangle />
      <strong>We could not load this view</strong>
      <span>{message}</span>
      {retry ? (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  icon,
  signal
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "warning";
  icon?: ReactNode;
  signal?: string;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-card-top">
        <span>{label}</span>
        {icon ? <span className="metric-icon">{icon}</span> : null}
      </div>
      <div className="metric-value-row">
        <strong aria-label={value}>
          <AnimatedMetricValue value={value} />
        </strong>
        {signal ? <span className="metric-signal">{signal}</span> : null}
      </div>
      <small>{detail}</small>
    </article>
  );
}

function AnimatedMetricValue({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);
  const canAnimate =
    /^([^0-9-]*)(-?[\d,.]+)(.*)$/.test(value) &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!canAnimate) return;
    const match = value.match(/^([^0-9-]*)(-?[\d,.]+)(.*)$/);
    if (!match) return;
    const [, prefix = "", numericText = "", suffix = ""] = match;
    const target = Number(numericText.replaceAll(",", ""));
    if (!Number.isFinite(target)) return;
    const decimals = numericText.includes(".") ? (numericText.split(".")[1]?.length ?? 0) : 0;
    const startedAt = performance.now();
    const duration = 680;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const numeric = (target * eased).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
      setDisplay(`${prefix}${numeric}${suffix}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [canAnimate, value]);

  return <span aria-hidden="true">{canAnimate ? display : value}</span>;
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EvidenceCheck({ children }: { children: ReactNode }) {
  return (
    <span className="evidence-check">
      <Check size={13} />
      {children}
    </span>
  );
}

export function MiniLine({
  values,
  tone = "teal"
}: {
  values: readonly number[];
  tone?: "teal" | "coral" | "gold";
}) {
  const width = 280;
  const height = 70;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * width},${height - ((value - min) / range) * (height - 8) - 4}`
    )
    .join(" ");
  return (
    <svg
      className={`mini-line line-${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Projection trend"
    >
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
