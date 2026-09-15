import { describe, it, expect } from "vitest";
import { stringifyQuery, parseQuery, withQuery, $URL } from "./src";
describe("declared URLSearchParams consumer contract", () => {
 it("ordered repeated empty and escaped values", () => {
  const p=new URLSearchParams([["tag","a b"],["empty",""],["tag","+&%"],["ü","猫"]]); const before=p.toString();
  expect(stringifyQuery(p)).toBe("tag=a+b&empty=&tag=%2B%26%25&%C3%BC=%E7%8C%AB");
  expect(parseQuery(stringifyQuery(p))).toEqual({tag:["a b","+&%"],empty:"","ü":"猫"});
  expect(p.toString()).toBe(before);expect(stringifyQuery(new URLSearchParams())).toBe("");
 });
 it("withQuery replaces keys and preserves URL and old objects",()=>{
  const p=new URLSearchParams([["x","new"],["y",""],["x","second"]]);const before=p.toString();
  expect(withQuery("https://example.test/a?x=old&keep=z&x=older#h",p)).toBe("https://example.test/a?keep=z&x=new&y=&x=second#h");
  expect(p.toString()).toBe(before);
  const object={x:undefined,n:null,f:false,z:0,a:["one","two"]};const clone={...object};
  expect(withQuery("/p?x=old&keep=z#h",object)).toBe("/p?keep=z&n&f=false&z=0&a=one&a=two#h");expect(object).toEqual(clone);
  expect(withQuery("/p?a=1&a=2#h",new URLSearchParams())).toBe("/p?a=1&a=2#h");
 });
 it("class consumers and append remain connected",()=>{
  const u=new $URL("https://example.test/root#old");u.query=new URLSearchParams([["x","1"],["k",""],["x","2"]]);
  expect(u.search).toBe("?x=1&k=&x=2");expect(u.fullpath).toBe("/root?x=1&k=&x=2#old");expect(u.href).toBe("https://example.test/root?x=1&k=&x=2#old");expect(u.toString()).toBe(u.href);expect(u.toJSON()).toBe(u.href);
  const p=u.searchParams;expect([...p]).toEqual([["x","1"],["k",""],["x","2"]]);p.delete("x");expect(u.searchParams.getAll("x")).toEqual(["1","2"]);
  u.append(new $URL("child?x=3&x=4&last=z#new"));expect(u.href).toBe("https://example.test/root/child?k=&x=3&x=4&last=z#new");
  const old=new $URL("/base?a=1");old.query={n:null,f:false,z:0,a:["one","two"]};expect(old.search).toBe("?n&f=false&z=0&a=one&a=two");
 });
});
