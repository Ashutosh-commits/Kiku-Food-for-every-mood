const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));

const baseUrl = args.get("url") || process.env.KIKU_URL;
const count = Math.max(1, Math.min(100, Number(args.get("count") || 10)));
const pincodes = Array.from({ length: count }, (_, index) => String(110001 + index));
if (!baseUrl) {
  console.error("Usage: node scripts/region-stress-test.mjs --url=https://kiku.example --count=10");
  process.exit(2);
}

const start = Date.now();
const started = new Map();
const results = await Promise.all(pincodes.map(async (pincode) => {
  started.set(pincode, Date.now());
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/region/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ pincode }),
    });
    const body = await response.json().catch(() => null);
    return { pincode, status: response.status, state: body?.status || null, ok: response.ok };
  } catch (error) {
    return { pincode, status: 0, state: null, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}));

const latencyMs = Date.now() - start;
const failures = results.filter((item) => !item.ok);
console.log(JSON.stringify({ count, latencyMs, failures: failures.length, results }, null, 2));
if (failures.length) process.exitCode = 1;
