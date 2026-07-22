# Data governance and provenance

## Data classes

| Class              | Demo behavior                                | Production control                                            |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------- |
| Household data     | Synthetic only                               | Minimize fields, encrypt, tenant scope, retention policy      |
| Calculation output | Versioned and reproducible                   | Immutable assumptions, engine version, test evidence          |
| Public facts       | URL, observation/retrieval dates, stale flag | Refresh SLA and source-specific validation                    |
| Advisor judgment   | Explicit statement label                     | Named author, timestamp, human review                         |
| AI suggestion      | Explicit statement label                     | Prompt/model version, schema validation, no autonomous action |
| Audit data         | Append-only hash chain                       | Restricted access and external immutable backup               |

## Public connectors

- U.S. Treasury daily XML feed: no API key. [Official feed documentation](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed)
- BLS Public Data API CPI-U series `CUUR0000SA0`: single-series public access is available without including a registration key. [Official BLS developer documentation](https://www.bls.gov/developers/)
- FHFA HPI state JSON table: no API key. [Official FHFA HPI datasets](https://www.fhfa.gov/house-price-index)
- SEC EDGAR JSON: no API key, but automated clients must follow fair-access guidance and identify themselves. [Official SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

The demo checks SEC connectivity with a reference issuer but does not attach that issuer to the synthetic employer. This prevents accidental creation of false client provenance.

## Staleness

The connector marks an observation stale after 45 days. Policy evaluates freshness only when a statement actually cites a public observation. Monthly data may need a series-specific release-date policy before production; the global threshold is intentionally conservative for the demo.

## LLM data boundary

The browser never receives the model key. The prompt contains only the minimum household fields needed to explain the selected scenario, deterministic scenario output, allowed evidence, disclosed conflicts, and optional advisor rationale. The OpenRouter request asks providers to deny data collection and use zero-data-retention routing. Provider availability and policy can change, so production configuration must verify the selected provider’s current privacy terms.

## Before real client use

- Complete a privacy impact assessment and vendor due diligence.
- Implement tenant isolation and field-level authorization.
- Define retention, deletion, legal-hold, and incident-response procedures.
- Add source-document access controls and malware scanning.
- Add backup restore tests and independently verify audit-chain continuity.
- Obtain legal/compliance review for recordkeeping, advertising, privacy, and fiduciary obligations.
