import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";

type Globals = {
  __glitchlensDb?: { close(): void };
  __glitchlensThrottle?: Map<string, unknown>;
  __testRequest?: FakeRequest | null;
};
const g = globalThis as unknown as Globals;

/** Points the app at an empty data directory that is removed when the test file ends. */
export function withTempDataDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "glitchlens-unit-"));
  process.env.GLITCHLENS_DATA_DIR = dir;
  delete process.env.GLITCHLENS_SECRET;
  after(() => {
    g.__glitchlensDb?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/** Drops the open database and starts the next test from an empty one (same process, new directory). */
export function freshDatabase(): string {
  g.__glitchlensDb?.close();
  g.__glitchlensDb = undefined;
  g.__glitchlensThrottle?.clear();
  const dir = mkdtempSync(path.join(os.tmpdir(), "glitchlens-unit-"));
  process.env.GLITCHLENS_DATA_DIR = dir;
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export interface FakeRequest {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

/** The "current request" seen by next/headers inside the code under test. */
export function setRequest(request: FakeRequest | null): void {
  g.__testRequest = request ? { cookies: request.cookies ?? {}, headers: request.headers ?? {} } : null;
}

export function throttleMemory(): Map<string, unknown> {
  return (g.__glitchlensThrottle ??= new Map());
}

/** Runs `fn` with console.error muted and returns what was printed. */
export async function captureErrors<T>(fn: () => T | Promise<T>): Promise<{ result: T; logged: string[] }> {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  try {
    return { result: await fn(), logged };
  } finally {
    console.error = original;
  }
}

// An independent RFC 6238 implementation, so the app's TOTP is checked against something it did not produce.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(buf).digest();
  const offset = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}

/** The code an authenticator app would show `offsetSteps` 30-second steps from now. */
export function totpCode(secretB32: string, offsetSteps = 0, nowMs = Date.now()): string {
  return hotp(b32decode(secretB32), Math.floor(nowMs / 30000) + offsetSteps);
}

// ── a tiny fake HTTP server, for code that talks to GlitchTip ─────────────

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeServer {
  url: string;
  requests: Array<{ method: string; path: string; headers: http.IncomingHttpHeaders; body: string }>;
  close(): Promise<void>;
}

export async function fakeServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void,
): Promise<FakeServer> {
  const requests: FakeServer["requests"] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method ?? "", path: req.url ?? "", headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

export const sendJson = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
