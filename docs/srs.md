# Software Requirements Specification

## Autonomous Agent Disclosure Proxy — Iteration 1

**Document status:** Draft for implementation  
**Version:** 0.1.1  
**Date:** July 29, 2026  
**Intended implementation:** TypeScript, Node.js, Fastify  
**Initial deployment target:** Railway  

---

## 1. Purpose

This document specifies the first iteration of an HTTP disclosure proxy that can be placed in front of an existing API or HTTP service.

The proxy enables compliant clients to voluntarily declare that a request was selected, constructed, and submitted by a fully autonomous software agent. It observes and normalizes that declaration while preserving the existing service's authentication and authorization behavior.

This iteration is not intended to detect undeclared agents, prevent malicious activity, establish agent identity, or make access-control decisions.

For the proof of concept, the proxy is a trusted, TLS-terminating intermediary deployed on Railway. It terminates the client connection and establishes a separate connection to the upstream service. Iteration 1 does not provide end-to-end request integrity against a compromised proxy and does not independently provide comprehensive denial-of-service protection.

## 2. Product objective

The product shall provide an interoperable observation point at which:

1. A compliant autonomous agent can declare its participation in an HTTP request.
2. The proxy can parse and classify the declaration consistently.
3. The declaration can be associated with the existing authenticated request.
4. Downstream systems and operators can observe the classification.
5. Existing API behavior remains unchanged.

The principal question this iteration is intended to test is:

> Can autonomous clients reliably disclose their participation to existing services without requiring those services to replace their current authentication or authorization systems?

## 3. Definitions

### 3.1 Autonomous request

A request is **autonomous** when software selected, constructed, and submitted the specific API operation without a human reviewing and approving that operation before submission.

A request may still be autonomous when a human previously:

- Created or configured the agent.
- Authenticated the application.
- Assigned the agent's task.
- Granted general API permissions.
- Established operating constraints.
- Started the agent's execution.

### 3.2 Compliant client

A **compliant client** is a client that voluntarily sends a declaration conforming to this specification.

### 3.3 Existing service

The **existing service** is the upstream API or HTTP application protected by the proxy. It retains responsibility for its existing authentication, authorization, business logic, and response generation.

### 3.4 External declaration

The **external declaration** is the caller-provided `Agent-Interaction` HTTP request field.

### 3.5 Normalized metadata

**Normalized metadata** is proxy-generated information derived from the external declaration and supplied to logs or a trusted downstream service.

### 3.6 Unspecified request

An **unspecified request** is a request that contains no agent-interaction declaration. Unspecified does not mean human-generated.

## 4. Scope

### 4.1 In scope

Iteration 1 includes:

- HTTP and HTTPS reverse proxying to one configured upstream origin.
- Recognition of a voluntary autonomous-agent declaration.
- Parsing and validation of the declaration.
- Classification of declarations.
- Removal of caller-supplied reserved internal metadata.
- Addition of normalized internal metadata.
- Structured observation logs.
- Transparent forwarding of requests and responses.
- Health and readiness reporting.
- Automated unit and integration tests.
- Containerized deployment.
- An observation-only operating mode.

### 4.2 Out of scope

Iteration 1 shall not:

- Determine whether an undeclared caller is an agent or human.
- Verify that an autonomous declaration is truthful.
- Identify or attest a model, model version, framework, or agent runtime.
- Establish a cryptographic agent identity.
- Change an existing service's authorization decision.
- Issue OAuth tokens.
- Verify delegation chains.
- Prove human presence, supervision, or transaction approval.
- Block missing, malformed, or unsupported declarations.
- Inspect prompts, agent memory, reasoning, or task content.
- Store request or response bodies.
- Provide a policy-management user interface.
- Support arbitrary caller-selected upstream destinations.
- Guarantee byte-for-byte equivalence where HTTP intermediaries are permitted to normalize protocol framing.
- Provide end-to-end request confidentiality or integrity against a compromised Ostend deployment.
- Independently provide comprehensive denial-of-service protection.

## 5. Stakeholders

| Stakeholder | Interest |
|---|---|
| API owner | Observe autonomous use without replacing existing security controls |
| Agent developer | Declare autonomous participation through a simple interoperable mechanism |
| Service operator | Deploy, configure, monitor, and troubleshoot the proxy |
| Security or trust researcher | Study declaration semantics and adoption behavior |
| Downstream application developer | Consume normalized, proxy-generated classification metadata |

