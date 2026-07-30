# Ostend System Constraints

## Purpose

Ostend Iteration 1 is an observation-only, fixed-upstream HTTP disclosure proxy. It makes a compliant caller's voluntary autonomous-request declaration visible alongside request identity, attempted operation, and upstream outcome while preserving the upstream service's authentication, authorization, business logic, and response generation.

## Product Invariants

- Every request is classified exactly once as `valid`, `missing`, `invalid`, or `unsupported`.
- Only a valid Version 1 declaration yields mode `autonomous`; every other classification yields `unspecified`. Missing metadata is never evidence of human involvement.
- Declaration classification never changes whether a request is forwarded, apart from ordinary proxy operational limits.
- Ostend records a voluntary claim, not proof of agent identity, truthfulness, safety, authorization, supervision, or approval.
- The upstream service remains authoritative for authentication and authorization. Existing `Authorization` fields and applicable cookies are forwarded without value changes and are never logged.
- Clients cannot select or override the single upstream origin configured by trusted deployment configuration.
- Caller-supplied fields beginning with `Proxy-Agent-`, matched case-insensitively, never reach the upstream unchanged; normalized fields are generated only after sanitization.
- Request and response application behavior is preserved within normal HTTP intermediary semantics, including methods, paths, query strings, permitted fields, bodies, statuses, and streaming where supported.
- Default observations minimize data and exclude credentials, cookies, bodies, prompts, agent memory, task descriptions, raw declaration values, raw health data, and sensitive query-string values.
- The application has no database in Iteration 1; deployed observation events are newline-delimited structured JSON written to standard output.
- The public proof of concept uses HTTPS on both network connections, validates the upstream certificate and hostname, and cannot disable that validation in production.
- Ostend and Railway are trusted intermediaries for the proof of concept; the product does not claim end-to-end integrity against their compromise or comprehensive denial-of-service protection.

## Drift Guards

- Do not add enforcement, agent detection, agent authentication, new credentials, delegation, task-purpose claims, policy management, dashboards, arbitrary upstream routing, or other future-scope capabilities.
- Keep protocol parsing and classification independent from the HTTP server and proxy adapter.
- Support exactly the Version 1 Structured Fields dictionary members `actor=agent`, `mode=autonomous`, and `version=1`; unknown members are invalid, while a structurally valid unsupported version is `unsupported`.
- Multiple declarations, duplicate dictionary members, contradictory values, and values that cannot be combined unambiguously are invalid.
- Response acknowledgement is configuration-controlled, disabled by default, emitted only for a valid declaration, and described only as recognition.
- Hosted upstreams require HTTPS. Plain HTTP is permitted only for an explicitly identified local-development configuration using a loopback or controlled local address.
- The implementation remains OCI-portable and must not depend on Railway-specific runtime APIs.

## Known Contracts

- External declaration: `Agent-Interaction: actor=agent, mode=autonomous, version=1`.
- Optional valid-declaration acknowledgement: `Agent-Interaction-Accepted: mode=autonomous, version=1`.
- Normalized fields: `Proxy-Agent-Declaration` is always present; `Proxy-Agent-Mode` is `autonomous` only for valid Version 1 and otherwise `unspecified`; `Proxy-Agent-Profile` is present only when the supplied version is known.
- Health is `GET /healthz` with HTTP `200` for a healthy process. Readiness is `GET /readyz` and reflects configuration and traffic acceptance without materially loading the upstream.
- Required configuration includes `UPSTREAM_ORIGIN`, `PORT`, `LOG_LEVEL`, `PROFILE_MODE`, `REQUEST_TIMEOUT_MS`, `ACKNOWLEDGEMENT_ENABLED`, and `MAX_HEADER_BYTES`; `PROFILE_MODE` is `observe`.
- Each request has an opaque identifier. Accepting an inbound identifier requires explicit trust and validation rules; otherwise Ostend generates one. Completed requests produce one observation event with the SRS-required identity, operation, classification, outcome, timing, and software-version fields.
- Invalid or unsupported declarations may use only bounded, non-sensitive reason codes; raw declaration values are not logged by default.
- Shutdown stops new request acceptance and permits in-flight requests a configurable completion period. Upstream connection and timeout failures return appropriate conventional gateway responses.
- The implementation stack specified by the approved sources is TypeScript, current Node.js LTS, Fastify, an RFC 9651-compatible Structured Fields parser, Zod configuration validation, Pino structured logging, and Vitest tests.

## Unknowns

- No implementation uncertainty changes the known Iteration 1 backlog. Concrete library selection between the SRS-permitted Fastify proxy adapters, exact route-normalization policy, request-identifier trust policy, and runtime resource defaults must be established within their owning slices while preserving these constraints.
- The PRD's future product questions are explicitly non-blocking and are not Iteration 1 requirements.

## Anti-Patterns

- Treating `missing` as human or `valid` as verified.
- Buffering complete bodies solely to process disclosure metadata.
- Logging or exposing sensitive payloads, credentials, private network details, stack traces, or filesystem paths.
- Allowing direct client control of the upstream destination or trusting caller-provided internal metadata.
- Weakening production TLS verification or presenting two TLS connections as end-to-end protection.
- Claiming the application supplies comprehensive denial-of-service protection.
- Adding optional future SDKs, metrics, discovery, tracing, alternate deployment forms, or enforcement without a separately approved requirement.

## Definition of Done

Iteration 1 is done only when its required protocol, fixed-upstream proxying, sanitation, normalized metadata, request correlation, privacy-conscious structured observations, health/readiness, failure handling, graceful shutdown, transport controls, container packaging, documentation, automated tests, controlled performance measurement, and Railway proof-of-concept checks satisfy the PRD and SRS acceptance criteria. The hosted proof of concept must use test or narrowly scoped credentials, avoid sensitive production traffic, have finite Railway CPU and memory allocation, and accurately document its trust and availability boundaries.
