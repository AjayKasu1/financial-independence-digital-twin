import type {
  EvidenceDocument,
  EvidenceDocumentIngestRequest,
  ExtractedEvidenceFact
} from "@fidt/contracts";
import type { HouseholdSnapshot, Provenance } from "@fidt/domain";

interface FactDefinition {
  readonly key: string;
  readonly fieldPath: string;
  readonly label: string;
  readonly valueType: ExtractedEvidenceFact["valueType"];
  readonly unit: string | null;
  readonly affectsOpportunities: readonly string[];
  readonly parse: (raw: string) => string | number | null;
}

const documentDefinitions: Record<EvidenceDocument["documentType"], readonly FactDefinition[]> = {
  RSU_STATEMENT: [
    {
      key: "TICKER",
      fieldPath: "rsuGrants[0].ticker",
      label: "Employer ticker",
      valueType: "TEXT",
      unit: null,
      affectsOpportunities: ["RSU vest", "Employer-stock concentration"],
      parse: parseText
    },
    {
      key: "UNVESTED VALUE",
      fieldPath: "rsuGrants[0].unvestedValue",
      label: "Unvested award value",
      valueType: "CURRENCY",
      unit: "USD",
      affectsOpportunities: ["RSU vest", "Employer-stock concentration"],
      parse: parseNonNegativeNumber
    },
    {
      key: "NEXT VEST DATE",
      fieldPath: "rsuGrants[0].nextVestDate",
      label: "Next vest date",
      valueType: "DATE",
      unit: null,
      affectsOpportunities: ["RSU vest"],
      parse: parseDate
    },
    {
      key: "NEXT VEST VALUE",
      fieldPath: "rsuGrants[0].nextVestValue",
      label: "Next vest value",
      valueType: "CURRENCY",
      unit: "USD",
      affectsOpportunities: ["RSU vest", "Decision capital"],
      parse: parseNonNegativeNumber
    },
    {
      key: "WITHHOLDING RATE",
      fieldPath: "rsuGrants[0].withholdingRate",
      label: "Modeled withholding rate",
      valueType: "RATE",
      unit: "decimal",
      affectsOpportunities: ["RSU vest"],
      parse: parseRate
    }
  ],
  PAYSTUB: [
    {
      key: "ANNUAL BASE",
      fieldPath: "incomeSources[0].annualAmount",
      label: "Maya annual base compensation",
      valueType: "CURRENCY",
      unit: "USD/year",
      affectsOpportunities: ["Financial independence", "Household resilience"],
      parse: parseNonNegativeNumber
    }
  ],
  MORTGAGE_STATEMENT: [
    {
      key: "CURRENT BALANCE",
      fieldPath: "liabilities[0].balance",
      label: "Mortgage balance",
      valueType: "CURRENCY",
      unit: "USD",
      affectsOpportunities: ["Rental decision", "Household resilience"],
      parse: parseNonNegativeNumber
    },
    {
      key: "CURRENT BALANCE",
      fieldPath: "properties[0].mortgageBalance",
      label: "Property mortgage balance",
      valueType: "CURRENCY",
      unit: "USD",
      affectsOpportunities: ["Rental decision", "Household resilience"],
      parse: parseNonNegativeNumber
    },
    {
      key: "INTEREST RATE",
      fieldPath: "liabilities[0].annualRate",
      label: "Mortgage interest rate",
      valueType: "RATE",
      unit: "decimal",
      affectsOpportunities: ["Debt strategy", "Household resilience"],
      parse: parseRate
    },
    {
      key: "MONTHLY PAYMENT",
      fieldPath: "liabilities[0].monthlyPayment",
      label: "Mortgage monthly payment",
      valueType: "CURRENCY",
      unit: "USD/month",
      affectsOpportunities: ["Household resilience"],
      parse: parseNonNegativeNumber
    },
    {
      key: "REMAINING MONTHS",
      fieldPath: "liabilities[0].remainingMonths",
      label: "Mortgage term remaining",
      valueType: "NUMBER",
      unit: "months",
      affectsOpportunities: ["Debt strategy", "Household resilience"],
      parse: parseInteger
    },
    {
      key: "PROPERTY ESTIMATED VALUE",
      fieldPath: "properties[0].marketValue",
      label: "Primary residence estimated value",
      valueType: "CURRENCY",
      unit: "USD",
      affectsOpportunities: ["Rental decision", "Household resilience"],
      parse: parseNonNegativeNumber
    }
  ]
};

export class EvidenceExtractionError extends Error {}

