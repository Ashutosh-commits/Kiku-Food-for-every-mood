import test from "node:test";
import assert from "node:assert/strict";
import { parseCookies, serializeCookie } from "../lib/cookies.js";

test("cookie helpers round-trip common cookie values", () => {
  const header = [
    serializeCookie("kiku_session", "abc123", { httpOnly: true, sameSite: "Lax", maxAge: 60 }),
    serializeCookie("theme", "dark", { sameSite: "Lax" }),
  ];
  const parsed = parseCookies(header.join("; "));
  assert.equal(parsed.kiku_session, "abc123");
  assert.equal(parsed.theme, "dark");
});
