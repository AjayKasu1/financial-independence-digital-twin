# Threat model

## Protected assets

- Household financial facts and documents
- Advisor identity and authorization
- OpenRouter and infrastructure secrets
- Deterministic calculation integrity
- Recommendation evidence and policy status
- Human review and audit-chain integrity

## Principal threats and controls

| Threat                     | Current control                                                           | Production follow-up                                           |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Key exposure               | Server-only secrets; no `VITE_*` key                                      | Secret rotation and DLP scanning                               |
| Unauthorized access        | Cloudflare Access JWT verification in production                          | Group/role authorization and session revocation tests          |
| Cross-tenant access        | Single synthetic tenant only                                              | Mandatory tenant key on every table/query plus isolation tests |
| Prompt injection           | Fixed prompt, structured context, allowed citations, schema validation    | Document sanitization and retrieved-content trust policy       |
| AI invents math            | Model instructed not to calculate; numeric source is deterministic output | Compare every drafted number against calculation registry      |
| Misleading language        | Guarantee and evidence policy rules                                       | Compliance-managed policy versions and regression suite        |
| Stale external fact        | Observation dates, retrieval dates, stale gate                            | Per-series release calendar and refresh alerts                 |
| Advisor compensation bias  | Deterministic fee delta and required disclosure                           | Firm-specific schedules and supervisory workflow               |
| Audit tampering            | Append-only SQL triggers and previous-hash chain                          | WORM export, external chain-head anchoring, privileged alerts  |
| Passport payload tampering | Canonical payload hash plus server-side HMAC verification                 | Asymmetric KMS/HSM signature and published verification keys   |
| Stale advice reuse         | Executable validity envelope, scheduled checks, one-way invalidation      | Custodian/CRM event streams and supervisory escalation SLA     |
| Fake monitoring input      | Live connectors and current household snapshot; overrides limited to demo | Signed connector events and source-specific validation         |
| Abuse/denial of service    | KV write rate limit and Cloudflare edge                                   | Durable rate limiter, bot controls, budgets and alerts         |
| XSS/clickjacking           | React escaping, CSP, frame denial, nosniff                                | Nonce-based CSP if third-party scripts are added               |
| Supply-chain compromise    | Lockfile, CI verification                                                 | Dependabot/Renovate, provenance, SCA policy                    |

## Trust boundaries

1. Browser to Worker: untrusted input; authenticate, validate, limit.
2. Worker to public government sources: untrusted response; parse defensively, date, cache.
3. Worker to LLM provider: data egress; minimize context and validate every response.
4. Worker to D1/KV: privileged persistence; least-privilege bindings and environment separation.
5. Automated policy to advisor: automation is advisory; explicit human attestation remains mandatory.

## Known demo limitations

KV increment-based limiting is not strongly atomic. D1 hash chaining is tamper-evident but not independently anchored. The normalized financial tables are prepared but the demo reads the canonical synthetic JSON snapshot. Vectorize and R2 remain future evidence-phase components and are intentionally not bound until used. These limits are intentional and documented rather than hidden.
