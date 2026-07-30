import { buildApp, ReadinessState } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { installShutdownHandlers } from "./lifecycle.js";

async function main(): Promise<void> {
  try {
    const config = loadConfig(process.env);
    const readiness = new ReadinessState();
    const app = buildApp(config, readiness);

    installShutdownHandlers(app, readiness, config);
    await app.listen({
      host: "0.0.0.0",
      port: config.port,
      listenTextResolver: () => "Ostend is accepting traffic"
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write("Ostend failed to start.\n");
    }
    process.exitCode = 1;
  }
}

await main();
