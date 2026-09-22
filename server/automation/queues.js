import { Queue } from "bullmq";
import { config } from "../config.js";
import { bullConnectionOptions } from "./connection.js";

export const QUEUE_NAMES = Object.freeze({
  comparison: "automation-comparison",
  recipes: "automation-recipes",
  personalization: "automation-personalization",
  maintenance: "automation-maintenance",
  health: "automation-health",
});

const queues = new Map();

export function automationEnabled() {
  return Boolean(config.automationEnabled && config.redisUrl);
}

export function getQueue(name) {
  if (!automationEnabled()) return null;
  if (queues.has(name)) return queues.get(name);
  const queue = new Queue(name, {
    connection: bullConnectionOptions(),
    prefix: `${config.redisPrefix}:bull`,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
  queue.on("error", (error) => {
    console.error(JSON.stringify({ level: "error", subsystem: "automation.queue", queue: name, message: error?.message || String(error) }));
  });
  queues.set(name, queue);
  return queue;
}

export async function addJob(queueName, name, data = {}, options = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;
  return queue.add(name, data, options);
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close().catch(() => undefined)));
  queues.clear();
}
