# Contributing

1. Create a focused branch.
2. Keep financial math out of UI, routes, prompts, and model output.
3. Add deterministic tests for calculation changes and policy regression tests for language/evidence changes.
4. Use only synthetic data in fixtures, screenshots, issues, and pull requests.
5. Run `npm run verify` before opening a pull request.

Changes that alter assumptions, model prompts, policy decisions, fees, or audit behavior should update the relevant ADR or add a new one.
