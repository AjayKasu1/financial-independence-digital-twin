import type { LiveDataResponse, LiveObservation, SourceConnectorStatus } from "@fidt/contracts";
import { XMLParser } from "fast-xml-parser";

const TREASURY_SOURCE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";
const BLS_SOURCE = "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0";
const FHFA_SOURCE = "https://www.fhfa.gov/hpi-state/json";
const SEC_SOURCE = "https://data.sec.gov/submissions/CIK0000320193.json";
const CACHE_KEY = "live-data:v1";
const CACHE_SECONDS = 21_600;

interface BLSResponse {
  readonly status?: string;
  readonly Results?: {
    readonly series?: readonly {
      readonly seriesID?: string;
      readonly data?: readonly {
        readonly year?: string;
        readonly period?: string;
        readonly periodName?: string;
        readonly value?: string;
      }[];
    }[];
  };
}

interface FHFARecord {
  readonly name?: string;
  readonly sa_1period?: string;
  readonly sa_1y?: string;
}

interface SECResponse {
  readonly cik?: string;
  readonly name?: string;
  readonly filings?: { readonly recent?: { readonly accessionNumber?: readonly string[] } };
}

export async function getLiveData(
  cache: KVNamespace,
  options: { readonly force?: boolean | undefined; readonly secUserAgent?: string | undefined } = {}
): Promise<LiveDataResponse> {
  if (!options.force) {
    const cached = await cache.get<LiveDataResponse>(CACHE_KEY, "json");
    if (cached) {
      return {
        ...cached,
        connectors: cached.connectors.map((connector) =>
          connector.status === "LIVE" ? { ...connector, status: "CACHED" as const } : connector
        )
      };
    }
  }

  const checkedAt = new Date();
  const jobs = await Promise.allSettled([
    fetchTreasury(checkedAt),
    fetchBls(checkedAt),
    fetchFhfa(checkedAt),
    fetchSecStatus(checkedAt, options.secUserAgent)
  ]);
  const observations: LiveObservation[] = [];
  const connectors: SourceConnectorStatus[] = [];
  const sources = [
    ["TREASURY", TREASURY_SOURCE],
    ["BLS", BLS_SOURCE],
    ["FHFA", FHFA_SOURCE],
    ["SEC", SEC_SOURCE]
  ] as const;

  jobs.forEach((job, index) => {
    const source = sources[index];
    if (!source) return;
    if (job.status === "fulfilled") {
      observations.push(...job.value.observations);
      connectors.push(job.value.connector);
    } else {
      connectors.push({
        source: source[0],
        status: "UNAVAILABLE",
        checkedAt: checkedAt.toISOString(),
        sourceUrl: source[1],
        detail: errorMessage(job.reason)
      });
    }
  });
  const response = { observations, connectors } satisfies LiveDataResponse;
  await cache.put(CACHE_KEY, JSON.stringify(response), { expirationTtl: CACHE_SECONDS });
  return response;
}

