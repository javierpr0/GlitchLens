import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cn, safeHttpUrl } from "@/lib/utils";

describe("safeHttpUrl", () => {
  test("lets http and https through, normalised", () => {
    assert.equal(safeHttpUrl("https://app.example.com/x?y=1#z"), "https://app.example.com/x?y=1#z");
    assert.equal(safeHttpUrl("http://example.com"), "http://example.com/");
    assert.equal(safeHttpUrl("HTTPS://Example.COM/A"), "https://example.com/A");
  });

  test("refuses every scheme that can run code or read local data", () => {
    const hostile = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "  javascript:alert(1)",
      "\tjavascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "javascript://%0aalert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "blob:https://example.com/uuid",
      "ftp://example.com/x",
      "about:blank",
      "chrome://settings",
    ];
    for (const url of hostile) assert.equal(safeHttpUrl(url), undefined, url);
  });

  test("refuses relative and malformed values", () => {
    for (const url of ["", "/path", "//evil.example.com", "example.com", "http://", "not a url"]) {
      assert.equal(safeHttpUrl(url), undefined, JSON.stringify(url));
    }
  });

  test("accepts what the WHATWG parser accepts: extra slashes still name a host", () => {
    assert.equal(safeHttpUrl("https:///x"), "https://x/");
  });

  test("refuses anything that is not a string", () => {
    for (const value of [undefined, null, 42, {}, [], ["https://example.com"], true]) {
      assert.equal(safeHttpUrl(value), undefined);
    }
  });
});

describe("cn", () => {
  test("joins and drops falsy values", () => {
    assert.equal(cn("a", false && "b", undefined, "c"), "a c");
  });

  test("lets later Tailwind classes win over conflicting earlier ones", () => {
    assert.equal(cn("px-2 py-1", "px-4"), "py-1 px-4");
    assert.equal(cn("text-sm", { "text-lg": true }), "text-lg");
  });
});
