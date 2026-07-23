# ADR 005: Household Optionality Score

- Status: accepted
- Date: 2026-07-22

## Context

Financial planning often reports a single long-horizon probability while hiding how quickly a household loses choices during an income gap, emergency, or correlated market and employer-stock event. The product needs a reproducible way to answer a narrower fiduciary question: after an explicit shock, can the household preserve liquidity, avoid emergency credit, respect its signed constraints, and still choose among reasonable uses of capital?

NerdWallet separately publishes a Consumer Financial Resilience Index (FRI) based on five equally weighted population-survey questions. That index is useful context, but it is not a household planning calculation and must not be reverse-engineered, relabeled, or used as an input to individualized advice.

## Decision

Add a deterministic `household-optionality-v1` engine to `@fidt/domain` and expose it as **Household Optionality Score** in Resilience Mode.

The engine accepts only:

- a versioned household snapshot;
- a signed Client Constitution;
- an explicit shock vector;
- shared decision capital; and
- the capital required by each modeled alternative.

The shock vector contains emergency expense, income-loss percentage and duration, employer-stock decline, broad-market decline, and spending-cost increase. Zod validates API input, and the domain validates finite values and ranges again.

The 0–100 score is the weighted sum of six independently visible controls:

| Control               | Weight | Passing rule                                                    |
| --------------------- | -----: | --------------------------------------------------------------- |
| Credit-free runway    |    25% | At or above the Constitution's minimum months                   |
| Protected liquidity   |    20% | At or above the signed liquidity floor                          |
| Shock absorption      |    15% | Required external credit at or below the signed maximum         |
| Income continuity     |    15% | Modeled interruption-period income covers spending              |
| Concentration control |    10% | Employer stock at or below the signed maximum                   |
| Options remaining     |    15% | Feasible modeled uses of capital at or above the signed minimum |

Component scores are capped to 0–100 before weighting. Bands are `FORTIFIED` (85–100), `RESILIENT` (70–84.9), `EXPOSED` (50–69.9), and `FRAGILE` (below 50). Client policy is enforced from explicit floors—not from the display band.

## Governance behavior

- Workbench runs are session-only and do not write to the audit ledger.
- Promotion passes the exact stress vector and original capital to governed review.
- The API recalculates the stress server-side and rejects capital above the amount preserved after the liquidity floor.
- Every Constitution breach becomes a blocking policy reason.
- Approved runs sign the shock, assessment, and four resilience validity conditions into the Decision Passport.
- Passport monitoring recalculates optionality from current household facts; score, runway, credit, or option-floor failure invalidates or reopens review according to existing passport rules.
- The LLM may explain stored outputs but cannot calculate, override, or repair them.

## External-index boundary

The official NerdWallet FRI observation is stored and displayed as dated evidence with its source, observation date, publication date, survey sample, and methodology note. UI copy states that it is population context only. It is not included in the scoring function, recommendation calculations, or passport thresholds.

This naming and provenance boundary prevents false equivalence between a public consumer-sentiment measure and an individualized household control.

## Consequences

Positive:

- An advisor can show what fails first instead of relying on a black-box grade.
- Shock assumptions, scoring, option loss, policy decisions, and approvals are reproducible.
- Resilience is integrated into the same capital constraint, policy gate, passport signature, and monitoring loop as the rest of the platform.

Limitations:

- The demo models accessible cash and taxable assets; it does not model taxes, credit-line terms, severance, disability insurance, asset-sale timing, or account-specific liquidation restrictions.
- Component weights and policy defaults require validation by the firm's investment, planning, compliance, and model-risk owners before real-client use.
- A high score does not predict markets, guarantee outcomes, or replace an emergency-fund and insurance review.
