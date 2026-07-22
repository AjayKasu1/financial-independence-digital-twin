import { AlertTriangle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Building the evidence view…" }: { label?: string }) {
  return (
    <div className="state-card">
      <LoaderCircle className="spin" />
      <strong>{label}</strong>
      <span>Calculations remain deterministic while data loads.</span>
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
  tone = "default"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
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
