# ADR 002: Cloudflare deployment with portable domain boundaries

Status: accepted

## Decision

Deploy the demonstration as one Cloudflare Worker with static assets, Hono, D1, KV, R2, and Vectorize. Restrict Cloudflare types to the API persistence/infrastructure layer; domain, contracts, policy, and AI orchestration remain platform independent.

## Consequences

The first hosted version can be inexpensive and operationally small. Migrating to AWS requires repository, cache, storage, vector, auth, and runtime adapters, not a rewrite of financial logic or product contracts.
