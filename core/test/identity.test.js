"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clientHintsMetadata } = require("../src/identity");
const { loadConfig } = require("../src/config");
const { fixtureProduct } = require("./fixture");

test("client hints: chrome mode adds the Google Chrome brand", () => {
  const m = clientHintsMetadata("chrome", "152.0.7977.169", "x64");
  assert.deepEqual(m.brands.map((b) => b.brand), ["Chromium", "Google Chrome", "Not?A_Brand"]);
  assert.deepEqual(m.brands.map((b) => b.version), ["152", "152", "24"]);
  assert.equal(m.fullVersionList[1].version, "152.0.7977.169");
  assert.equal(m.platform, "Linux");
  assert.equal(m.architecture, "x86");
  assert.equal(m.bitness, "64");
  assert.equal(clientHintsMetadata("chrome", "152.0.1.2", "arm64").architecture, "arm");
});

test("client hints: chromium mode keeps the default brands", () => {
  assert.deepEqual(clientHintsMetadata("chromium", "152.0.0.0").brands.map((b) => b.brand), ["Chromium", "Not?A_Brand"]);
});

test("config: browserBrand defaults to chrome and validates", () => {
  const product = fixtureProduct();
  assert.equal(loadConfig({ product }).flat["network.browserBrand"], "chrome");
  assert.equal(loadConfig({ product, argv: ["--network.browserBrand=chromium"] }).flat["network.browserBrand"], "chromium");
  assert.equal(loadConfig({ product, argv: ["--network.browserBrand=edge"] }).warnings.length, 1);
});
