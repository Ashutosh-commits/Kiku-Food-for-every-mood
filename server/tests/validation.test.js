import test from "node:test";
import assert from "node:assert/strict";
import { compareSchema, parseBody } from "../services/validation.js";

test("compare validation accepts discovery-only PIN", () => {
  const valid = compareSchema.parse({
    pincode: "282001",
    restaurant: "Biryani Blues",
    dish: "Chicken Biryani",
  });
  assert.equal(valid.pincode, "282001");
});

test("compare validation requires either a PIN or discovery location", () => {
  assert.throws(
    () => parseBody(compareSchema, { restaurant: "Biryani Blues", dish: "Chicken Biryani" }),
    /Provide a city\/location or pincode for discovery/
  );
});
