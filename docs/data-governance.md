# Data governance and provenance

## Data classes

| Class                | Demo behavior                                                           | Production control                                                   |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Household data       | Synthetic only                                                          | Minimize fields, encrypt, tenant scope, retention policy             |
| Calculation output   | Versioned and reproducible                                              | Immutable assumptions, engine version, test evidence                 |
| Public facts         | URL, observation/retrieval dates, stale flag                            | Refresh SLA and source-specific validation                           |
| Advisor judgment     | Explicit statement label                                                | Named author, timestamp, human review                                |
| AI suggestion        | Explicit statement label                                                | Prompt/model version, schema validation, no autonomous action        |
| Audit data           | Append-only hash chain                                                  | Restricted access and external immutable backup                      |
| Client Constitution  | Versioned synthetic preferences and constraints                         | Dual approval, effective dating, change rationale                    |
| Decision Passport    | Immutable signed payload plus monitored state                           | Asymmetric/KMS signing, key rotation, independent verification       |
| Household resilience | Deterministic output from household facts and an explicit stress vector | Versioned method, reviewed policy floors, reproducible shock library |
| Evidence document    | Synthetic structured text, SHA-256 content hash, allowlisted extraction | Encrypted object storage, malware scan, retention and access policy  |
| Extracted fact       | Proposed until advisor confirmation; source excerpt and confidence      | Dual control for sensitive fields, reconciliation and exception SLA  |
| Opportunity score    | Deterministic queue rank with visible reasons and blockers              | Versioned methodology, drift review, fairness and outcome monitoring |
| Strategy compilation | Versioned bounded alternatives, constraints, economics, frontier        | Template governance, change control, suitability and outcome review  |

## Evidence admission

The demo accepts only the three included synthetic structured statement types. Extraction is deterministic and field-allowlisted. Raw provider text, arbitrary JSON paths, and LLM-created facts are not admitted.

Each document receives a SHA-256 content hash. Every extraction retains the exact source line, normalized value, confidence, destination field, affected decision surfaces, and review status. A proposed fact cannot change calculations. Advisor confirmation writes the value and document provenance to the household snapshot, records it in `source_facts`, supersedes the prior active fact for the same path, and appends two distinct audit events.

Production personal-document ingestion would additionally require encrypted binary storage, malware scanning, tenant-scoped authorization, document-class validation, redaction controls, retention/deletion policy, and a privacy-impact assessment. None of those controls are implied by the synthetic demo.

## Opportunity Radar boundary

The Radar score is a deterministic work-queue priority, not a financial recommendation, product score, or approval. It ranks deadline urgency, capital at stake, constitution status, evidence readiness, and passport impact. All inputs and reasons are returned with the score. Recommendation approval and execution remain separate server-controlled workflows.

## Strategy Compiler boundary

Strategy Compiler v1 accepts only an evidence-ready RSU opportunity. It enumerates five reviewed action templates, runs them through the deterministic financial engine, rejects signed Client Constitution breaches, exposes advisor-revenue differences, and labels the Pareto frontier. No LLM creates a strategy, changes a calculation, or selects a winner.

An advisor-selected focus is presentation state, not a recommendation. Promotion sends every eligible alternative together, and the server compares household id, event id, capital, and strategies with the stored immutable compilation before a scenario run can be created. Compilation and promotion are separate hash-chained audit events. Tax-basis review remains explicitly missing execution evidence and no trade or custodian instruction is produced.

## Public connectors

- U.S. Treasury daily XML feed: no API key. [Official feed documentation](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed)
- BLS Public Data API CPI-U series `CUUR0000SA0`: single-series public access is available without including a registration key. [Official BLS developer documentation](https://www.bls.gov/developers/)
- FHFA HPI state JSON table: no API key. [Official FHFA HPI datasets](https://www.fhfa.gov/house-price-index)
- SEC EDGAR JSON: no API key, but automated clients must follow fair-access guidance and identify themselves. [Official SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

The demo checks SEC connectivity with a reference issuer but does not attach that issuer to the synthetic employer. This prevents accidental creation of false client provenance.

NerdWallet's Consumer Financial Resilience Index is registered as dated external, population-level evidence. It is never joined into household facts and never changes the Household Optionality Score. The score is an independently named planning control calculated only from the household snapshot, Client Constitution, decision capital, and advisor-selected shock. See [ADR 005](adr/005-household-optionality-score.md).

## Staleness

The connector retains both the economic observation date and retrieval timestamp. Recommendation policy evaluates observation age only when a statement actually cites that fact. Passport monitoring evaluates retrieval freshness, preventing a current monthly release from being mistaken for an unavailable feed merely because its observation period began earlier. Production should add source-specific release calendars.

## Decision Passport integrity

The signed payload contains no mutable monitoring state. It locks the scenario run, Client Constitution, evidence ids, calculation references, policy/model versions, conflicts, alternatives, resilience assessment and stress vector when present, human-review audit event, and validity envelope. Demo verification uses an HMAC key held only by the Worker. A production deployment should use an asymmetric key in managed KMS/HSM, publish the verification key, rotate by `keyId`, and retain retired public keys for historical verification.

## LLM data boundary

The browser never receives the model key. The prompt contains only the minimum household fields needed to explain the selected scenario, deterministic scenario output, allowed evidence, disclosed conflicts, and optional advisor rationale. Every OpenRouter request denies provider data collection. The synthetic-only `demo` environment may use a non-ZDR free endpoint; all other environments enforce zero-data-retention routing. Real client data is prohibited in demo mode. Provider availability and policy can change, so production configuration must verify the selected provider’s current privacy terms.

## Before real client use

- Complete a privacy impact assessment and vendor due diligence.
- Implement tenant isolation and field-level authorization.
- Define retention, deletion, legal-hold, and incident-response procedures.
- Add source-document access controls and malware scanning.
- Add backup restore tests and independently verify audit-chain continuity.
- Obtain legal/compliance review for recordkeeping, advertising, privacy, and fiduciary obligations.
