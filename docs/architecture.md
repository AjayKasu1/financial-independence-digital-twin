# Architecture

## Runtime view

```mermaid
flowchart TB
  Browser["React advisor SPA"] -->|"same-origin /api"| Worker["Hono Cloudflare Worker"]
  Worker --> Auth["Access JWT + rate limits"]
  Worker --> D1["D1 repository"]
  Worker --> KV["KV cache"]
  Worker --> Domain["Deterministic domain package"]
  Worker --> AI["Recommendation orchestrator"]
  AI --> OR["OpenRouter (optional)"]
  Worker --> Policy["Policy engine"]
  Worker --> Public["Treasury · BLS · FHFA · SEC"]
  Worker -. future evidence .-> R2["R2"]
  Worker -. future retrieval .-> Vectorize["Vectorize"]
```

## Package boundaries

| Package                 | Owns                                                                                           | Must not own                             |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `@fidt/domain`          | Money math, FI, rental, portfolio simulation, fees, conflicts, scenario engine, synthetic demo | HTTP, D1, prompts                        |
| `@fidt/contracts`       | API and model Zod schemas, response types                                                      | Business calculations                    |
| `@fidt/ai-orchestrator` | Model provider, structured drafting, deterministic fallback                                    | Calculating or changing financial values |
| `@fidt/policy-engine`   | Evidence, language, conflict, alternative, freshness checks                                    | Generating recommendations               |
| `@fidt/api`             | Auth, routes, repositories, public adapters, audit                                             | UI presentation                          |
| `@fidt/web`             | Advisor workflow and accessible presentation                                                   | Secrets or financial calculations        |

## Key request sequence

1. The API validates strategy inputs with Zod.
2. The domain package runs all strategies under one immutable assumption object and seed.
3. The API calculates potential advisor-revenue differences and persists the run.
4. The recommendation orchestrator sees selected household fields, scenario outputs, allowed citations, and conflicts.
5. Model output must satisfy the recommendation schema; otherwise the deterministic fallback is used.
6. The policy engine independently evaluates the draft.
7. A human must attest before approval is stored.
8. Scenario, model, and human actions append to the hash-chained audit table.

## Persistence

D1 stores a snapshot JSON for fast reconstruction plus normalized tables for future ingestion. Monetary columns in normalized tables use integer cents. Scenario outputs, prompts metadata, compliance decisions, and audit metadata are immutable JSON snapshots.

The audit table has triggers that reject update and delete. Each event hashes its canonical content and the previous event hash. In a higher-assurance deployment, export daily chain heads to immutable object storage or an external timestamp service.

## Failure behavior

- Public source unavailable: connector reports `UNAVAILABLE`; existing cached observations may be used and retain dates.
- OpenRouter unavailable/invalid: deterministic fallback creates a reviewable draft.
- Policy failure: recommendation is stored with `REQUIRE_CHANGES`; approval is disabled in the UI.
- Missing auth in production: request returns 401 before repository access.
- Invalid input: request returns a 422 with structured schema issues.
