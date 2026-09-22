import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const worker = fs.readFileSync(new URL("../automation/worker.js", import.meta.url), "utf8");
const jobs = fs.readFileSync(new URL("../automation/jobs.js", import.meta.url), "utf8");
const schedulers = fs.readFileSync(new URL("../automation/schedulers.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
const compose = fs.readFileSync(new URL("../../docker-compose.dev.yml", import.meta.url), "utf8");
const env = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("BullMQ automation infrastructure is present", () => {
  assert.match(pkg.dependencies.bullmq, /^\^6\.3\.8$/);
  assert.equal(pkg.scripts.worker, "node server/automation/worker.js");
  assert.match(worker, /new Worker\(/);
  assert.match(schedulers, /upsertJobScheduler/);
});

test("automation is separated into domain queues with bounded concurrency", () => {
  assert.match(worker, /QUEUE_NAMES\.comparison/);
  assert.match(worker, /QUEUE_NAMES\.recipes/);
  assert.match(worker, /QUEUE_NAMES\.personalization/);
  assert.match(worker, /QUEUE_NAMES\.maintenance/);
  assert.match(worker, /QUEUE_NAMES\.health/);
  assert.match(worker, /concurrency,/);
});

test("hot comparison cache refreshes are connected to compare requests", () => {
  assert.match(index, /queueComparisonRefresh\(sourceBody\)/);
  assert.match(index, /collection\("comparisonRequests"\)/);
  assert.match(jobs, /comparison-refresh/);
  assert.match(worker, /comparisonDemandWindowMs/);
  assert.match(worker, /no-observed-demand/);
  assert.match(worker, /demand-window-expired/);
  assert.doesNotMatch(worker, /queueComparisonRefresh\(job\.data\.body/);
});

test("activity and personalization changes enqueue background work", () => {
  const activity = fs.readFileSync(new URL("../services/activity.js", import.meta.url), "utf8");
  const preferences = fs.readFileSync(new URL("../services/preferences.js", import.meta.url), "utf8");
  const saved = fs.readFileSync(new URL("../services/saved.js", import.meta.url), "utf8");
  assert.match(activity, /queueInsightsRefresh/);
  assert.match(activity, /queueRecommendationRefresh/);
  assert.match(preferences, /queueRecommendationRefresh/);
  assert.match(saved, /queueRecommendationRefresh/);
});

test("worker heartbeat is part of production readiness", () => {
  assert.match(worker, /automation:heartbeat/);
  assert.match(index, /requireAutomation/);
  assert.match(index, /automationReady/);
});

test("development compose runs the automation worker", () => {
  assert.match(compose, /kiku-worker:/);
  assert.match(compose, /AUTOMATION_ENABLED: "true"/);
});

test("automation settings are documented", () => {
  assert.match(env, /AUTOMATION_ENABLED=true/);
  assert.match(env, /RECIPE_SYNC_EVERY_MS/);
  assert.match(env, /RECOMMENDATION_ROLLUP_EVERY_MS/);
  assert.match(env, /MAINTENANCE_EVERY_MS/);
});
