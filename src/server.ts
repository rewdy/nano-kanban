import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Store, type Board } from "./store.js";
import { buildMcpServer } from "./mcp.js";
import { renderDashboard } from "./dashboard.js";

export type ServerHandle = {
  http: Server;
  store: Store;
  close: () => Promise<void>;
};

export async function startServer(opts: {
  port: number;
  file: string;
  host?: string;
}): Promise<ServerHandle> {
  const host = opts.host ?? "127.0.0.1";
  const store = await Store.load(opts.file);
  const mcp = buildMcpServer(store);
  const dashboardHtml = renderDashboard({ statePath: opts.file });
  const allowedHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

  const sseClients = new Set<ServerResponse>();
  const unsubscribe = store.subscribe((board) => {
    for (const res of sseClients) writeSseEvent(res, board);
  });

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);

      if (url.pathname === "/mcp" && req.method === "POST") {
        if (!isLocalRequest(req, allowedHostnames)) {
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("forbidden: nano-kanban only accepts requests from localhost");
          return;
        }
        await handleMcp(req, res);
        return;
      }
      if (url.pathname === "/mcp") {
        res.writeHead(405, { Allow: "POST", "Content-Type": "text/plain" });
        res.end("method not allowed");
        return;
      }
      if (url.pathname === "/events" && req.method === "GET") {
        handleSse(req, res, sseClients, store);
        return;
      }
      if (url.pathname === "/" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(dashboardHtml);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end(`server error: ${(err as Error).message}`);
    }
  });

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close().catch(() => undefined);
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.removeListener("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(opts.port, host);
  });

  return {
    http: httpServer,
    store,
    async close() {
      unsubscribe();
      for (const res of sseClients) {
        try {
          res.end();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await store.shutdown();
    },
  };
}

function handleSse(
  req: IncomingMessage,
  res: ServerResponse,
  clients: Set<ServerResponse>,
  store: Store,
): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  writeSseEvent(res, store.snapshot());
  clients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function writeSseEvent(res: ServerResponse, board: Board): void {
  res.write(`data: ${JSON.stringify(board)}\n\n`);
}

function isLocalRequest(req: IncomingMessage, allowed: Set<string>): boolean {
  const hostHeader = req.headers.host;
  if (!hostHeader) return false;
  const hostname = hostHeader.split(":")[0]!.toLowerCase();
  if (!allowed.has(hostname)) return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      if (!allowed.has(originHost)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}
