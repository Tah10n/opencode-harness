import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { subtotal } from "../src/domain/total.mjs";
import { quote } from "../src/service/quote.mjs";

test("domain stays infrastructure-free while service owns regional tax", () => {
  const domainSource = fs.readFileSync(new URL("../src/domain/total.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(domainSource, /infra|tax\.mjs/iu);
  assert.equal(subtotal([{ price: 100 }]), 100);
  assert.equal(quote([{ price: 100 }], "HU"), 127);
  assert.equal(quote([{ price: 100 }], "US"), 100);
});
