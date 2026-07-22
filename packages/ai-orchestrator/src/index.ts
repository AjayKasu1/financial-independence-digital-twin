import {
  recommendationDraftSchema,
  type Citation,
  type ComplianceDecision,
  type RecommendationDraft
} from "@fidt/contracts";
import type { ConflictFlag, HouseholdSnapshot, ScenarioResult } from "@fidt/domain";

export const PROMPT_VERSION = "recommendation-v1.0.0";
export const FALLBACK_MODEL_ID = "deterministic-template-v1";

export interface RecommendationContext {
  readonly household: HouseholdSnapshot;
  readonly scenarios: readonly ScenarioResult[];
  readonly conflicts: readonly ConflictFlag[];
  readonly citations: readonly Citation[];
  readonly advisorRationale?: string;
  readonly complianceFeedback?: Pick<ComplianceDecision, "status" | "reasons" | "requiredActions">;
  readonly now?: Date;
}

export interface RecommendationGenerator {
  generate(context: RecommendationContext): Promise<RecommendationDraft>;
}

export interface OpenRouterOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly requireZeroDataRetention?: boolean;
  readonly siteUrl?: string;
  readonly siteName?: string;
  readonly fetchImplementation?: typeof fetch;
}

interface OpenRouterResponse {
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: { readonly content?: MessageContent };
  }[];
  readonly error?: { readonly message?: string };
}

type MessageContent = string | readonly { readonly text?: string }[];

export class OpenRouterRecommendationGenerator implements RecommendationGenerator {
  readonly #options: OpenRouterOptions;

  constructor(options: OpenRouterOptions) {
    if (options.apiKey.trim().length === 0) throw new Error("OpenRouter API key is required");
    this.#options = options;
  }

  async generate(context: RecommendationContext): Promise<RecommendationDraft> {
    ensureComparableScenarios(context.scenarios);
    const fetchImplementation = this.#options.fetchImplementation ?? fetch;
    const response = await fetchImplementation("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.#options.apiKey}`,
        "Content-Type": "application/json",
        ...(this.#options.siteUrl ? { "HTTP-Referer": this.#options.siteUrl } : {}),
        ...(this.#options.siteName ? { "X-Title": this.#options.siteName } : {})
      },
      body: JSON.stringify({
        model: this.#options.model,
        temperature: 0.1,
        max_tokens: 2_000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fiduciary_recommendation",
            strict: true,
            schema: RECOMMENDATION_OUTPUT_SCHEMA
          }
        },
        provider: {
          data_collection: "deny",
          require_parameters: true,
          ...(this.#options.requireZeroDataRetention === false ? {} : { zdr: true })
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(toPromptPayload(context)) }
        ]
      })
    });
    const payload = (await response.json()) as OpenRouterResponse;
    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? `OpenRouter request failed with ${response.status}`
      );
    }
    const content = contentText(payload.choices?.[0]?.message?.content);
    if (!content) throw new Error("OpenRouter returned no recommendation content");
    const parsed = safeJsonObject(content);
    const now = context.now ?? new Date();
    return recommendationDraftSchema.parse({
      ...parsed,
      id: crypto.randomUUID(),
      householdId: context.household.id,
      createdAt: now.toISOString(),
      scenarioIds: context.scenarios.map((scenario) => scenario.id),
      citations: context.citations,
      conflictsDisclosed: context.conflicts.map((conflict) => conflict.message),
      modelId: payload.model?.trim() || this.#options.model,
      promptVersion: PROMPT_VERSION,
      generatedBy: "OPENROUTER"
    });
  }
}

export class ResilientRecommendationGenerator implements RecommendationGenerator {
  readonly #primary: RecommendationGenerator | null;
  readonly #onError: ((error: unknown) => void) | undefined;

  constructor(primary: RecommendationGenerator | null, onError?: (error: unknown) => void) {
    this.#primary = primary;
    this.#onError = onError;
  }

  async generate(context: RecommendationContext): Promise<RecommendationDraft> {
    if (this.#primary) {
      try {
        return await this.#primary.generate(context);
      } catch (error) {
        this.#onError?.(error);
      }
    }
    return createDeterministicRecommendation(context);
  }
}

