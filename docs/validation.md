# Ostend Validation Guidance

## Testing Approach

- Unit tests cover the complete Version 1 parsing, classification, duplicate, case-semantics, and bounded reason-code inventory.
- Integration tests use a controlled mock upstream to verify forwarding, streaming, credentials, response preservation, reserved-field sanitation, normalized metadata, all four non-blocking classifications, logging exclusions, timeouts, fixed routing, transport configuration, and header-size limits.
- Container checks verify an OCI build, non-root runtime, health, and readiness.
- Deployment checks cover the complete hosted path, TLS hostname and certificate validation, structured logs, graceful replacement, and finite Railway CPU and memory allocation.
- A controlled performance check measures disclosure application-processing latency separately from network and upstream time under documented expected MVP load.
- Manual documentation review verifies voluntary-claim language, downstream isolation guidance, trusted-intermediary disclosure, proof-of-concept credential restrictions, and denial-of-service scope.

## Validation Commands

Run the following commands from the project root.

Build the TypeScript application:

```sh
npm run build
```

Run unit tests:

```sh
npm run test:unit
```

Run integration tests:

```sh
npm run test:integration
```

These commands were established and executed successfully by S-0001. Later slices must add only commands that actually exist and have been run for their stated purpose.

## Known Constraints

- Deterministic RAES artifact validation does not validate the application.
- Tests must not print or persist real credentials, cookies, payloads, raw declarations, sensitive paths or query values, or private network details.
- Integration tests require a controlled mock upstream and must prove that clients cannot select an arbitrary destination.
- Hosted transport validation must prove successful certificate and hostname validation and failure for invalid conditions; production must expose no certificate-validation bypass.
- The 95th-percentile target is at most 10 milliseconds of proxy application processing under expected MVP load, excluding network and upstream latency, and is not a public service-level agreement.
- Railway deployment validation requires external platform state, a controlled upstream, test or narrowly scoped credentials, and finite CPU and memory settings.
