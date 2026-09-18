import { describe, expectTypeOf, test } from "vitest";
import { getQuery, parseQuery } from "./src";

describe("query", () => {
  test("getQuery generic type support", () => {
    const result = getQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });

  test("parseQuery generic type support", () => {
    const result = parseQuery<{ foo: string }>("http://foo.com/?foo=bar");
    expectTypeOf(result).toEqualTypeOf<{ foo: string }>();
  });
});

import { stringifyQuery, withQuery, $URL } from "./src";
test("URLSearchParams public consumers", () => {
  const p = new URLSearchParams();
  expectTypeOf(stringifyQuery(p)).toEqualTypeOf<string>();
  expectTypeOf(withQuery("/", p)).toEqualTypeOf<string>();
  const u = new $URL();
  u.query = p;
  expectTypeOf(u.searchParams).toEqualTypeOf<URLSearchParams>();
});
