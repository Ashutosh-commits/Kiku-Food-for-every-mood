#!/usr/bin/env node

const args = new Map();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [key, ...rest] = arg.slice(2).split("=");
  args.set(key, rest.join("=") || true);
}

const baseUrl = String(args.get("url") || process.env.STRESS_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const path = String(args.get("path") || process.env.STRESS_PATH || "/health/live");
const totalRequests = Math.max(1, Number(args.get("requests") || process.env.STRESS_REQUESTS || 500));
const concurrency = Math.max(1, Math.min(totalRequests, Number(args.get("concurrency") || process.env.STRESS_CONCURRENCY || 25)));
const timeoutMs = Math.max(100, Number(args.get("timeout") || process.env.STRESS_TIMEOUT_MS || 5000));
const target = new URL(path, `${baseUrl}/`).toString();

const durations = [];
let nextRequest = 0;
let successes = 0;
let failures = 0;
const failureSamples = [];
const startedAt = performance.now();

async function worker() {
  while (true) {
    const requestNumber = nextRequest;
    nextRequest += 1;
    if (requestNumber >= totalRequests) return;

    const started = performance.now();
    try {
      const response = await fetch(target, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const elapsed = performance.now() - started;
      durations.push(elapsed);
      if (response.ok) {
        successes += 1;
      } else {
        failures += 1;
        if (failureSamples.length < 10) failureSamples.push(`HTTP ${response.status}`);
      }
    } catch (error) {
      failures += 1;
      if (failureSamples.length < 10) failureSamples.push(error instanceof Error ? error.message : String(error));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const elapsedMs = performance.now() - startedAt;
const sorted = durations.slice().sort((a, b) => a - b);
const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 0;

const result = {
  target,
  requests: totalRequests,
  concurrency,
  timeoutMs,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  throughputRps: Number((totalRequests / (elapsedMs / 1000)).toFixed(2)),
  successes,
  failures,
  errorRate: Number((failures / totalRequests).toFixed(4)),
  latencyMs: {
    min: Number((sorted[0] || 0).toFixed(2)),
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
  },
  failureSamples,
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = failures > 0 ? 1 : 0;