async function fetchTreasury(
  checkedAt: Date
): Promise<{ observations: LiveObservation[]; connector: SourceConnectorStatus }> {
  const year = checkedAt.getUTCFullYear();
  const sourceUrl = `${TREASURY_SOURCE}?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const response = await fetch(sourceUrl, { headers: { Accept: "application/xml" } });
  if (!response.ok) throw new Error(`Treasury returned ${response.status}`);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(await response.text()) as unknown;
  const records = findObjectsWithKey(parsed, "d:NEW_DATE");
  const latest = records
    .map((record) => ({
      date: stringValue(record["d:NEW_DATE"]),
      tenYear: numberValue(record["d:BC_10YEAR"])
    }))
    .filter((record) => record.date && record.tenYear !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1);
  if (!latest?.date || latest.tenYear === null)
    throw new Error("Treasury XML contained no 10-year rate");
  return {
    observations: [
      observation({
        source: "U.S. Treasury",
        seriesId: "DGS10",
        label: "10-year Treasury par yield",
        value: latest.tenYear / 100,
        unit: "rate",
        observationDate: latest.date,
        retrievedAt: checkedAt,
        sourceUrl
      })
    ],
    connector: liveConnector(
      "TREASURY",
      checkedAt,
      sourceUrl,
      "Latest official daily par yield loaded."
    )
  };
}

async function fetchBls(
  checkedAt: Date
): Promise<{ observations: LiveObservation[]; connector: SourceConnectorStatus }> {
  const response = await fetch(BLS_SOURCE, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`BLS returned ${response.status}`);
  const payload = await response.json<BLSResponse>();
  const latest = payload.Results?.series?.[0]?.data?.[0];
  const value = latest?.value ? Number(latest.value) : Number.NaN;
  if (!latest?.year || !latest.period || !Number.isFinite(value)) {
    throw new Error("BLS response contained no CPI observation");
  }
  const month = latest.period.startsWith("M") ? Number(latest.period.slice(1)) : 1;
  const observationDate = `${latest.year}-${String(month).padStart(2, "0")}-01`;
  return {
    observations: [
      observation({
        source: "U.S. Bureau of Labor Statistics",
        seriesId: "CUUR0000SA0",
        label: `CPI-U all items${latest.periodName ? ` — ${latest.periodName}` : ""}`,
        value,
        unit: "index",
        observationDate,
        retrievedAt: checkedAt,
        sourceUrl: BLS_SOURCE
      })
    ],
    connector: liveConnector(
      "BLS",
      checkedAt,
      BLS_SOURCE,
      "Latest public CPI-U observation loaded."
    )
  };
}

async function fetchFhfa(
  checkedAt: Date
): Promise<{ observations: LiveObservation[]; connector: SourceConnectorStatus }> {
  const response = await fetch(FHFA_SOURCE, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`FHFA returned ${response.status}`);
  const payload = await response.json<readonly FHFARecord[]>();
  const state = payload.find((record) => record.name === "North Carolina");
  const annualChange = Number(state?.sa_1y);
  if (!Number.isFinite(annualChange)) throw new Error("FHFA response omitted North Carolina HPI");
  return {
    observations: [
      observation({
        source: "Federal Housing Finance Agency",
        seriesId: "HPI-NC-SA-1Y",
        label: "North Carolina HPI one-year change",
        value: annualChange / 100,
        unit: "rate",
        observationDate: checkedAt.toISOString().slice(0, 10),
        retrievedAt: checkedAt,
        sourceUrl: FHFA_SOURCE
      })
    ],
    connector: liveConnector(
      "FHFA",
      checkedAt,
      FHFA_SOURCE,
      "Latest official state HPI table loaded."
    )
  };
}

async function fetchSecStatus(
  checkedAt: Date,
  userAgent = "FiduciaryOS demo contact@example.com"
): Promise<{ observations: LiveObservation[]; connector: SourceConnectorStatus }> {
  const response = await fetch(SEC_SOURCE, {
    headers: { Accept: "application/json", "User-Agent": userAgent }
  });
  if (!response.ok) throw new Error(`SEC returned ${response.status}`);
  const payload = await response.json<SECResponse>();
  const recordCount = payload.filings?.recent?.accessionNumber?.length ?? 0;
  if (!payload.cik || recordCount === 0) throw new Error("SEC response contained no filing index");
  return {
    observations: [],
    connector: liveConnector(
      "SEC",
      checkedAt,
      SEC_SOURCE,
      `EDGAR JSON is reachable (${recordCount} current reference-issuer filing records). Synthetic ACME is intentionally not mapped to a real issuer.`
    )
  };
}

function liveConnector(
  source: SourceConnectorStatus["source"],
  checkedAt: Date,
  sourceUrl: string,
  detail: string
): SourceConnectorStatus {
  return { source, status: "LIVE", checkedAt: checkedAt.toISOString(), sourceUrl, detail };
}

function observation(
  input: Omit<LiveObservation, "retrievedAt" | "stale"> & { retrievedAt: Date }
): LiveObservation {
  const observed = new Date(input.observationDate);
  const stale =
    Number.isNaN(observed.getTime()) ||
    input.retrievedAt.getTime() - observed.getTime() > 45 * 86_400_000;
  return { ...input, retrievedAt: input.retrievedAt.toISOString(), stale };
}

function findObjectsWithKey(value: unknown, key: string): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => findObjectsWithKey(item, key));
  const record = value as Record<string, unknown>;
  const matches = key in record ? [record] : [];
  return matches.concat(Object.values(record).flatMap((item) => findObjectsWithKey(item, key)));
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return stringValue(value["#text"]);
  }
  return "";
}

function numberValue(value: unknown): number | null {
  const parsed = Number(stringValue(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The source could not be reached.";
}
