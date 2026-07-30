# Ostend Future Work

This file records engineering maintenance and follow-up ideas that are not part
of the current PRD, SRS, or Stage 1 RAES pipeline. An item must be promoted into
an approved execution slice before implementation.

## Migrate Fastify request-log suppression to `LogController`

**Status:** Pending  
**Category:** Framework maintenance  
**Trigger:** Before upgrading to Fastify 6

Ostend currently passes the top-level `disableRequestLogging: true` option when
constructing Fastify in `src/app.ts`. Fastify has deprecated that option and
states that it will be removed in Fastify 6.

Replace it with a `LogController` instance configured with
`disableRequestLogging: true` (or an equivalent `isLogDisabled` override), as
described in the
[Fastify server reference](https://fastify.dev/docs/latest/Reference/Server/#disablerequestlogging).

The migration must preserve these behaviors:

- Fastify's default request-start and request-completion log lines remain
  disabled.
- Ostend continues to emit exactly one structured observation event for every
  completed request.
- Error serialization continues to exclude stack traces, filesystem paths,
  credentials, and private network configuration.
- Existing log-capture, unit, and integration tests continue to pass without
  deprecation warnings for `disableRequestLogging`.
