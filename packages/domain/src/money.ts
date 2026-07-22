import Decimal from "decimal.js";

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP });

export function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

export function assertRate(value: number, label: string, max = 1): void {
  assertFiniteNumber(value, label);
  if (value < 0 || value > max) {
    throw new RangeError(`${label} must be between 0 and ${max}`);
  }
}

export function money(value: Decimal.Value): Decimal {
  return new Decimal(value);
}

export function toMoney(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(2).toNumber();
}

export function toRate(value: Decimal.Value): number {
  return new Decimal(value).toDecimalPlaces(6).toNumber();
}

export function round(value: Decimal.Value, places = 2): number {
  return new Decimal(value).toDecimalPlaces(places).toNumber();
}