## 6. System context

```text
Compliant client
  ├── Existing service credential
  └── Agent-Interaction declaration
             │ HTTPS
             ▼
Autonomous Agent Disclosure Proxy
  ├── Terminates the client TLS connection
  ├── Sanitizes reserved headers
  ├── Parses the declaration
  ├── Classifies the request
  ├── Records an observation
  ├── Adds normalized internal metadata
  └── Forwards the request
             │ Separate HTTPS connection
             ▼
Existing upstream service
  ├── Performs existing authentication
  ├── Performs existing authorization
  └── Produces the response
```

The proxy is not an authentication authority. It associates the declaration with the request carrying the existing service credential but does not validate the meaning or ownership of that credential unless a future version explicitly adds that function.

The proxy and its deployment platform are trusted parts of the Iteration 1 request path. TLS protects each network connection from an outside interceptor, but the proxy can observe or modify HTTP messages by design. TLS on the two connections shall not be represented as end-to-end protection against a compromised proxy.

## 7. Protocol profile

### 7.1 External request field

A compliant autonomous client shall send:

```http
Agent-Interaction: actor=agent, mode=autonomous, version=1
```

The field value shall be encoded as an HTTP Structured Fields dictionary according to RFC 9651.

### 7.2 Version 1 vocabulary

Version 1 supports exactly these semantic members:

| Member | Required value | Type |
|---|---|---|
| `actor` | `agent` | Token |
| `mode` | `autonomous` | Token |
| `version` | `1` | Integer |

Unknown members shall cause the declaration to be classified as invalid in Iteration 1. This strict behavior prevents unreviewed extensions from acquiring accidental meaning.

### 7.3 Declaration classifications

Every request shall receive exactly one classification:

| Classification | Meaning |
|---|---|
| `valid` | The declaration is present and conforms to Version 1 |
| `missing` | No declaration was supplied |
| `invalid` | A declaration was supplied but is malformed, incomplete, duplicated, contradictory, or contains unsupported members or values |
| `unsupported` | The declaration is structurally valid but specifies an unsupported profile version |

When classification is `valid`, the interaction mode shall be `autonomous`.

### 7.4 Missing declarations

The absence of `Agent-Interaction` shall be classified as `missing` or presented operationally as `unspecified`.

The proxy and downstream services must not interpret absence as evidence that:

- A human generated the request.
- A human is currently present.
- A human reviewed the request.
- The request is non-autonomous.

### 7.5 Duplicate declarations

Multiple `Agent-Interaction` field lines, duplicate dictionary members, or values that cannot be unambiguously combined shall be classified as `invalid`.

### 7.6 Response acknowledgement

When enabled by configuration, the proxy should add the following response field for a valid declaration:

```http
Agent-Interaction-Accepted: mode=autonomous, version=1
```

The acknowledgement means only that the proxy recognized the declaration. It does not indicate authorization, endorsement, attestation, or proof.

The acknowledgement feature shall be disabled by default for the initial deployment.

## 8. Functional requirements

### FR-001 — Fixed upstream

The proxy shall forward requests only to an upstream origin specified by trusted deployment configuration.

The client shall not be able to select or override the upstream scheme, host, port, or base origin.

### FR-002 — Request forwarding

The proxy shall forward the original request method, path, query string, permitted request fields, and body to the configured upstream service.

### FR-003 — Existing credentials

The proxy shall forward existing authentication material, including the `Authorization` request field and applicable cookies, without changing their values.

The proxy shall not log authentication material.

### FR-004 — Response forwarding

The proxy shall return the upstream status code, permitted response fields, and response body to the client without application-level transformation.

### FR-005 — Streaming

The proxy shall stream request and response bodies where supported by the runtime and upstream connection. It shall not require full body buffering for disclosure processing.

### FR-006 — External declaration parsing

The proxy shall read and parse the `Agent-Interaction` request field using RFC 9651-compatible behavior.

### FR-007 — Classification

The proxy shall classify every request as `valid`, `missing`, `invalid`, or `unsupported`.

### FR-008 — Observation-only behavior

In Iteration 1, declaration classification shall not change whether a request is forwarded.

