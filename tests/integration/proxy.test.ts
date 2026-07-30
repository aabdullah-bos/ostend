import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";

interface HttpResult {
  readonly statusCode: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
  readonly chunks: readonly Buffer[];
}

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  closeCallbacks.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );
  return (server.address() as AddressInfo).port;
}

function configFor(
  upstreamPort: number,
  timeout = 1_000,
  acknowledgementEnabled = false
): AppConfig {
  return {
    upstreamOrigin: new URL(`http://127.0.0.1:${upstreamPort}`),
    port: 3000,
    logLevel: "info",
    profileMode: "observe",
    requestTimeoutMs: timeout,
    acknowledgementEnabled,
    maxHeaderBytes: 16_384,
    deploymentMode: "local",
    shutdownGraceMs: 1_000
  };
}

async function listenProxy(config: AppConfig): Promise<number> {
  const app = buildApp(config);
  await app.listen({ host: "127.0.0.1", port: 0 });
  closeCallbacks.push(() => app.close());
  return (app.server.address() as AddressInfo).port;
}

function callProxy(
  port: number,
  options: {
    readonly method?: string;
    readonly path: string;
    readonly headers?: Readonly<Record<string, string | string[]>>;
    readonly body?: Buffer | string;
  }
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
            chunks
          });
        });
      }
    );
    outgoing.on("error", reject);
    if (options.body !== undefined) {
      Readable.from([options.body]).pipe(outgoing);
    } else {
      outgoing.end();
    }
  });
}

