export { buildApp } from "./app.js";
export { ConfigError, loadConfig } from "./config.js";
export { installShutdownHandlers, shutdownApp } from "./lifecycle.js";
export { registerProxyRoutes } from "./proxy.js";
export {
  createRequestContext,
  registerRequestContext
} from "./request-context.js";
export type { OstendRequestContext } from "./request-context.js";
export type { AppConfig } from "./config.js";
export {
  classifyAgentInteraction
} from "./protocol/agent-interaction.js";
export type {
  DeclarationClassification,
  DeclarationReasonCode,
  DeclarationResult,
  HeaderFields,
  InteractionMode
} from "./protocol/agent-interaction.js";