export async function extractEvidenceDocument(
  householdId: string,
  input: EvidenceDocumentIngestRequest,
  now = new Date()
): Promise<EvidenceDocument> {
  const id = crypto.randomUUID();
  const ingestedAt = now.toISOString();
  const facts = documentDefinitions[input.documentType].flatMap((definition) => {
    const match = labeledValue(input.content, definition.key);
    if (!match) return [];
    const value = definition.parse(match.value);
    if (value === null) return [];
    return [
      {
        id: crypto.randomUUID(),
        fieldPath: definition.fieldPath,
        label: definition.label,
        value,
        valueType: definition.valueType,
        unit: definition.unit,
        sourceExcerpt: match.line.slice(0, 300),
        confidence: 0.99,
        status: "PROPOSED" as const,
        affectsOpportunities: definition.affectsOpportunities
      }
    ];
  });
  if (facts.length === 0) {
    throw new EvidenceExtractionError(
      `No supported ${documentLabel(input.documentType)} fields were found`
    );
  }
  return {
    id,
    householdId,
    documentType: input.documentType,
    fileName: input.fileName,
    status: "EXTRACTED",
    effectiveAt: input.effectiveAt ?? ingestedAt,
    ingestedAt,
    confirmedAt: null,
    reviewerId: null,
    contentHash: await sha256(input.content),
    extractionMethod: "DETERMINISTIC_STRUCTURED_V1",
    facts
  };
}

export function applyConfirmedEvidence(
  household: HouseholdSnapshot,
  document: EvidenceDocument,
  selectedFacts: readonly ExtractedEvidenceFact[],
  recordedAt: string
): HouseholdSnapshot {
  let updated: HouseholdSnapshot = { ...household, asOf: document.effectiveAt.slice(0, 10) };
  for (const fact of selectedFacts) {
    const provenance: Provenance = {
      sourceId: document.id,
      sourceType: "DOCUMENT",
      observedAt: document.effectiveAt,
      recordedAt,
      confidence: fact.confidence,
      location: `${document.fileName} · ${fact.sourceExcerpt}`
    };
    updated = applyFact(updated, fact, provenance);
  }
  return updated;
}

function applyFact(
  household: HouseholdSnapshot,
  fact: ExtractedEvidenceFact,
  provenance: Provenance
): HouseholdSnapshot {
  switch (fact.fieldPath) {
    case "rsuGrants[0].ticker":
      return {
        ...household,
        rsuGrants: household.rsuGrants.map((grant, index) =>
          index === 0 ? { ...grant, ticker: String(fact.value), provenance } : grant
        )
      };
    case "rsuGrants[0].unvestedValue":
      return {
        ...household,
        rsuGrants: household.rsuGrants.map((grant, index) =>
          index === 0 ? { ...grant, unvestedValue: numeric(fact.value), provenance } : grant
        )
      };
    case "rsuGrants[0].nextVestDate":
      return {
        ...household,
        rsuGrants: household.rsuGrants.map((grant, index) =>
          index === 0 ? { ...grant, nextVestDate: String(fact.value), provenance } : grant
        )
      };
    case "rsuGrants[0].nextVestValue":
      return {
        ...household,
        rsuGrants: household.rsuGrants.map((grant, index) =>
          index === 0 ? { ...grant, nextVestValue: numeric(fact.value), provenance } : grant
        )
      };
    case "rsuGrants[0].withholdingRate":
      return {
        ...household,
        rsuGrants: household.rsuGrants.map((grant, index) =>
          index === 0 ? { ...grant, withholdingRate: numeric(fact.value), provenance } : grant
        )
      };
    case "incomeSources[0].annualAmount":
      return {
        ...household,
        incomeSources: household.incomeSources.map((income, index) =>
          index === 0 ? { ...income, annualAmount: numeric(fact.value), provenance } : income
        )
      };
    case "liabilities[0].balance":
    case "liabilities[0].annualRate":
    case "liabilities[0].monthlyPayment":
    case "liabilities[0].remainingMonths": {
      const property = fact.fieldPath.split(".")[1] as
        "balance" | "annualRate" | "monthlyPayment" | "remainingMonths";
      return {
        ...household,
        liabilities: household.liabilities.map((liability, index) =>
          index === 0 ? { ...liability, [property]: numeric(fact.value), provenance } : liability
        )
      };
    }
    case "properties[0].mortgageBalance":
    case "properties[0].marketValue": {
      const property = fact.fieldPath.split(".")[1] as "mortgageBalance" | "marketValue";
      return {
        ...household,
        properties: household.properties.map((item, index) =>
          index === 0 ? { ...item, [property]: numeric(fact.value), provenance } : item
        )
      };
    }
    default:
      return household;
  }
}

function labeledValue(content: string, key: string): { line: string; value: string } | null {
  const normalizedKey = key.toUpperCase();
  for (const sourceLine of content.split(/\r?\n/)) {
    const line = sourceLine.trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    if (line.slice(0, separator).trim().toUpperCase() !== normalizedKey) continue;
    const value = line.slice(separator + 1).trim();
    if (value) return { line, value };
  }
  return null;
}

function parseNonNegativeNumber(value: string): number | null {
  const number = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseRate(value: string): number | null {
  const percent = value.includes("%");
  const number = Number(value.replace(/[%\s,]/g, ""));
  const rate = percent ? number / 100 : number;
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : null;
}

function parseInteger(value: string): number | null {
  const number = parseNonNegativeNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function parseDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function parseText(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 && normalized.length <= 12 ? normalized : null;
}

function numeric(value: string | number): number {
  if (typeof value !== "number") throw new EvidenceExtractionError("Expected a numeric fact");
  return value;
}

function documentLabel(type: EvidenceDocument["documentType"]): string {
  return type.toLowerCase().replaceAll("_", " ");
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
