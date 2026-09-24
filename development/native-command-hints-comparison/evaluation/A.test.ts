import { expect, test, expectTypeOf } from "vitest";
import { withoutQuery, withQuery, getQuery } from "../src";

test("remove all while retaining URL prefix and fragment bytes", () => {
  for (const [input, expected] of [
    ["https://host/%2f?p=1#frag?x", "https://host/%2f#frag?x"],
    ["?a=1", ""], ["/p?", "/p"], ["/p#?q=1", "/p#?q=1"],
    ["/p?a?b=c#", "/p#"], ["/p", "/p"],
  ]) expect(withoutQuery(input)).toBe(expected);
});
test("select decoded keys without reserializing survivors", () => {
  const keys = ["a b", "a b", "é", "", "__proto__"] as const;
  expect(withoutQuery("/p?a+b=1&a%20b=2&%C3%A9=x&=zero&__proto__=3&x=%2f+%20&x=2&flag#F", keys))
    .toBe("/p?x=%2f+%20&x=2&flag#F");
  expect(keys).toEqual(["a b", "a b", "é", "", "__proto__"]);
  expect(withoutQuery("?x=one=two&keep=a=b&x&X=3", "x")).toBe("?keep=a=b&X=3");
  expect(withoutQuery("?%ZZ=1&keep=%ZZ", "%ZZ")).toBe("?keep=%ZZ");
  expect(withoutQuery("?%E0%A4%A=1&ok=2", "%E0%A4%A")).toBe("?ok=2");
});
test("empty fields, no matches and post-removal empty query", () => {
  expect(withoutQuery("/p?x=1&&y=2#f", "x")).toBe("/p?&y=2#f");
  expect(withoutQuery("/p?x=1&", "x")).toBe("/p");
  expect(withoutQuery("/p?x=1&&", "x")).toBe("/p?&");
  expect(withoutQuery("/p?&&x=1&=2", "")).toBe("/p?x=1");
  for (const input of ["/p?", "/p?&", "/p?a=%2f+%20#?a=2", "#?a=2"]) {
    expect(withoutQuery(input, [])).toBe(input);
    expect(withoutQuery(input, "absent")).toBe(input);
  }
});
test("existing public consumers and return type remain compatible", () => {
  expect(getQuery(withoutQuery(withQuery("/p#f", {a:"1", b:"2"}), "a"))).toEqual({b:"2"});
  expectTypeOf(withoutQuery("/p", ["x"] as const)).toEqualTypeOf<string>();
});
