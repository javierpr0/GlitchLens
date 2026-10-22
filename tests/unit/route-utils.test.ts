import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { GlitchTipError, InstanceAuthError, InstanceUnreachableError } from "@/lib/glitchtip/client";
import { InstanceError, NoInstanceError } from "@/lib/instances";
import { errorResponse, jsonError, readJson } from "@/lib/route-utils";
import { UserError, type UserErrorCode } from "@/lib/users";
import { captureErrors } from "./helpers.ts";

const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("jsonError", () => {
  test("is a JSON error with the given status", async () => {
    const r = jsonError("nope", 418);
    assert.equal(r.status, 418);
    assert.deepEqual(await body(r), { error: "nope" });
  });
});

describe("errorResponse for domain errors", () => {
  const userStatus: Record<UserErrorCode, number> = {
    email_taken: 409, not_found: 404, last_superadmin: 409, self: 400, setup_done: 409, bad_instances: 400, bad_password: 400, locked: 429,
  };
  for (const [code, status] of Object.entries(userStatus)) {
    test(`UserError ${code} is HTTP ${status} and keeps its message`, async () => {
      const r = errorResponse(new UserError(code as UserErrorCode, `msg for ${code}`));
      assert.equal(r.status, status);
      assert.deepEqual(await body(r), { error: `msg for ${code}` });
    });
  }

  test("InstanceError codes map to 400, 409 and 404", () => {
    assert.equal(errorResponse(new InstanceError("invalid_url", "x")).status, 400);
    assert.equal(errorResponse(new InstanceError("url_taken", "x")).status, 409);
    assert.equal(errorResponse(new InstanceError("not_found", "x")).status, 404);
  });

  test("NoInstanceError is a 409 that says why", async () => {
    for (const reason of ["unauthenticated", "none", "token_unreadable", "needs_token", "two_factor_required"] as const) {
      const r = errorResponse(new NoInstanceError(reason));
      assert.equal(r.status, 409);
      assert.equal((await body(r)).reason, reason);
    }
  });

  test("a rejected instance token is a 502, never a 401 that would look like 'not signed in'", async () => {
    const r = errorResponse(new InstanceAuthError({ detail: "bad token" }));
    assert.equal(r.status, 502);
    assert.match(String((await body(r)).error), /token/);
  });

  test("an unreachable instance is a 502 with its own message", async () => {
    const r = errorResponse(new InstanceUnreachableError("Could not reach GlitchTip"));
    assert.equal(r.status, 502);
    assert.equal((await body(r)).error, "Could not reach GlitchTip");
  });
});

describe("errorResponse for GlitchTip errors turns any detail into one short string", () => {
  const msg = async (detail: unknown, status = 400) => {
    const r = errorResponse(new GlitchTipError(status, detail));
    assert.equal(r.status, status);
    return (await body(r)).error as string;
  };

  test("a plain string", async () => assert.equal(await msg("Permission denied", 403), "Permission denied"));
  test("{ detail: string }", async () => assert.equal(await msg({ detail: "Permission denied" }, 403), "Permission denied"));
  test("validation objects become JSON text", async () => {
    const m = await msg({ detail: [{ type: "missing", loc: ["body", "orgRole"], msg: "Field required" }] }, 422);
    assert.match(m, /orgRole/);
    assert.equal(typeof m, "string");
  });
  test("an HTML error page is replaced by the generic message", async () => {
    assert.equal(await msg("<!doctype html><html><body><h1>Server Error (500)</h1></body></html>", 500), "GlitchTip API error 500");
    assert.equal(await msg("  <html>x</html>", 500), "GlitchTip API error 500");
  });
  test("missing detail falls back to the status message", async () => {
    assert.equal(await msg(null, 404), "GlitchTip API error 404");
    assert.equal(await msg(undefined, 500), "GlitchTip API error 500");
    assert.equal(await msg("", 502), "GlitchTip API error 502");
  });
  test("long details are cut at 300 characters", async () => {
    assert.equal((await msg("x".repeat(5000))).length, 300);
    assert.equal((await msg({ detail: "y".repeat(5000) })).length, 300);
    assert.ok((await msg({ a: "z".repeat(5000) })).length <= 300);
  });
});

describe("errorResponse for anything else", () => {
  test("is a bare 500 that does not leak the message, and logs only the message", async () => {
    const { result, logged } = await captureErrors(() => errorResponse(new Error("password=hunter2 in SELECT * FROM users")));
    assert.equal(result.status, 500);
    assert.deepEqual(await body(result), { error: "Internal error" });
    assert.equal(logged.length, 1);
    assert.ok(!logged[0].includes("at ") || !logged[0].includes("\n"), "no stack trace in the log line");
  });

  test("non-Error throws are handled too", async () => {
    const { result } = await captureErrors(() => errorResponse("just a string"));
    assert.equal(result.status, 500);
  });
});

describe("readJson", () => {
  const Schema = z.object({ name: z.string().min(2), count: z.number().int().optional() });
  const request = (raw: string, contentType = "application/json") =>
    new Request("http://x/", { method: "POST", headers: { "content-type": contentType }, body: raw });

  test("returns typed data for a valid body", async () => {
    const r = await readJson(request(JSON.stringify({ name: "ok", count: 3 })), Schema);
    assert.deepEqual(r.data, { name: "ok", count: 3 });
    assert.equal(r.response, undefined);
  });

  test("answers 400 naming the offending field", async () => {
    const r = await readJson(request(JSON.stringify({ name: "x" })), Schema);
    assert.equal(r.response!.status, 400);
    assert.match(String((await body(r.response!)).error), /^Invalid name:/);
  });

  test("answers 400 for a body that is not JSON, empty, or not an object", async () => {
    for (const raw of ["", "not json", "{", "null", "[]", '"str"']) {
      const r = await readJson(request(raw), Schema);
      assert.equal(r.response!.status, 400, JSON.stringify(raw));
    }
  });

  test("drops fields the schema does not know", async () => {
    const r = await readJson(request(JSON.stringify({ name: "ok", role: "superadmin", __proto__: { x: 1 } })), Schema);
    assert.deepEqual(r.data, { name: "ok" });
  });
});