export function createDeterministicRecommendation(
  context: RecommendationContext
): RecommendationDraft {
  ensureComparableScenarios(context.scenarios);
  const now = context.now ?? new Date();
  const ranked = [...context.scenarios].sort(
    (left, right) =>
      right.successProbability - left.successProbability ||
      right.projectedLiquidAssets - left.projectedLiquidAssets
  );
  const recommended = ranked[0];
  if (!recommended) throw new RangeError("At least two scenarios are required");
  const alternative = ranked[1];
  if (!alternative) throw new RangeError("At least two scenarios are required");
  const calculationCitation: Citation = {
    id: `calculation-${recommended.id}`,
    title: `${recommended.label} deterministic scenario output`,
    sourceType: "CALCULATION",
    asOf: now.toISOString()
  };

  return recommendationDraftSchema.parse({
    id: crypto.randomUUID(),
    householdId: context.household.id,
    createdAt: now.toISOString(),
    recommendedScenarioId: recommended.id,
    scenarioIds: context.scenarios.map((scenario) => scenario.id),
    headline: `Review ${recommended.label} as the leading planning path`,
    executiveSummary:
      "This draft ranks the modeled alternatives using deterministic plan outputs and seeded simulations. It is a planning aid, not a promise of future performance, and requires advisor review.",
    statements: [
      {
        id: "statement-success-probability",
        label: "DETERMINISTIC_CALCULATION",
        text: `${recommended.label} produced a ${(recommended.successProbability * 100).toFixed(0)}% modeled success rate under the recorded assumptions.`,
        citationIds: [calculationCitation.id],
        calculationRefs: [`scenarios.${recommended.id}.successProbability`]
      },
      {
        id: "statement-liquidity",
        label: "DETERMINISTIC_CALCULATION",
        text: `Projected liquid assets at the planning horizon are ${formatCurrency(recommended.projectedLiquidAssets)} for the leading scenario.`,
        citationIds: [calculationCitation.id],
        calculationRefs: [`scenarios.${recommended.id}.projectedLiquidAssets`]
      },
      {
        id: "statement-judgment",
        label: "ADVISOR_JUDGMENT",
        text: "Confirm tax, liquidity, implementation, and household-preference details before acting.",
        citationIds: [],
        calculationRefs: []
      }
    ],
    citations: [...context.citations, calculationCitation],
    alternativesConsidered: ranked.slice(1).map((scenario) => scenario.label),
    conflictsDisclosed: context.conflicts.map((conflict) => conflict.message),
    missingInformation: missingInformation(context.household),
    modelId: FALLBACK_MODEL_ID,
    promptVersion: PROMPT_VERSION,
    generatedBy: "DETERMINISTIC_FALLBACK"
  });
}

const SYSTEM_PROMPT = `You are a drafting assistant for a fiduciary financial advisor.
Return only a JSON object matching the requested recommendation structure.
Never calculate, estimate, or change a numeric value. Use only values in scenarioOutputs.
Every factual or calculated statement must cite an allowed citation id and calculated claims must include a calculationRefs path.
Label each statement as CLIENT_FACT, DETERMINISTIC_CALCULATION, EXTERNAL_FACT, PLANNING_ASSUMPTION, ADVISOR_JUDGMENT, or AI_SUGGESTION.
Discuss reasonable alternatives and disclosed conflicts. Do not promise outcomes or use guarantee, risk-free, cannot-lose, or no-downside language.
When complianceFeedback is present, repair every cited issue and required action without inventing facts, citations, or calculations.
Output these fields only: recommendedScenarioId, headline, executiveSummary, statements, alternativesConsidered, missingInformation.`;

const RECOMMENDATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendedScenarioId: {
      type: "string",
      minLength: 1,
      description: "An exact scenario id from scenarioOutputs."
    },
    headline: { type: "string", minLength: 1, maxLength: 180 },
    executiveSummary: { type: "string", minLength: 1, maxLength: 2_000 },
    statements: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          label: {
            type: "string",
            enum: [
              "CLIENT_FACT",
              "DETERMINISTIC_CALCULATION",
              "EXTERNAL_FACT",
              "PLANNING_ASSUMPTION",
              "ADVISOR_JUDGMENT",
              "AI_SUGGESTION"
            ]
          },
          text: { type: "string", minLength: 1, maxLength: 1_500 },
          citationIds: {
            type: "array",
            items: { type: "string" },
            description: "Only ids from allowedCitations."
          },
          calculationRefs: {
            type: "array",
            items: { type: "string" },
            description: "Scenario output paths for deterministic calculations; otherwise empty."
          }
        },
        required: ["id", "label", "text", "citationIds", "calculationRefs"]
      }
    },
    alternativesConsidered: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    missingInformation: { type: "array", items: { type: "string" } }
  },
  required: [
    "recommendedScenarioId",
    "headline",
    "executiveSummary",
    "statements",
    "alternativesConsidered",
    "missingInformation"
  ]
} as const;

function toPromptPayload(context: RecommendationContext): Record<string, unknown> {
  return {
    household: {
      id: context.household.id,
      name: context.household.name,
      annualSpending: context.household.annualSpending,
      preferences: context.household.preferences,
      goals: context.household.goals
    },
    scenarioOutputs: context.scenarios,
    conflicts: context.conflicts,
    allowedCitations: context.citations,
    advisorRationale: context.advisorRationale ?? null,
    complianceFeedback: context.complianceFeedback ?? null,
    promptVersion: PROMPT_VERSION
  };
}

function contentText(content: MessageContent | undefined): string {
  if (typeof content === "string") return content;
  return content?.map((part) => part.text ?? "").join("") ?? "";
}

function safeJsonObject(content: string): Record<string, unknown> {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("The model response must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function ensureComparableScenarios(scenarios: readonly ScenarioResult[]): void {
  if (scenarios.length < 2) throw new RangeError("At least two scenarios are required");
}

function missingInformation(household: HouseholdSnapshot): string[] {
  const missing: string[] = [];
  if (household.incomeSources.length === 0) missing.push("Verified household income");
  if (household.liabilities.length === 0) missing.push("Confirmed liability statement balances");
  if (household.rsuGrants.length > 0) missing.push("Employer equity plan tax-lot instructions");
  return missing;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
