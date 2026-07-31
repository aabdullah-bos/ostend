# Ostend Iteration 1 Guide

This guide describes the Version 1 declaration, client and downstream
integration, operation, removal, and security boundaries for the Ostend proof
of concept.

Ostend is observation-only. It records a caller's voluntary declaration; it
does not verify that the caller is an agent, that the declaration is truthful,
or that the request is safe or authorized. The upstream service remains solely
responsible for authentication, authorization, business logic, and responses.

## Client protocol

### Declaring an autonomous request

A request is **autonomous** when software selected, constructed, and submitted
the specific API operation without a human reviewing and approving that
operation before submission. The request can still be autonomous when a human
previously created or configured the agent, authenticated the application,
assigned a broader task, granted general permissions, established constraints,
or started execution.

A compliant client participates by adding one HTTP request field. No
Ostend-specific SDK is required:

```http
Agent-Interaction: actor=agent, mode=autonomous, version=1
```

The value is an RFC 9651 Structured Fields dictionary. Version 1 has exactly
three members:

| Member | Required value | Type |
|---|---|---|
| `actor` | `agent` | token |
| `mode` | `autonomous` | token |
| `version` | `1` | integer |

Member order does not change the dictionary's meaning. Unknown or duplicate
members are invalid.

For example, a client can add the declaration with any ordinary HTTP library:

```sh
curl https://proxy.example/orders/123 \
  -H 'Authorization: Bearer <test-or-narrowly-scoped-token>' \
  -H 'Agent-Interaction: actor=agent, mode=autonomous, version=1'
```

Do not put prompts, task descriptions, model details, user data, or credentials
in `Agent-Interaction`.

### Classification

Ostend classifies every request once:

| Classification | Meaning | Normalized mode |
|---|---|---|
| `valid` | The declaration exactly conforms to Version 1 | `autonomous` |
| `missing` | No declaration was supplied | `unspecified` |
| `invalid` | The declaration is malformed, incomplete, duplicated, contradictory, or has an unknown member or unsupported value | `unspecified` |
| `unsupported` | The declaration is structurally valid but names an unsupported version | `unspecified` |

These are classifications of supplied metadata, not verified facts about the
caller. In particular, `missing` and `unspecified` never mean human-generated,
human-present, human-reviewed, or non-autonomous. A caller can omit or falsify
a declaration. All four classes continue to the upstream in observation mode,
subject only to ordinary proxy limits and failures.

Examples:

```http
# Valid
Agent-Interaction: actor=agent, mode=autonomous, version=1

# Invalid: required member missing
Agent-Interaction: actor=agent, version=1

# Invalid: Version 1 has no "purpose" member
Agent-Interaction: actor=agent, mode=autonomous, version=1, purpose="booking"

# Invalid: mode is not supported
Agent-Interaction: actor=agent, mode=supervised, version=1

# Unsupported: structurally valid declaration for a future version
Agent-Interaction: actor=agent, mode=autonomous, version=2
```

Malformed syntax, multiple field lines, duplicate dictionary members, and
values that cannot be combined unambiguously are also invalid. The proxy does
not log the raw invalid value by default.

### Optional acknowledgement

Acknowledgement is disabled by default. When the operator enables it, Ostend
adds this response field only after recognizing a valid Version 1 declaration:

```http
Agent-Interaction-Accepted: mode=autonomous, version=1
```

Acknowledgement means recognition only. It is not authorization, endorsement,
attestation, proof of agent identity, or proof that the declaration is true.
Its absence can mean the feature is disabled and must not be treated as a
rejection of the upstream operation.

## Downstream integration

Ostend removes every caller-supplied field whose name begins with
`Proxy-Agent-`, case-insensitively, before generating normalized fields:

```http
Proxy-Agent-Declaration: valid | missing | invalid | unsupported
Proxy-Agent-Mode: autonomous | unspecified
Proxy-Agent-Profile: 1
```

`Proxy-Agent-Declaration` and `Proxy-Agent-Mode` are always present.
`Proxy-Agent-Profile` is present only when the supplied version is known.
Downstream applications can consume these fields without parsing
`Agent-Interaction`, but they must continue to use their existing credentials
and authorization rules. The fields communicate an observed voluntary claim;
they must not be used as verified identity or authorization evidence.

The normalized fields are trustworthy only inside an enforced
proxy-to-upstream network boundary. Configure the upstream to reject direct
public traffic, or make it private so clients cannot bypass Ostend and send
forged `Proxy-Agent-*` fields. If direct bypass cannot be prevented, do not
treat normalized metadata as trusted.

