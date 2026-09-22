import { getQueue, QUEUE_NAMES } from "./queues.js";
import { config } from "../config.js";

async function schedule(queueName, id, everyMs, name, data = {}, opts = {}) {
  const queue = getQueue(queueName);
  if (!queue) return null;
  return queue.upsertJobScheduler(id, { every: everyMs }, {
    name,
    data,
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: 100,
      removeOnFail: 500,
      ...opts,
    },
  });
}

export async function ensureSchedulers() {
  const jobs = [
    schedule(QUEUE_NAMES.personalization, "insights-rollup", config.insightsRollupEveryMs, "insights-rollup", { days: config.automationActiveUserDays }),
    schedule(QUEUE_NAMES.personalization, "recommendation-rollup", config.recommendationRollupEveryMs, "recommendation-rollup", { days: config.automationActiveUserDays }),
    schedule(QUEUE_NAMES.health, "provider-health-rollup", config.providerHealthEveryMs, "provider-health", {}),
    schedule(QUEUE_NAMES.maintenance, "maintenance-rollup", config.maintenanceEveryMs, "maintenance", {}),
  ];
  if (config.recipeSyncQueries.length > 0) {
    jobs.push(schedule(QUEUE_NAMES.recipes, "recipe-sync", config.recipeSyncEveryMs, "recipe-sync", { queries: config.recipeSyncQueries }));
  }
  await Promise.all(jobs);
}
