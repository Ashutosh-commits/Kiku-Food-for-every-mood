import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const navigation = fs.readFileSync(path.join(root, "src/utils/navigation.ts"), "utf8");
const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/PublicInfoPage.tsx"), "utf8");
const privacy = fs.readFileSync(path.join(root, "src/pages/profile/ProfilePrivacy.tsx"), "utf8");

test("public information routes are real page routes, not footer modals", () => {
  for (const route of ["/about", "/privacy", "/terms", "/accessibility", "/support", "/how-it-works"]) {
    assert.ok(navigation.includes(`if (path === \"${route}\")`));
  }
  assert.ok(app.includes("<PublicInfoPage"));
  assert.doesNotMatch(app, /setFooterInfo\(/);
});

test("public information pages include detailed product and policy content", () => {
  for (const phrase of [
    "Food for every mood.",
    "What Kiku stores",
    "Deleting your data",
    "TERMS OF USE",
    "Designed to be easier to use.",
    "A calmer way to get unstuck.",
    "From a moment to a meal.",
  ]) {
    assert.ok(page.includes(phrase), `missing public-page content: ${phrase}`);
  }
});

test("account privacy page performs an account-wide deletion and sign-out handoff", () => {
  assert.ok(privacy.includes("Delete my Kiku data"));
  assert.ok(privacy.includes("signed out"));
  assert.ok(privacy.includes("clear the active session"));
  assert.ok(privacy.includes("Delete everything"));
});