Valid, missing, invalid, and unsupported declarations shall all be forwarded, subject only to ordinary proxy operational limits.

### FR-009 — Reserved-field sanitization

Before forwarding, the proxy shall remove every caller-supplied request field whose name begins with the reserved prefix:

```text
Proxy-Agent-
```

Field-name matching shall be case-insensitive.

### FR-010 — Normalized internal metadata

After sanitization, the proxy shall add these normalized request fields:

```http
Proxy-Agent-Declaration: valid | missing | invalid | unsupported
Proxy-Agent-Profile: 1
Proxy-Agent-Mode: autonomous | unspecified
```

Requirements:

- `Proxy-Agent-Declaration` shall always be present.
- `Proxy-Agent-Mode` shall be `autonomous` only for a valid Version 1 declaration.
- `Proxy-Agent-Mode` shall be `unspecified` for every other classification.
- `Proxy-Agent-Profile` shall be present only when the supplied version is known.

Downstream services shall trust these fields only when network configuration guarantees that requests came through the proxy.

### FR-011 — Request identifiers

The proxy shall associate every request with a request identifier.

If the deployment accepts an existing request identifier, its trust and validation rules must be configured explicitly. Otherwise, the proxy shall generate a new opaque identifier.

The identifier shall be included in observation logs and may be forwarded to the upstream.

### FR-012 — Structured audit event

The proxy shall produce one structured observation event per completed request.

The event shall contain:

- Event type.
- Timestamp.
- Request identifier.
- HTTP method.
- normalized route or path, subject to logging policy.
- Declaration classification.
- Agent mode.
- Profile version when available.
- Upstream response status.
- Request duration.
- Proxy software version.

### FR-013 — Invalid declaration reason

For invalid or unsupported declarations, the proxy should record a bounded, non-sensitive reason code such as:

- `syntax_error`
- `missing_member`
- `unknown_member`
- `unsupported_actor`
- `unsupported_mode`
- `unsupported_version`
- `duplicate_declaration`

The raw declaration shall not be logged by default.

### FR-014 — Health endpoint

The proxy shall provide:

```http
GET /healthz
```

A healthy process shall return HTTP `200`.

The endpoint shall not disclose upstream credentials, environment variables, internal network information, or other secrets.

### FR-015 — Readiness endpoint

The proxy should provide:

```http
GET /readyz
```

Readiness shall indicate whether the proxy is configured and able to accept traffic. A readiness check should not create material load on the upstream service.

### FR-016 — Graceful shutdown

The proxy shall stop accepting new requests when shutdown begins and allow in-flight requests a configurable period to complete.

### FR-017 — Configuration

At minimum, deployment configuration shall support:

| Setting | Purpose |
|---|---|
| `UPSTREAM_ORIGIN` | Fixed upstream origin |
| `PORT` | Local listening port |
| `LOG_LEVEL` | Logging verbosity |
| `PROFILE_MODE` | Must be `observe` in Iteration 1 |
| `REQUEST_TIMEOUT_MS` | Maximum upstream request duration |
| `ACKNOWLEDGEMENT_ENABLED` | Enables response acknowledgement |
| `MAX_HEADER_BYTES` | Maximum accepted request-field size |

Configuration shall be validated at startup. Invalid required configuration shall prevent the process from becoming ready.

For a hosted deployment, `UPSTREAM_ORIGIN` shall use HTTPS. Plain HTTP may be supported only for an explicitly identified local-development configuration using a loopback or controlled local address.

## 9. Non-functional requirements

### NFR-001 — Compatibility

The proxy shall support common REST-style HTTP APIs, including:

- JSON bodies.
- Form bodies.
- Multipart requests.
- Binary bodies.
- Empty bodies.
- Streaming responses.
- Repeated response fields where supported by HTTP semantics.

### NFR-002 — Transparency

For requests unaffected by disclosure metadata, the presence of the proxy should not change application-level behavior.

### NFR-003 — Performance

Disclosure processing should add no more than 10 milliseconds of proxy application processing latency at the 95th percentile under expected MVP load, excluding network and upstream latency.

This target shall be measured in a controlled environment and is not a public service-level agreement.

### NFR-004 — Availability

The initial deployment shall expose a health check suitable for zero-downtime platform deployments.

No formal availability service-level objective is required for Iteration 1.

