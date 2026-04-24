#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { startServer } from "./server.js";

type CliArgs = {
  port: number;
  file: string;
};

function parseArgs(argv: string[]): { command: "serve"; args: CliArgs } {
  const [command = "serve", ...rest] = argv;
  if (command !== "serve") {
    die(`unknown command: ${command}\n\nusage: nano-kanban serve [--port 7777] [--file ./tasks.json]`);
  }

  const args: CliArgs = { port: 7777, file: resolvePath("./tasks.json") };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--port" || arg === "-p") {
      const value = rest[++i];
      if (!value) die("--port requires a value");
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) die(`invalid port: ${value}`);
      args.port = parsed;
    } else if (arg === "--file" || arg === "-f") {
      const value = rest[++i];
      if (!value) die("--file requires a value");
      args.file = resolvePath(value);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      die(`unknown argument: ${arg}`);
    }
  }

  return { command: "serve", args };
}

function printHelp(): void {
  console.log(`nano-kanban — shared task board for AI agents

usage:
  nano-kanban serve [--port 7777] [--file ./tasks.json]

options:
  -p, --port   port to listen on (default: 7777)
  -f, --file   tasks state file (default: ./tasks.json)
  -h, --help   show this help`);
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const { args } = parseArgs(process.argv.slice(2));
  const handle = await startServer({ port: args.port, file: args.file });
  const base = `http://127.0.0.1:${args.port}`;

  console.log(`nano-kanban listening on ${base}`);
  console.log(`  Dashboard: ${base}/`);
  console.log(`  MCP URL:   ${base}/mcp`);
  console.log(`  State:     ${args.file}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nreceived ${signal}, shutting down…`);
    try {
      await handle.close();
      process.exit(0);
    } catch (err) {
      console.error("shutdown error:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
