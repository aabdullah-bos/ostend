# Ostend Stage 1 Pipeline

## Slice Backlog

- [x] S-0001 | execution | Establish the TypeScript application and validation foundation

  Description:

  Create the source and test structure for the approved TypeScript, current Node.js LTS, Fastify, and Vitest implementation. Establish real build, unit-test, and integration-test commands and record them in `docs/validation.md`.

  Constraints:

  The repository has no existing application files or established commands. Select only dependencies needed by the approved SRS stack, keep protocol parsing independent from the server and proxy adapter, and do not scaffold optional future capabilities.

  Acceptance criteria:

  - The project can build a minimal TypeScript application.
  - Unit and integration test locations are established.
  - One representative automated test runs successfully.
  - `docs/validation.md` records only commands that exist and have been executed.

  Validation:

  - Confirm the application builds using the newly established command.
  - Confirm the representative automated test succeeds using the newly established command.

- [x] S-0002 | execution | Implement validated configuration and process lifecycle

  Description:

  Implement startup validation for the SRS configuration contract, observation-only profile mode, fixed upstream selection, hosted and local-development transport rules, health, readiness, graceful shutdown, and bounded request duration and request-field size.

  Acceptance criteria:

  - All required configuration fields are validated and invalid required configuration prevents readiness with a non-sensitive error.
  - Clients cannot select or override the configured upstream origin.
  - Hosted configuration requires HTTPS and production cannot disable upstream certificate and hostname validation.
  - Explicit local development can use only a loopback or controlled local HTTP upstream.
  - `/healthz`, `/readyz`, request timeout, header-size bounds, and configurable graceful shutdown satisfy the SRS.

  Validation:

  - Automated configuration and lifecycle checks cover valid, invalid, hosted, and local-development cases.
  - Health and readiness checks prove their documented outcomes without exposing secrets or materially loading the upstream.

- [x] S-0003 | execution | Implement Version 1 declaration parsing and classification

  Description:

  Implement RFC 9651-compatible parsing as a module independent from HTTP serving and proxying. Classify every declaration case and produce bounded reason codes without retaining raw values.

  Acceptance criteria:

  - The exact Version 1 dictionary is classified `valid`.
  - Missing, malformed, incomplete, unknown-member, unsupported-value, duplicate, and unsupported-version cases follow the SRS classification rules.
  - Valid Version 1 maps to `autonomous`; every other class maps to `unspecified`.
  - Parsing failures cannot crash the process or change observation-only forwarding policy.

  Validation:

  - Unit tests cover every case required by SRS section 13.1, including HTTP field-name case behavior and reason-code generation.

- [x] S-0004 | execution | Implement transparent fixed-upstream proxy forwarding

  Description:

  Forward common REST-style requests to the configured upstream while preserving credentials and application behavior within HTTP intermediary semantics, including streaming and conventional gateway failure responses.

  Acceptance criteria:

  - Methods, paths, query strings, permitted request fields, applicable cookies, `Authorization` values, and bodies reach the fixed upstream as required.
  - Upstream statuses, permitted response fields, response bodies, and repeated response fields are returned without application-level transformation.
  - JSON, form, multipart, binary, empty, and streaming traffic is supported without disclosure processing requiring full-body buffering.
  - Connection and timeout failures return appropriate `502`, `503`, or `504` responses without leaking sensitive internals.

  Validation:

  - Integration tests use a controlled mock upstream to prove forwarding, streaming, response preservation, gateway failures, and resistance to arbitrary-upstream selection.

- [x] S-0005 | execution | Enforce metadata boundaries and normalized disclosure fields

  Description:

  Sanitize all caller-supplied reserved metadata before adding normalized declaration fields, opaque request correlation, and the optional acknowledgement.

  Acceptance criteria:

  - Every case-insensitive caller-supplied `Proxy-Agent-*` field is removed before upstream forwarding.
  - Normalized declaration, mode, and profile fields obey the exact SRS presence and value rules.
  - Every request receives an opaque identifier; any accepted inbound identifier follows explicit configured trust and validation rules.
  - Acknowledgement is disabled by default, appears only for a valid declaration when enabled, and carries no authorization or proof semantics.
  - Classification remains non-blocking for all four classes.

  Validation:

  - Integration tests cover reserved-field injection, all normalized-field combinations, request correlation, acknowledgement states, and non-blocking forwarding.

- [x] S-0006 | execution | Implement privacy-conscious structured observations

  Description:

  Emit one newline-delimited structured JSON event for every completed request with the required request, operation, declaration, upstream outcome, timing, and software-version fields.

  Acceptance criteria:

  - Each completed request emits exactly one SRS-compliant observation event.
  - Invalid and unsupported cases use bounded reason codes and do not expose raw declarations.
  - Default logs exclude credentials, cookies, bodies, prompts, memory, task descriptions, raw health data, and sensitive query-string values.
  - Path logging can be reduced or normalized for paths containing sensitive identifiers.
  - Errors, health responses, traces, and metrics do not expose credentials, stack traces, filesystem paths, or private network configuration.

  Validation:

  - Automated log-capture tests prove required fields, event cardinality, deployed JSON format, and the absence of every prohibited data category.

