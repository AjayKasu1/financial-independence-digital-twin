# ADR 003: Optional governed language model

Status: accepted

## Decision

OpenRouter is an optional, server-side drafting provider. Requests use low temperature, structured JSON, minimal context, provider data-collection denial, and zero-data-retention routing. Output is Zod-validated and policy-reviewed. Any failure uses a deterministic template.

## Consequences

The product works without a paid model and remains demoable when free-model limits are reached. LLM quality can improve the explanation but cannot become a single point of failure or approval authority.
