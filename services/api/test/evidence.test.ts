import { describe, expect, it } from "vitest";
import type { EvidenceDocument } from "@fidt/contracts";
import { demoHousehold } from "@fidt/domain";
import {
  applyConfirmedEvidence,
  EvidenceExtractionError,
  extractEvidenceDocument
} from "../src/evidence";

const rsuStatement = `SYNTHETIC EQUITY AWARD STATEMENT
TICKER: ACME
UNVESTED VALUE: $305,000
NEXT VEST DATE: 2026-09-20
NEXT VEST VALUE: $82,000
WITHHOLDING RATE: 35%`;

describe("Evidence-to-Twin admission", () => {
  it("extracts only allowlisted structured fields with source excerpts", async () => {
    const document = await extractEvidenceDocument(
      demoHousehold.id,
      {
        documentType: "RSU_STATEMENT",
        fileName: "synthetic-rsu.txt",
        content: rsuStatement,
        effectiveAt: "2026-07-23T14:00:00.000Z"
      },
      new Date("2026-07-23T14:05:00.000Z")
    );

    expect(document.status).toBe("EXTRACTED");
    expect(document.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(document.facts.map((fact) => fact.fieldPath)).toEqual([
      "rsuGrants[0].ticker",
      "rsuGrants[0].unvestedValue",
      "rsuGrants[0].nextVestDate",
      "rsuGrants[0].nextVestValue",
      "rsuGrants[0].withholdingRate"
    ]);
    expect(document.facts.find((fact) => fact.fieldPath.endsWith("nextVestValue"))?.value).toBe(
      82_000
    );
    expect(document.facts.every((fact) => fact.status === "PROPOSED")).toBe(true);
  });

  it("does not change the twin until selected facts are explicitly applied", async () => {
    const document = await extractEvidenceDocument(demoHousehold.id, {
      documentType: "RSU_STATEMENT",
      fileName: "synthetic-rsu.txt",
      content: rsuStatement,
      effectiveAt: "2026-07-23T14:00:00.000Z"
    });
    const selected = document.facts.filter((fact) =>
      ["rsuGrants[0].nextVestDate", "rsuGrants[0].nextVestValue"].includes(fact.fieldPath)
    );
    const updated = applyConfirmedEvidence(
      demoHousehold,
      document,
      selected,
      "2026-07-23T14:10:00.000Z"
    );

    expect(demoHousehold.rsuGrants[0]?.nextVestValue).toBe(71_000);
    expect(updated.rsuGrants[0]?.nextVestValue).toBe(82_000);
    expect(updated.rsuGrants[0]?.nextVestDate).toBe("2026-09-20");
    expect(updated.rsuGrants[0]?.provenance).toMatchObject({
      sourceId: document.id,
      sourceType: "DOCUMENT",
      confidence: 0.99
    });
  });

  it("rejects content that has no supported fields", async () => {
    await expect(
      extractEvidenceDocument(demoHousehold.id, {
        documentType: "PAYSTUB",
        fileName: "unsupported.txt",
        content: "SYNTHETIC STATEMENT\nFAVORITE COLOR: GREEN"
      })
    ).rejects.toBeInstanceOf(EvidenceExtractionError);
  });

  it("cannot apply an unknown field path", () => {
    const document = {
      id: "document-demo",
      householdId: demoHousehold.id,
      documentType: "PAYSTUB",
      fileName: "synthetic.txt",
      status: "EXTRACTED",
      effectiveAt: "2026-07-23T14:00:00.000Z",
      ingestedAt: "2026-07-23T14:01:00.000Z",
      confirmedAt: null,
      reviewerId: null,
      contentHash: "a".repeat(64),
      extractionMethod: "DETERMINISTIC_STRUCTURED_V1",
      facts: [
        {
          id: "fact-unknown",
          fieldPath: "preferences.riskTolerance",
          label: "Unknown",
          value: "CONSERVATIVE",
          valueType: "TEXT",
          unit: null,
          sourceExcerpt: "Unknown",
          confidence: 1,
          status: "PROPOSED",
          affectsOpportunities: []
        }
      ]
    } satisfies EvidenceDocument;
    const result = applyConfirmedEvidence(
      demoHousehold,
      document,
      document.facts,
      "2026-07-23T14:02:00.000Z"
    );
    expect(result.preferences).toEqual(demoHousehold.preferences);
  });
});
