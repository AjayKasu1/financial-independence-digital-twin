# ADR 001: Deterministic financial core

Status: accepted

## Decision

All financial values are calculated in `@fidt/domain` with explicit assumptions, decimal money handling, seeded randomness, and testable pure functions. A language model may select, organize, and explain existing output but cannot create or revise financial calculations.

## Consequences

Scenario runs are reproducible and calculation claims can link to stable field paths. Adding a new model provider does not change financial results. More engine code and tests are required, but this is the correct tradeoff for advisor trust and auditability.
