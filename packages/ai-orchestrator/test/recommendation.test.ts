import { describe, expect, it } from "vitest";
import {
  createDeterministicRecommendation,
  FALLBACK_MODEL_ID,
  OpenRouterRecommendationGenerator,
  ResilientRecommendationGenerator,
  type RecommendationGenerator
} from "../src";
import {
  demoAssumptions,
  demoFeeSchedule,
  demoHousehold,
  demoStrategies,
  runScenarioComparison
} from "@fidt/domain";

const scenarios = runScenarioComparison(
  demoHousehold,
  demoStrategies,
  demoAssumptions,
  demoFeeSchedule
);
const context = {
  household: demoHousehold,
  scenarios,
  conflicts: [],
  citations: [],
  now: new Date("2026-07-22T15:00:00.000Z")
};

describe("recommendation orchestration", () => {
  it("builds a citation-linked deterministic fallback", () => {
    const recommendation = createDeterministicRecommendation(context);
    expect(recommendation.modelId).toBe(FALLBACK_MODEL_ID);
    expect(recommendation.generatedBy).toBe("DETERMINISTIC_FALLBACK");
    expect(recommendation.alternativesConsidered.length).toBeGreaterThanOrEqual(1);
    expect(
      recommendation.statements
        .filter((statement) => statement.label === "DETERMINISTIC_CALCULATION")
        .every((statement) => statement.calculationRefs.length > 0)
    ).toBe(true);
  });

  it("never selects a capital-infeasible scenario", () => {
    const highest = [...scenarios].sort(
      (left, right) => right.successProbability - left.successProbability
    )[0]!;
    const constrained = scenarios.map((scenario) =>
      scenario.id === highest.id
        ? { ...scenario, capitalUse: { ...scenario.capitalUse, feasible: false } }
        : scenario
    );
    const recommendation = createDeterministicRecommendation({
      ...context,
      scenarios: constrained
    });
    expect(recommendation.recommendedScenarioId).not.toBe(highest.id);
  });

  it("falls back when the configured model provider is unavailable", async () => {
    const failing: RecommendationGenerator = {
      generate: () => Promise.reject(new Error("provider unavailable"))
    };
    const generator = new ResilientRecommendationGenerator(failing);
    const recommendation = await generator.generate(context);
    expect(recommendation.generatedBy).toBe("DETERMINISTIC_FALLBACK");
  });

  it("accepts schema-valid JSON from OpenRouter and supplies controlled metadata", async () => {
    const fakeFetch: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            model: "nvidia/nemotron-3-super-120b-a12b:free",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    recommendedScenarioId: scenarios[0]?.id,
                    headline: "Review the modeled alternatives",
                    executiveSummary: "A conditional, evidence-linked planning draft.",
                    statements: [
                      {
                        id: "ai-statement",
                        label: "AI_SUGGESTION",
                        text: "Review liquidity and implementation details with the household.",
                        citationIds: [],
                        calculationRefs: []
                      }
                    ],
                    alternativesConsidered: [scenarios[1]?.label],
                    missingInformation: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    const generator = new OpenRouterRecommendationGenerator({
      apiKey: "test-key",
      model: "test/model",
      fetchImplementation: fakeFetch
    });
    const recommendation = await generator.generate(context);
    expect(recommendation.generatedBy).toBe("OPENROUTER");
    expect(recommendation.modelId).toBe("nvidia/nemotron-3-super-120b-a12b:free");
    expect(recommendation.householdId).toBe(demoHousehold.id);
  });

  it("rejects provider errors and non-object model output", async () => {
    const providerError: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "quota reached" } }), { status: 429 })
      );
    const invalidJson: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), {
          status: 200
        })
      );
    await expect(
      new OpenRouterRecommendationGenerator({
        apiKey: "test-key",
        model: "test/model",
        fetchImplementation: providerError
      }).generate(context)
    ).rejects.toThrow("quota reached");
    await expect(
      new OpenRouterRecommendationGenerator({
        apiKey: "test-key",
        model: "test/model",
        fetchImplementation: invalidJson
      }).generate(context)
    ).rejects.toThrow("JSON object");
  });

  it("requires ZDR by default and relaxes it only when explicitly configured", async () => {
    const providerPreferences: unknown[] = [];
    const responseFormats: unknown[] = [];
    const captureRequest: typeof fetch = (_input, init) => {
      if (typeof init?.body !== "string") throw new TypeError("Expected a JSON request body");
      const body = JSON.parse(init.body) as { provider?: unknown; response_format?: unknown };
      providerPreferences.push(body.provider);
      responseFormats.push(body.response_format);
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: "captured" } }), { status: 503 })
      );
    };

    await expect(
      new OpenRouterRecommendationGenerator({
        apiKey: "test-key",
        model: "test/model",
        fetchImplementation: captureRequest
      }).generate(context)
    ).rejects.toThrow("captured");
    await expect(
      new OpenRouterRecommendationGenerator({
        apiKey: "test-key",
        model: "test/model",
        requireZeroDataRetention: false,
        fetchImplementation: captureRequest
      }).generate(context)
    ).rejects.toThrow("captured");

    expect(providerPreferences).toEqual([
      { data_collection: "deny", require_parameters: true, zdr: true },
      { data_collection: "deny", require_parameters: true }
    ]);
    expect(responseFormats).toEqual([
      expect.objectContaining({ type: "json_schema" }),
      expect.objectContaining({ type: "json_schema" })
    ]);
  });

  it("supplies stored compliance feedback to a repair request", async () => {
    let repairFeedback: unknown;
    const captureRequest: typeof fetch = (_input, init) => {
      if (typeof init?.body !== "string") throw new TypeError("Expected a JSON request body");
      const body = JSON.parse(init.body) as {
        messages: readonly { role: string; content: string }[];
      };
      const userMessage = body.messages.find((message) => message.role === "user");
      repairFeedback = userMessage
        ? (JSON.parse(userMessage.content) as { complianceFeedback?: unknown }).complianceFeedback
        : null;
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: "captured" } }), { status: 503 })
      );
    };
    const generator = new OpenRouterRecommendationGenerator({
      apiKey: "test-key",
      model: "test/model",
      fetchImplementation: captureRequest
    });

    await expect(
      generator.generate({
        ...context,
        complianceFeedback: {
          status: "REQUIRE_CHANGES",
          reasons: [
            {
              code: "MISSING_EVIDENCE",
              severity: "BLOCKING",
              message: "Attach evidence.",
              statementId: "statement-1"
            }
          ],
          requiredActions: ["Attach a traceable citation."]
        }
      })
    ).rejects.toThrow("captured");

    expect(repairFeedback).toEqual(
      expect.objectContaining({
        status: "REQUIRE_CHANGES",
        requiredActions: ["Attach a traceable citation."]
      })
    );
  });

  it("requires a key and at least two scenarios", async () => {
    expect(
      () => new OpenRouterRecommendationGenerator({ apiKey: " ", model: "test/model" })
    ).toThrow("API key");
    await expect(
      new ResilientRecommendationGenerator(null).generate({
        ...context,
        scenarios: [scenarios[0]!]
      })
    ).rejects.toThrow("At least two scenarios");
  });
});
