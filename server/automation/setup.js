import { connectRedis, closeRedis } from "../redis.js";
import { ensureSchedulers } from "./schedulers.js";
import { closeQueues } from "./queues.js";

try {
  await connectRedis();
  await ensureSchedulers();
  console.log(JSON.stringify({ level: "info", subsystem: "automation", message: "Automation schedulers upserted." }));
} finally {
  await closeQueues();
  await closeRedis();
}
