import type { FastifyInstance } from "fastify";

import { ReadinessState } from "./app.js";
import type { AppConfig } from "./config.js";

export async function shutdownApp(
  app: FastifyInstance,
  readiness: ReadinessState,
  graceMs: number
): Promise<void> {
  readiness.stopAcceptingTraffic();

  const forceClose = setTimeout(() => {
    app.server.closeAllConnections();
  }, graceMs);
  forceClose.unref();

  try {
    await app.close();
  } finally {
    clearTimeout(forceClose);
  }
}

export function installShutdownHandlers(
  app: FastifyInstance,
  readiness: ReadinessState,
  config: Pick<AppConfig, "shutdownGraceMs">,
  processTarget: NodeJS.Process = process
): () => void {
  let shuttingDown = false;
  const handleSignal = (): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void shutdownApp(app, readiness, config.shutdownGraceMs).catch(() => {
      processTarget.exitCode = 1;
    });
  };

  processTarget.once("SIGTERM", handleSignal);
  processTarget.once("SIGINT", handleSignal);

  return () => {
    processTarget.off("SIGTERM", handleSignal);
    processTarget.off("SIGINT", handleSignal);
  };
}
