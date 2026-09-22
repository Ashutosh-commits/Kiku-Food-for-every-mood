export async function fetchJsonLimited(url, options = {}, maxBytes = 1024 * 1024) {
  const response = await fetch(url, options);
  if (!response.ok) {
    await response.body?.cancel().catch?.(() => undefined);
    return { response, data: null };
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error("Upstream response exceeded the allowed size.");
    error.code = "UPSTREAM_RESPONSE_TOO_LARGE";
    throw error;
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      const error = new Error("Upstream response exceeded the allowed size.");
      error.code = "UPSTREAM_RESPONSE_TOO_LARGE";
      throw error;
    }
    return { response, data: JSON.parse(new TextDecoder().decode(bytes)) };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        const error = new Error("Upstream response exceeded the allowed size.");
        error.code = "UPSTREAM_RESPONSE_TOO_LARGE";
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  const text = Buffer.concat(chunks, totalBytes).toString("utf8");
  return { response, data: JSON.parse(text) };
}