The hosted proof of concept shall rely on Railway's platform controls for baseline traffic handling, scaling, and availability protection. Comprehensive denial-of-service mitigation is not supplied by the application.

### NFR-005 — Privacy

Default logs shall not contain:

- `Authorization` values.
- Cookies.
- Request or response bodies.
- Raw health information.
- Prompts.
- Agent memory.
- Task descriptions.
- Full declaration values.
- Sensitive query-string values.

Path logging shall be configurable when paths may contain personal or sensitive identifiers.

### NFR-006 — Transport security

Public client-to-proxy traffic shall use HTTPS.

Hosted proxy-to-upstream traffic shall use HTTPS.

The proxy shall validate the upstream's TLS certificate and hostname.

TLS certificate validation shall not be disabled in a production configuration.

The application may allow plain HTTP to a loopback or controlled local upstream only when explicitly running in local-development mode.

### NFR-007 — Maintainability

Protocol parsing and classification shall be implemented independently from the HTTP server and proxy adapter.

### NFR-008 — Portability

The application shall be packaged as an OCI-compatible container and shall not depend on Railway-specific runtime APIs.

### NFR-009 — Observability

Application logs shall be newline-delimited structured JSON in deployed environments.

### NFR-010 — Failure behavior

Protocol classification errors shall not cause the proxy process to crash.

Upstream connection and timeout failures shall produce conventional gateway responses such as HTTP `502`, `503`, or `504`, as appropriate.

## 10. Security and trust requirements

Although Iteration 1 is not intended to stop malicious actors, the following boundaries are required to avoid introducing unrelated vulnerabilities.

### SR-001 — No open proxy

Clients shall not be able to cause the proxy to connect to an arbitrary host.

### SR-002 — Internal-field boundary

Caller-provided `Proxy-Agent-*` fields shall never reach the upstream unchanged.

### SR-003 — Credential confidentiality

The proxy shall not include credentials in errors, logs, traces, metrics, or health responses.

### SR-004 — Bounded inputs

The proxy shall use configurable limits for request-field size, request duration, and other runtime resources appropriate to its deployment.

### SR-005 — Safe errors

Error responses shall not reveal upstream credentials, internal stack traces, filesystem paths, or private network configuration.

### SR-006 — Trust semantics

Documentation and field names shall not represent a syntactically valid declaration as independently verified proof that the caller is an agent.

### SR-007 — Downstream isolation

When normalized internal metadata is enabled, deployment documentation shall require the upstream to reject or avoid direct public traffic that could bypass the proxy and supply forged internal fields.

### SR-008 — Trusted intermediary boundary

Iteration 1 shall treat Ostend and its deployment platform as trusted components.

Documentation shall state that Ostend terminates TLS, can access forwarded authentication material, and can observe or modify HTTP messages. The implementation shall not claim end-to-end confidentiality or integrity against a compromised Ostend instance.

### SR-009 — Proof-of-concept credential and data restrictions

The hosted proof of concept should use test credentials or credentials that are short-lived and narrowly scoped.

Deployment documentation shall advise operators not to route sensitive production traffic through the Iteration 1 Railway deployment.

### SR-010 — Baseline resource controls

The proxy shall apply configurable request-field-size and request-duration limits.

The deployment shall set finite CPU and memory allocations using Railway's available service controls. These controls limit accidental resource exhaustion but shall not be represented as comprehensive denial-of-service protection.

## 11. Proposed technology

### 11.1 Application

- TypeScript.
- Current Node.js LTS.
- Fastify.
- `@fastify/http-proxy` or `@fastify/reply-from`.
- Undici for outbound HTTP where direct use is needed.
- An RFC 9651-compatible Structured Fields parser.
- Zod for configuration validation.
- Pino through Fastify for structured logging.
- Vitest for unit and integration testing.

### 11.2 Packaging and deployment

- Docker multi-stage build.
- Non-root runtime user.
- Railway for the initial hosted deployment.
- Google Cloud Run as a compatible future container platform.

### 11.3 Persistence

Iteration 1 requires no application database. Observation events shall be emitted to standard output for collection by the deployment platform.

## 12. API examples

### 12.1 Valid autonomous declaration

