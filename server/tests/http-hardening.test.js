import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fetchJsonLimited } from "../lib/http.js";
import { parseCookies } from "../lib/cookies.js";

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test("parseCookies tolerates malformed percent-encoding", () => {
  assert.deepEqual(parseCookies("session=abc%ZZ; theme=dark"), { session: "abc%ZZ", theme: "dark" });
});

test("fetchJsonLimited accepts bounded JSON responses", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  });
  try {
    const result = await fetchJsonLimited(url, {}, 64);
    assert.deepEqual(result.data, { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fetchJsonLimited aborts oversized streamed responses", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write("{");
    res.write("x".repeat(128));
    res.end("}");
  });
  try {
    await assert.rejects(
      () => fetchJsonLimited(url, {}, 32),
      (error) => error?.code === "UPSTREAM_RESPONSE_TOO_LARGE",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