- [x] S-0007 | execution | Complete protocol and proxy integration coverage

  Description:

  Assemble the parser, metadata boundary, proxy adapter, configuration, observations, and lifecycle into the observation-only service and cover their cross-component behavior.

  Acceptance criteria:

  - A valid autonomous declaration reaches the upstream as normalized autonomous metadata.
  - Missing, invalid, and unsupported declarations remain forwarded and map to unspecified mode.
  - Existing authorization decisions and upstream outcomes remain solely upstream-controlled and are preserved.
  - Oversized request fields are rejected at the configured bound.
  - Protocol failures, upstream failures, and shutdown behavior satisfy the documented safe-failure contract.

  Validation:

  - The complete SRS integration-test inventory passes against a controlled mock upstream.
  - Automated checks confirm credentials and bodies never appear in captured logs.

- [x] S-0008 | execution | Package a portable non-root OCI container

  Description:

  Package the application with the SRS-required multi-stage container build and non-root runtime behavior without depending on Railway-specific application APIs.

  Acceptance criteria:

  - The application builds and runs as an OCI-compatible container.
  - The runtime process is non-root.
  - Runtime configuration remains external and supports local operation plus Railway deployment.
  - The running container exposes functional health and readiness endpoints.

  Validation:

  - Build and run the container, inspect the runtime user, and exercise `/healthz` and `/readyz`.

- [x] S-0009 | execution | Publish protocol, integration, and trust-boundary documentation

  Description:

  Document the exact declaration profile, autonomous semantics, valid and invalid examples, acknowledgement meaning, downstream network boundary, operation, removal, and proof-of-concept limitations.

  Acceptance criteria:

  - Agent developers can participate using one HTTP field without an Ostend-specific SDK.
  - API owners can configure, deploy, observe, and remove Ostend without replacing credentials or authorization logic.
  - Documentation never presents voluntary declarations as verified facts or missing declarations as human.
  - Documentation states that Ostend terminates TLS, can access or modify HTTP messages, and does not provide end-to-end integrity against compromise.
  - Documentation warns against sensitive production traffic, requires test or narrowly scoped credentials for the proof of concept, and attributes baseline availability controls—not comprehensive denial-of-service protection—to Railway.
  - Downstream guidance prevents or rejects direct public bypass when normalized metadata is trusted.

  Validation:

  - Review the published examples and operational instructions against the PRD user-experience requirements and SRS security requirements.

- [x] S-0010 | execution | Verify controlled performance and privacy behavior

  Description:

  Establish a controlled measurement of disclosure-processing overhead and perform the required privacy and compatibility verification under expected MVP load.

  Acceptance criteria:

  - The controlled method separates application processing latency from network and upstream latency.
  - Measured disclosure processing is no more than 10 milliseconds at the 95th percentile under the documented expected MVP load, or the result is explicitly identified as an unmet acceptance condition.
  - Verification confirms that default logs contain neither credentials nor bodies and that caller-supplied internal metadata cannot override generated fields.
  - The measurement is documented as a product target rather than a public service-level agreement.

  Validation:

  - Run the established controlled performance and privacy checks and retain their non-sensitive results.

- [ ] S-0011 | execution | Deploy and validate the Railway proof of concept

  Description:

  Deploy the portable container as the Iteration 1 Railway proof of concept with a controlled upstream, finite platform resources, and non-sensitive credentials, then validate the complete hosted path.

  Acceptance criteria:

  - Railway uses finite CPU and memory allocations and provides baseline traffic handling, scaling, and availability controls.
  - The deployment uses test or short-lived, narrowly scoped credentials and carries no sensitive production traffic.
  - Client-to-proxy and proxy-to-upstream traffic use HTTPS, and invalid upstream certificate or hostname conditions fail.
  - Health, readiness, upstream connectivity, structured logs, and graceful deployment replacement operate successfully.
  - One compliant autonomous client and one test API complete the pilot path without changes to the upstream authorization system.

  Validation:

  - Perform every SRS deployment test and record the non-sensitive evidence and outcome.

- [ ] S-0012 | review | Assess Iteration 1 acceptance and pilot evidence

  Description:

  Review all implementation, automated-test, container, performance, deployment, documentation, and pilot evidence against the approved Iteration 1 acceptance criteria and success measures.

  Required output:

  - Record the acceptance outcome and any unmet criteria in `docs/decisions.md`.
  - Record evidence about declaration usability, compatibility, operator usefulness, requested context, and acknowledgement value.
  - Identify future questions separately without adding unapproved future capabilities to Iteration 1.

  Acceptance criteria:

  - Every PRD and SRS acceptance criterion has an evidence-backed status.
  - Required automated tests, container health checks, transport checks, privacy checks, and performance measurement are accounted for.
  - Any unmet condition is explicit and is not represented as completed.
  - Future-scope findings do not change the completed Iteration 1 contract.

## Handoff Notes

The approved inputs are the canonical `docs/prd.md` and `docs/srs.md`; no architecture, handoff, or behavioral-contract documents were supplied. The repository contains no established application files or validation commands. Execute slices in file order, use `docs/system.md` for durable constraints, and update `docs/validation.md` only when commands have been created and run. Do not execute a later slice while an earlier slice remains unchecked.
