import { config } from "../config.js";

export function bullConnectionOptions() {
  if (!config.redisUrl) throw new Error("REDIS_URL is required for Kiku automation workers.");
  const url = new URL(config.redisUrl);
  const dbValue = url.pathname.replace(/^\//, "");
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  if (url.username) connection.username = decodeURIComponent(url.username);
  if (url.password) connection.password = decodeURIComponent(url.password);
  if (dbValue) connection.db = Number(dbValue);
  if (url.protocol === "rediss:") connection.tls = {};
  return connection;
}