```http
GET /health/heart-rate?period=14d HTTP/1.1
Host: proxy.example
Authorization: Bearer redacted
Agent-Interaction: actor=agent, mode=autonomous, version=1
```

Normalized upstream request fields:

```http
Proxy-Agent-Declaration: valid
Proxy-Agent-Profile: 1
Proxy-Agent-Mode: autonomous
```

### 12.2 Missing declaration

```http
GET /health/heart-rate?period=14d HTTP/1.1
Host: proxy.example
Authorization: Bearer redacted
```

Normalized upstream request fields:

```http
Proxy-Agent-Declaration: missing
Proxy-Agent-Mode: unspecified
```

The proxy shall not classify this request as human.

### 12.3 Unsupported version

```http
Agent-Interaction: actor=agent, mode=autonomous, version=2
```

Normalized upstream request fields:

```http
Proxy-Agent-Declaration: unsupported
Proxy-Agent-Profile: 2
Proxy-Agent-Mode: unspecified
```

The request shall still be forwarded in observation mode.

### 12.4 Attempted internal-field injection

Inbound request:

```http
Proxy-Agent-Declaration: valid
Proxy-Agent-Mode: autonomous
```

The proxy shall remove these values, classify the absent external declaration as `missing`, and generate:

```http
Proxy-Agent-Declaration: missing
Proxy-Agent-Mode: unspecified
```

## 13. Testing requirements

### 13.1 Unit tests

Unit tests shall cover:

- Valid Version 1 declaration.
- Missing declaration.
- Missing required members.
- Unknown members.
- Unsupported actor.
- Unsupported mode.
- Unsupported version.
- Invalid Structured Fields syntax.
- Duplicate declarations.
- Duplicate dictionary members.
- Case handling required by HTTP field semantics.
- Declaration reason-code generation.

### 13.2 Integration tests

Integration tests shall use a controlled mock upstream and verify:

- Methods, paths, and query strings are preserved.
- Existing `Authorization` values reach the upstream unchanged.
- Request bodies are forwarded.
- Binary bodies are forwarded.
- Streaming responses are not fully buffered.
- Upstream status codes are preserved.
- Permitted response fields are preserved.
- Caller-supplied `Proxy-Agent-*` fields are removed.
- Correct normalized fields are added.
- All four classifications remain non-blocking.
- Logs exclude credentials and bodies.
- Timeout behavior returns an appropriate gateway status.
- The proxy cannot be used to select an arbitrary upstream.
- Hosted configuration rejects a non-HTTPS upstream origin.
- Local-development configuration permits a controlled local HTTP upstream when explicitly enabled.
- Oversized request fields are rejected according to the configured limit.

### 13.3 Deployment tests

The deployed service shall be tested for:

- Successful `/healthz` response.
- Successful `/readyz` response.
- HTTPS access.
- Correct upstream connectivity.
- Successful certificate and hostname validation for the configured upstream.
- Failure to connect when the upstream certificate or hostname is invalid.
- Verification that production configuration cannot disable upstream certificate validation.
- Structured log emission.
- Graceful behavior during deployment replacement.
- Finite Railway CPU and memory allocation.

## 14. Acceptance criteria

Iteration 1 is accepted when all of the following are true:

1. A compliant client can send the Version 1 autonomous declaration.
2. The proxy classifies that declaration as `valid`.
3. The upstream receives `Proxy-Agent-Mode: autonomous`.
4. A request without a declaration is classified as `missing` or `unspecified`, never human.
5. Malformed and unsupported declarations are observed but not blocked.
6. Caller-supplied `Proxy-Agent-*` fields cannot override proxy-generated metadata.
7. Existing authentication material reaches the configured upstream unchanged.
8. The upstream remains solely responsible for authorization decisions.
9. Responses are returned without application-level transformation.
10. Structured logs contain the classification and exclude credentials and bodies.
11. Automated unit and integration tests pass.
12. The proxy runs from its container image and passes platform health checks.
13. Hosted traffic uses HTTPS on both the client-to-proxy and proxy-to-upstream connections.
14. The proxy validates the upstream certificate and hostname, and production configuration cannot disable that validation.
15. The Railway proof-of-concept deployment uses test or narrowly scoped credentials and is documented as unsuitable for sensitive production traffic.
16. Documentation identifies Ostend as a trusted TLS-terminating intermediary and states that Iteration 1 does not provide end-to-end integrity against a compromised proxy.
17. Documentation states that comprehensive denial-of-service mitigation is outside Iteration 1 and that baseline availability controls are supplied by Railway.