## Configure and run

Build and test locally:

```sh
npm ci
npm run build
npm run test:unit
npm run test:integration
npm run test:container
```

The container runs as a non-root user and listens on the configured `PORT`.
Supply runtime configuration externally:

| Setting | Meaning |
|---|---|
| `UPSTREAM_ORIGIN` | The single fixed upstream origin |
| `PORT` | Local listening port |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info`, `debug`, or `trace` |
| `PROFILE_MODE` | Must be `observe` |
| `REQUEST_TIMEOUT_MS` | Positive upstream request timeout |
| `ACKNOWLEDGEMENT_ENABLED` | `true` or `false`; use `false` by default |
| `MAX_HEADER_BYTES` | Request-field limit, at least 1024 bytes |
| `DEPLOYMENT_MODE` | `hosted` or `local` |
| `SHUTDOWN_GRACE_MS` | Positive in-flight shutdown grace period |
| `PATH_LOGGING_MODE` | Optional: `normalized` (default) or `redacted` |

Example local run against a controlled loopback upstream:

```sh
UPSTREAM_ORIGIN=http://127.0.0.1:9000 \
PORT=8080 \
LOG_LEVEL=info \
PROFILE_MODE=observe \
REQUEST_TIMEOUT_MS=30000 \
ACKNOWLEDGEMENT_ENABLED=false \
MAX_HEADER_BYTES=16384 \
DEPLOYMENT_MODE=local \
SHUTDOWN_GRACE_MS=10000 \
PATH_LOGGING_MODE=redacted \
npm start
```

Plain HTTP upstreams are accepted only in explicit local mode for loopback or
controlled local addresses. Hosted mode requires an HTTPS upstream and rejects
an attempt to disable Node.js TLS certificate validation.

### Deploy and observe

1. Build the OCI image from the repository `Dockerfile`.
2. Configure exactly one `UPSTREAM_ORIGIN` and the remaining settings above.
3. In hosted mode, expose Ostend to clients through HTTPS and use HTTPS to the
   upstream. Do not disable certificate or hostname validation.
4. Prevent direct public access to the upstream when it consumes normalized
   metadata.
5. Direct test traffic to the Ostend endpoint using the same credentials and
   authorization model already accepted by the upstream.
6. Configure `GET /healthz` as the process health check and `GET /readyz` as
   the traffic-readiness check.
7. Observe newline-delimited JSON on standard output. Events describe request
   identifiers, operations, declaration classifications, upstream outcomes,
   and timing without logging credentials or bodies by default.
8. Send a termination signal for graceful shutdown; Ostend stops accepting new
   requests and gives in-flight requests the configured grace period.

Invalid required configuration prevents readiness and reports only the
non-sensitive names of invalid settings.

### Remove Ostend

Ostend does not issue credentials or replace upstream authorization. To remove
it:

1. Stop new traffic and allow the configured graceful-shutdown period.
2. Change the client, gateway, or DNS route from Ostend back to the existing
   upstream endpoint.
3. Remove the Ostend service and its deployment configuration.
4. Remove downstream dependencies on `Proxy-Agent-*` fields, or treat their
   absence as unspecified.

Existing credentials, permissions, and upstream authorization logic do not
need replacement. If the upstream was made private to enforce the metadata
boundary, deliberately restore only the intended ingress path; do not
accidentally expose an endpoint that still trusts normalized fields.

## Trust and proof-of-concept boundaries

Ostend and Railway are trusted intermediaries in the Iteration 1 proof of
concept. Ostend terminates the client TLS connection, establishes a separate
TLS connection to the upstream, can access forwarded authentication material,
and can observe or modify HTTP requests and responses by design.

TLS protects each connection against an outside interceptor, but the two TLS
connections do not provide end-to-end confidentiality or integrity against a
compromised Ostend instance or deployment platform. A compromise could expose
credentials or messages, alter declarations or requests, or forge normalized
metadata.

For the Railway proof of concept:

- use test credentials or credentials that are short-lived and narrowly
  scoped;
- do not route sensitive production traffic through the deployment;
- configure finite CPU and memory allocations;
- rely on Railway only for baseline traffic handling, scaling, and availability
  controls.

Finite resources and Railway's baseline controls are not comprehensive
denial-of-service protection. Production use requires a separately approved
deployment and security design appropriate to its traffic, data, intermediary,
rate-limiting, and edge-protection risks.

