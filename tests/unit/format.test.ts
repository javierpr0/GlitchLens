import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { absoluteTime, compactNumber, levelColor, platformIcon, relativeTime } from "@/lib/format";

describe("relativeTime / absoluteTime", () => {
  test("show a dash for missing or invalid dates instead of throwing", () => {
    for (const bad of [null, undefined, "", "not a date"]) {
      assert.equal(relativeTime(bad as string), "—");
      assert.equal(absoluteTime(bad as string), "—");
    }
  });

  test("relative time reads naturally", () => {
    assert.match(relativeTime(new Date(Date.now() - 5 * 60_000)), /^5 minutes ago$/);
    assert.match(relativeTime(new Date(Date.now() + 2 * 3600_000 + 1000)), /^in 2 hours$/);
  });

  test("absolute time honours the format", () => {
    assert.equal(absoluteTime("2026-03-04T10:20:30Z", "yyyy"), "2026");
  });
});

describe("compactNumber", () => {
  test("abbreviates large numbers", () => {
    assert.equal(compactNumber(999), "999");
    assert.equal(compactNumber(1200).replace(/\s/g, ""), "1.2K");
    assert.equal(compactNumber("2500000").replace(/\s/g, ""), "2.5M");
  });

  test("treats missing and non-finite values as zero", () => {
    for (const v of [null, undefined, "abc", NaN, Infinity]) assert.equal(compactNumber(v as number), "0");
  });
});

describe("levelColor / platformIcon", () => {
  test("map severities to a style and fall back for unknown ones", () => {
    assert.equal(levelColor("fatal"), levelColor("error"));
    assert.notEqual(levelColor("warning"), levelColor("info"));
    assert.equal(levelColor("whatever"), levelColor("debug"));
  });

  test("shorten platform names", () => {
    assert.equal(platformIcon("javascript"), "JS");
    assert.equal(platformIcon("node"), "JS");
    assert.equal(platformIcon("python"), "PY");
    assert.equal(platformIcon("cocoa"), "iOS");
    assert.equal(platformIcon("elixir"), "EL");
    assert.equal(platformIcon(null), "?");
  });
});
