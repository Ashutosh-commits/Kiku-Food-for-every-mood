import { collection, memoryStore } from "../db.js";
import { getJson, setJson, deleteKey } from "../redis.js";
import { queueInsightsRefresh, queueRecommendationRefresh } from "../automation/jobs.js";

export async function recordActivity(userId, input) {
  const document = {
    userId: String(userId),
    ...input,
    createdAt: new Date(),
  };
  const events = collection("activityEvents");
  if (events) {
    await events.insertOne(document);
  } else {
    memoryStore("activityEvents").push(document);
    if (memoryStore("activityEvents").length > 20000) memoryStore("activityEvents").splice(0, 1000);
  }
  const normalizedUserId = String(userId);
  await deleteKey(`insights:${normalizedUserId}`);
  await Promise.all([
    queueInsightsRefresh(normalizedUserId).catch(() => undefined),
    queueRecommendationRefresh(normalizedUserId).catch(() => undefined),
  ]);
  return document;
}

export async function listActivity(userId, limit = 100, before = null) {
  const cutoff = before ? new Date(before) : null;
  const hasCutoff = cutoff && Number.isFinite(cutoff.getTime());
  const events = collection("activityEvents");
  if (!events) {
    return memoryStore("activityEvents")
      .filter((item) => item.userId === String(userId) && (!hasCutoff || new Date(item.createdAt).getTime() < cutoff.getTime()))
      .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
  const query = { userId: String(userId), ...(hasCutoff ? { createdAt: { $lt: cutoff } } : {}) };
  return events.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function buildInsights(userId) {
  const cacheKey = `insights:${String(userId)}`;
  const cached = await getJson(cacheKey);
  if (cached !== null) return cached;
  const events = await listActivity(userId, 1000);
  const counts = {};
  for (const event of events) counts[event.type] = (counts[event.type] || 0) + 1;
  const cuisineCounts = {};
  const budgetBuckets = {};
  for (const event of events) {
    if (event.metadata?.cuisine) cuisineCounts[event.metadata.cuisine] = (cuisineCounts[event.metadata.cuisine] || 0) + 1;
    if (Number.isFinite(event.metadata?.price)) {
      const bucket = Math.floor(event.metadata.price / 100) * 100;
      budgetBuckets[bucket] = (budgetBuckets[bucket] || 0) + 1;
    }
  }
  const result = {
    activityCounts: counts,
    topCuisines: Object.entries(cuisineCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name,count]) => ({name,count})),
    commonBudget: Object.entries(budgetBuckets).sort((a,b) => b[1]-a[1]).slice(0,1).map(([bucket,count]) => ({min:Number(bucket), max:Number(bucket)+99, count}))[0] || null,
  };
  await setJson(cacheKey, result, 30_000);
  return result;
}
