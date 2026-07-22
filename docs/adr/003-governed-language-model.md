# ADR 003: Optional governed language model

Status: accepted

## Decision

OpenRouter is an optional, server-side drafting provider. Requests use low temperature, structured JSON, minimal context, and provider data-collection denial. The synthetic-only `demo` environment may use a non-ZDR endpoint so zero-cost models remain available; development and production enforce zero-data-retention routing. Output is Zod-validated and policy-reviewed. Any failure uses a deterministic template.

## Consequences

The product works without a paid model and remains demoable when free-model limits are reached. LLM quality can improve the explanation but cannot become a single point of failure or approval authority.
