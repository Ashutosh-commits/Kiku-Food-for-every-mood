import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRegionPincode, normalizeRegionCatalog, normalizeRegionSnapshot } from "../services/region-utils.js";

test("regional pincode validation is fail-closed", () => {
  assert.equal(normalizeRegionPincode("282001"), "282001");
  assert.equal(normalizeRegionPincode("082001"), null);
  assert.equal(normalizeRegionPincode("28200"), null);
  assert.equal(normalizeRegionPincode("282001x"), null);
});

test("regional catalog normalization keeps pincode and bounded arrays", () => {
  const result = normalizeRegionCatalog({ pincode: "282001", checked_at: "2026-09-22T00:00:00.000Z", dishes: [null, { name: "Pizza" }], restaurants: [null, { name: "Cafe" }], offers: [null, { platform: "swiggy" }] });
  assert.deepEqual(result.pincode, "282001");
  assert.equal(result.dishes.length, 1);
  assert.equal(result.restaurants.length, 1);
  assert.equal(result.offers.length, 1);
});

test("regional catalog rejects a mismatched invalid pincode", () => {
  assert.equal(normalizeRegionCatalog({ pincode: "bad", dishes: [] }, "bad"), null);
});

test("regional snapshot rejects upstream data tagged for a different pincode", () => {
  assert.throws(() => normalizeRegionSnapshot({ pincode: "110001", dishes: [] }, "282001"), /different pincode/);
});

test("regional snapshot normalizes requested pincode onto returned entities", () => {
  const result = normalizeRegionSnapshot({ dishes: [{ name: "Pizza" }], restaurants: [{ name: "Cafe" }] }, "282001");
  assert.equal(result.pincode, "282001");
  assert.equal(result.dishes[0].regionPincode, "282001");
  assert.equal(result.restaurants[0].regionPincode, "282001");
});
