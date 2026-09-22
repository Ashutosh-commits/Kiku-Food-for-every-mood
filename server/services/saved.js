import { collection, memoryStore } from "../db.js";
import { queueRecommendationRefresh } from "../automation/jobs.js";

export async function listSaved(userId, entityType = null) {
  const saved = collection("savedItems");
  if (!saved) return [...memoryStore("savedItems").values()].filter((item) => item.userId === String(userId) && (!entityType || item.entityType === entityType));
  return saved.find({ userId: String(userId), ...(entityType ? { entityType } : {}) }).sort({ createdAt: -1 }).toArray();
}

export async function toggleSaved(userId, input) {
  const saved = collection("savedItems");
  const key = `${userId}:${input.entityType}:${input.entityKey}`;
  if (!saved) {
    const existing = [...memoryStore("savedItems").values()].find((item) => item.key === key);
    if (existing) {
      memoryStore("savedItems").delete(key);
      await queueRecommendationRefresh(String(userId)).catch(() => undefined);
      return { saved: false };
    }
    memoryStore("savedItems").set(key, { key, userId: String(userId), ...input, createdAt: new Date() });
    await queueRecommendationRefresh(String(userId)).catch(() => undefined);
    return { saved: true };
  }
  const filter = { userId: String(userId), entityType: input.entityType, entityKey: input.entityKey };
  const existing = await saved.findOne(filter);
  if (existing) {
    await saved.deleteOne({ _id: existing._id });
    await queueRecommendationRefresh(String(userId)).catch(() => undefined);
    return { saved: false };
  }
  await saved.insertOne({ ...input, userId: String(userId), createdAt: new Date() });
  await queueRecommendationRefresh(String(userId)).catch(() => undefined);
  return { saved: true };
}

export async function removeSaved(userId, entityType, entityKey) {
  const saved = collection("savedItems");
  if (!saved) return memoryStore("savedItems").delete(`${userId}:${entityType}:${entityKey}`);
  await saved.deleteOne({ userId: String(userId), entityType, entityKey });
  return true;
}