## 15. Known limitations

Iteration 1 has the following deliberate limitations:

- A malicious or noncompliant agent can omit the declaration.
- A human client can falsely declare itself autonomous.
- A syntactically valid declaration is not cryptographic proof.
- Existing service credentials may not distinguish humans from agents.
- The proxy does not express task purpose, delegation, capabilities, or human involvement beyond full autonomy.
- Observation logs may show only the traffic of clients willing to participate.
- Internal metadata is trustworthy only within a correctly configured proxy-to-upstream network boundary.
- Ostend terminates TLS and can access forwarded credentials and HTTP messages.
- Separate TLS connections do not provide end-to-end request integrity against a compromised Ostend deployment.
- A compromised proxy or deployment platform could read credentials, alter declarations, modify requests, or forge normalized metadata.
- Iteration 1 relies on Railway for baseline platform availability controls and does not independently provide comprehensive denial-of-service protection.
- Public proxying adds latency, an additional failure point, and potential resource cost under unexpected traffic.

These limitations do not constitute defects unless the implementation represents declarations as verified facts, represents the two TLS connections as end-to-end protection, or claims comprehensive denial-of-service protection.

## 16. Future considerations

The following may be considered after Iteration 1:

- A published discovery document under a well-known URI.
- Human-supervised and transaction-confirmed modes.
- Signed declaration envelopes.
- Proof-of-possession-bound declarations.
- Agent workload identities.
- OAuth token exchange for delegated authority.
- Task identifiers with privacy-preserving semantics.
- Delegation-chain representation.
- Capability and purpose restrictions.
- Policy evaluation and enforcement.
- OpenTelemetry semantic conventions.
- SDKs for TypeScript, Python, and other clients.
- Formal HTTP field registration or an Internet-Draft.
- Customer-managed and private-network deployments.
- Upstream sidecar, service-mesh, gateway-plugin, or application-middleware integrations.
- End-to-end HTTP message signatures verified by the upstream service.
- Sender-constrained OAuth credentials.
- Workload identity and mutual TLS between trusted services.
- Configurable rate limits, quotas, concurrency limits, and request-size limits.
- Integration with managed edge denial-of-service protection.

None of these are required for Iteration 1.

## 17. References

- RFC 9110 — HTTP Semantics: <https://datatracker.ietf.org/doc/html/rfc9110>
- RFC 9651 — Structured Field Values for HTTP: <https://datatracker.ietf.org/doc/html/rfc9651>
- RFC 9457 — Problem Details for HTTP APIs: <https://datatracker.ietf.org/doc/html/rfc9457>
- RFC 8615 — Well-Known Uniform Resource Identifiers: <https://datatracker.ietf.org/doc/html/rfc8615>
- RFC 9396 — OAuth 2.0 Rich Authorization Requests: <https://datatracker.ietf.org/doc/html/rfc9396>
- RFC 9449 — OAuth 2.0 Demonstrating Proof of Possession: <https://datatracker.ietf.org/doc/html/rfc9449>
- RFC 8693 — OAuth 2.0 Token Exchange: <https://datatracker.ietf.org/doc/html/rfc8693>
- RFC 9421 — HTTP Message Signatures: <https://datatracker.ietf.org/doc/html/rfc9421>
- RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens: <https://datatracker.ietf.org/doc/html/rfc8705>
- RFC 8446 — The Transport Layer Security Protocol Version 1.3: <https://datatracker.ietf.org/doc/html/rfc8446>

---

## Appendix A — Requirement interpretation

The terms **shall**, **should**, and **may** are used as follows:

- **Shall:** Required for Iteration 1 acceptance.
- **Should:** Recommended unless a documented implementation constraint justifies omission.
- **May:** Optional.

## Appendix B — Foundational trust statement

This specification treats identity, capability, and context as separate concerns:

- **Identity** establishes which principal is accountable.
- **Capability** establishes which resources and operations are available.
- **Context** establishes the circumstances in which a capability is exercised.

Iteration 1 adds one contextual observation: a compliant caller's declaration that a particular request was autonomous. It does not alter identity or capability and does not independently verify that context.
