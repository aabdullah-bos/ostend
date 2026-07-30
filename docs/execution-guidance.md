# Ostend Execution Guidance

## Workflow Rules

- Execute the first unchecked slice in `docs/pipeline.md` and keep each change bounded to that slice.
- Treat `docs/system.md` as the durable execution constraint set and consult the preserved PRD and SRS when source detail is needed.
- Establish the TypeScript project structure and real validation commands in S-0001; record only commands that exist and have been executed.
- Keep protocol parsing and classification independent from HTTP server and proxy-adapter code.
- Use controlled mock upstreams for proxy integration tests so credentials, bodies, streaming, failures, and field boundaries can be observed safely.
- Preserve existing authentication values in transit while preventing them from entering logs, errors, health output, traces, or metrics.
- Keep runtime configuration external, validate it before readiness, and distinguish explicit local-development transport exceptions from hosted production behavior.
- Update `docs/decisions.md` only for genuine durable choices or acceptance outcomes; do not turn every requirement into a decision.

## Anti-Patterns

- Inventing build, test, lint, deployment, or performance commands before they exist.
- Combining protocol parsing with proxy transport behavior in one inseparable component.
- Treating a declaration as identity proof, using it to authorize, or treating its absence as human involvement.
- Buffering full bodies to inspect disclosure metadata.
- Passing caller-provided reserved fields upstream or permitting the request to choose its upstream.
- Logging raw declarations, credentials, cookies, bodies, sensitive path/query data, or private operational details.
- Disabling upstream certificate validation in production or claiming end-to-end protection.
- Expanding the backlog with PRD future considerations or optional “could have” capabilities.

## Definition of Done

A slice is done when its acceptance criteria are met, applicable automated or manual validation has succeeded, new real commands are recorded in `docs/validation.md`, and durable constraints remain intact. A completed slice must not conceal an unmet requirement, sensitive-data exposure, transport weakness, or observation-to-enforcement drift.

## Sequencing Guidance

First establish the source/test foundation and executable validation workflow. Then implement configuration and lifecycle before the independent protocol classifier and transparent proxy path. Add trusted metadata, correlation, observations, and cross-component integration before containerization. Complete product and operational documentation before controlled performance verification and Railway deployment. Finish with an evidence-based acceptance review; do not implement deferred future capabilities as part of that review.
