# ADR 004: Live Fiduciary Decision Passport

## Status

Accepted.

## Context

A recommendation can be compliant when approved yet become unsuitable when household facts, financing, public evidence, or client constraints change. A static PDF and an audit log prove what happened, but they do not answer whether the advice remains valid.

## Decision

Every approved recommendation receives an immutable Decision Passport. Its signed payload locks the scenario run, shared decision capital, executable Client Constitution, alternatives, conflicts, evidence ids, calculation references, governance versions, human-review audit event, and deterministic validity envelope.

Monitoring state is deliberately excluded from the signed payload. A scheduled Worker evaluates current observations against the envelope and appends each check separately. A material failure changes the passport to `INVALIDATED`; it never self-revalidates. A new human-reviewed recommendation and passport are required.

The LLM cannot create, sign, verify, monitor, invalidate, or approve a passport.

## Consequences

- Advice becomes continuously testable instead of merely archived.
- Capital-infeasible strategies are visible but cannot pass policy approval.
- Changes in thresholds are versioned through the Client Constitution.
- The demo uses Worker-held HMAC signing. Production must move signing to asymmetric KMS/HSM keys for independent verification and rotation.
