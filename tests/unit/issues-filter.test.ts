import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { toIssueListFilter } from "@/lib/issues-filter";

describe("toIssueListFilter", () => {
  test("defaults to unresolved issues over 14 days when nothing is given", () => {
    assert.deepEqual(toIssueListFilter({}), {
      query: "is:unresolved",
      project: undefined,
      environment: undefined,
      statsPeriod: "14d",
      sort: undefined,
    });
  });

  test("an empty query is the explicit 'all issues' choice", () => {
    assert.equal(toIssueListFilter({ query: "" }).query, undefined);
  });

  test("keeps a typed query as it is", () => {
    assert.equal(toIssueListFilter({ query: "TypeError is:ignored" }).query, "TypeError is:ignored");
  });

  test("accepts one project or many, without duplicates", () => {
    assert.deepEqual(toIssueListFilter({ project: "1" }).project, ["1"]);
    assert.deepEqual(toIssueListFilter({ project: ["1", "2", "1", "2", "3"] }).project, ["1", "2", "3"]);
  });

  test("passes environment, period and sort through", () => {
    const f = toIssueListFilter({ environment: "production", statsPeriod: "24h", sort: "freq" });
    assert.equal(f.environment, "production");
    assert.equal(f.statsPeriod, "24h");
    assert.equal(f.sort, "freq");
  });

  test("is the same function for the list and for bulk actions: same input, same output", () => {
    const params = { query: "x", project: ["2", "2"], environment: "staging" };
    assert.deepEqual(toIssueListFilter(params), toIssueListFilter({ ...params }));
  });
});