describe("fixed-upstream forwarding", () => {
  it.each([
    ["application/json", Buffer.from('{"value":1}')],
    ["application/x-www-form-urlencoded", Buffer.from("value=one")],
    [
      "multipart/form-data; boundary=ostend",
      Buffer.from("--ostend\r\nContent-Disposition: form-data; name=x\r\n\r\none\r\n--ostend--\r\n")
    ],
    ["application/octet-stream", Buffer.from([0, 1, 2, 255])]
  ])("preserves %s request bodies and credentials", async (contentType, body) => {
    let received:
      | {
          method?: string;
          url?: string;
          authorization?: string;
          cookie?: string;
          body: Buffer;
        }
      | undefined;
    const upstream = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        received = {
          method: incoming.method,
          url: incoming.url,
          authorization: incoming.headers.authorization,
          cookie: incoming.headers.cookie,
          body: Buffer.concat(chunks)
        };
        response.statusCode = 201;
        response.end("created");
      });
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    const result = await callProxy(proxyPort, {
      method: "POST",
      path: "/records/42?mode=full",
      headers: {
        authorization: "Bearer test-only",
        cookie: "session=test-only",
        "content-type": contentType,
        "content-length": String(body.length)
      },
      body
    });

    expect(result.statusCode).toBe(201);
    expect(result.body.toString()).toBe("created");
    expect(received).toEqual({
      method: "POST",
      url: "/records/42?mode=full",
      authorization: "Bearer test-only",
      cookie: "session=test-only",
      body
    });
  });

  it("forwards empty bodies", async () => {
    let bodyLength = -1;
    const upstream = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        bodyLength = Buffer.concat(chunks).length;
        response.end("ok");
      });
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    const result = await callProxy(proxyPort, {
      method: "POST",
      path: "/empty"
    });

    expect(result.statusCode).toBe(200);
    expect(bodyLength).toBe(0);
  });

  it("preserves upstream status, binary response, and repeated Set-Cookie fields", async () => {
    const binary = Buffer.from([255, 0, 127, 1]);
    const upstream = createServer((_incoming, response) => {
      response.writeHead(206, {
        "content-type": "application/octet-stream",
        "set-cookie": ["first=1; Path=/", "second=2; Path=/"]
      });
      response.end(binary);
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    const result = await callProxy(proxyPort, { path: "/binary" });

    expect(result.statusCode).toBe(206);
    expect(result.body).toEqual(binary);
    expect(result.headers["set-cookie"]).toEqual([
      "first=1; Path=/",
      "second=2; Path=/"
    ]);
  });

  it("streams upstream responses without waiting for completion", async () => {
    const upstream = createServer((_incoming, response) => {
      response.write("first");
      setTimeout(() => response.end("second"), 50);
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    const result = await callProxy(proxyPort, { path: "/stream" });

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.body.toString()).toBe("firstsecond");
  });

  it("cannot be redirected by request path, query, or headers", async () => {
    let receivedUrl: string | undefined;
    const upstream = createServer((incoming, response) => {
      receivedUrl = incoming.url;
      response.end("fixed");
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    const result = await callProxy(proxyPort, {
      path: "/http://untrusted.example/path?upstream=http://untrusted.example",
      headers: { "x-upstream-origin": "http://untrusted.example" }
    });

    expect(result.body.toString()).toBe("fixed");
    expect(receivedUrl).toBe(
      "/http://untrusted.example/path?upstream=http://untrusted.example"
    );
  });

  it("returns a safe gateway timeout when the upstream exceeds the limit", async () => {
    const upstream = createServer((_incoming, response) => {
      setTimeout(() => response.end("late"), 200);
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort, 25));

    const result = await callProxy(proxyPort, { path: "/slow" });

    expect(result.statusCode).toBe(504);
    expect(result.body.toString()).not.toContain("127.0.0.1");
    expect(result.body.toString()).not.toContain("stack");
  });

  it("returns a safe gateway response for an unavailable upstream", async () => {
    const reserved = createServer();
    const unavailablePort = await listen(reserved);
    await new Promise<void>((resolve, reject) => {
      reserved.close((error) => (error ? reject(error) : resolve()));
    });
    closeCallbacks.pop();
    const proxyPort = await listenProxy(configFor(unavailablePort));

    const result = await callProxy(proxyPort, { path: "/unavailable" });

    expect([502, 503]).toContain(result.statusCode);
    expect(result.body.toString()).not.toContain("127.0.0.1");
    expect(result.body.toString()).not.toContain("stack");
  });

  it.each([
    {
      name: "valid",
      declaration: "actor=agent, mode=autonomous, version=1",
      expectedDeclaration: "valid",
      expectedMode: "autonomous",
      expectedProfile: "1",
      acknowledgementEnabled: true,
      expectedAcknowledgement: "mode=autonomous, version=1"
    },
    {
      name: "missing",
      declaration: undefined,
      expectedDeclaration: "missing",
      expectedMode: "unspecified",
      expectedProfile: undefined,
      acknowledgementEnabled: true,
      expectedAcknowledgement: undefined
    },
    {
      name: "invalid",
      declaration: "actor=human, mode=autonomous, version=1",
      expectedDeclaration: "invalid",
      expectedMode: "unspecified",
      expectedProfile: "1",
      acknowledgementEnabled: true,
      expectedAcknowledgement: undefined
    },
    {
      name: "unsupported",
      declaration: "actor=agent, mode=autonomous, version=2",
      expectedDeclaration: "unsupported",
      expectedMode: "unspecified",
      expectedProfile: "2",
      acknowledgementEnabled: true,
      expectedAcknowledgement: undefined
    },
    {
      name: "valid with acknowledgement disabled",
      declaration: "actor=agent, mode=autonomous, version=1",
      expectedDeclaration: "valid",
      expectedMode: "autonomous",
      expectedProfile: "1",
      acknowledgementEnabled: false,
      expectedAcknowledgement: undefined
    }
  ])(
    "forwards $name classification non-blockingly with exact normalized fields",
    async ({
      declaration,
      expectedDeclaration,
      expectedMode,
      expectedProfile,
      acknowledgementEnabled,
      expectedAcknowledgement
    }) => {
      let upstreamHeaders: IncomingHttpHeaders | undefined;
      const upstream = createServer((incoming, response) => {
        upstreamHeaders = incoming.headers;
        response.setHeader("agent-interaction-accepted", "forged");
        response.end("forwarded");
      });
      const upstreamPort = await listen(upstream);
      const proxyPort = await listenProxy(
        configFor(upstreamPort, 1_000, acknowledgementEnabled)
      );
      const headers =
        declaration === undefined
          ? undefined
          : { "agent-interaction": declaration };

      const result = await callProxy(proxyPort, {
        path: "/classification",
        headers
      });

      expect(result.statusCode).toBe(200);
      expect(result.body.toString()).toBe("forwarded");
      expect(upstreamHeaders?.["proxy-agent-declaration"]).toBe(
        expectedDeclaration
      );
      expect(upstreamHeaders?.["proxy-agent-mode"]).toBe(expectedMode);
      expect(upstreamHeaders?.["proxy-agent-profile"]).toBe(expectedProfile);
      expect(result.headers["agent-interaction-accepted"]).toBe(
        expectedAcknowledgement
      );
    }
  );

  it("removes every caller-supplied reserved field before normalization", async () => {
    let upstreamHeaders: IncomingHttpHeaders | undefined;
    const upstream = createServer((incoming, response) => {
      upstreamHeaders = incoming.headers;
      response.end("ok");
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));

    await callProxy(proxyPort, {
      path: "/sanitize",
      headers: {
        "Proxy-Agent-Declaration": "valid",
        "pRoXy-AgEnT-MoDe": "autonomous",
        "Proxy-Agent-Profile": "999",
        "Proxy-Agent-Request-Id": "caller-controlled",
        "Proxy-Agent-Unrecognized": "injected"
      }
    });

    expect(upstreamHeaders?.["proxy-agent-declaration"]).toBe("missing");
    expect(upstreamHeaders?.["proxy-agent-mode"]).toBe("unspecified");
    expect(upstreamHeaders?.["proxy-agent-profile"]).toBeUndefined();
    expect(upstreamHeaders?.["proxy-agent-request-id"]).toBeUndefined();
    expect(upstreamHeaders?.["proxy-agent-unrecognized"]).toBeUndefined();
  });

  it("assigns a distinct opaque request identifier to every request", async () => {
    const upstream = createServer((_incoming, response) => response.end("ok"));
    const upstreamPort = await listen(upstream);
    const app = buildApp(configFor(upstreamPort));
    const requestIds: string[] = [];
    app.addHook("preHandler", async (request) => {
      requestIds.push(request.ostendContext.requestId);
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    closeCallbacks.push(() => app.close());
    const proxyPort = (app.server.address() as AddressInfo).port;

    await callProxy(proxyPort, { path: "/first" });
    await callProxy(proxyPort, { path: "/second" });

    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(requestIds[1]).not.toBe(requestIds[0]);
  });

  it("treats repeated external declaration field lines as invalid and still forwards", async () => {
    let declaration: string | undefined;
    const upstream = createServer((incoming, response) => {
      const normalized = incoming.headers["proxy-agent-declaration"];
      declaration = Array.isArray(normalized) ? normalized[0] : normalized;
      response.end("ok");
    });
    const upstreamPort = await listen(upstream);
    const proxyPort = await listenProxy(configFor(upstreamPort));
    const value = "actor=agent, mode=autonomous, version=1";

    const result = await callProxy(proxyPort, {
      path: "/duplicate",
      headers: { "Agent-Interaction": [value, value] }
    });

    expect(result.statusCode).toBe(200);
    expect(declaration).toBe("invalid");
  });
});
