import { MongoClient, ObjectId } from "mongodb";
import { config } from "./config.js";

let client = null;
let database = null;

const memory = {
  users: new Map(),
  sessions: new Map(),
  preferences: new Map(),
  savedItems: new Map(),
  activityEvents: [],
  conversations: new Map(),
  messages: [],
  comparisonCache: new Map(),
  emailTokens: new Map(),
};

export async function connectDb() {
  if (database) return database;
  if (!config.mongoUri) {
    if (config.nodeEnv === "production" || !config.allowInMemory) {
      throw new Error("MONGODB_URI is required. Set ALLOW_IN_MEMORY=true only for local development.");
    }
    return null;
  }

  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 20,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  database = client.db(config.mongoDbName);
  await createIndexes(database);
  return database;
}

export async function closeDb() {
  if (client) await client.close();
  client = null;
  database = null;
}

export function isMongo() {
  return Boolean(database);
}

export async function pingDb() {
  if (!database) return false;
  await database.command({ ping: 1 });
  return true;
}

export function oid(value) {
  if (!value) return null;
  try { return new ObjectId(value); } catch { return null; }
}

async function createIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ googleSub: 1 }, { sparse: true, unique: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("preferences").createIndex({ userId: 1 }, { unique: true }),
    db.collection("savedItems").createIndex({ userId: 1, entityType: 1, entityKey: 1 }, { unique: true }),
    db.collection("activityEvents").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("assistantConversations").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("assistantMessages").createIndex({ conversationId: 1, createdAt: 1 }),
    db.collection("comparisonCache").createIndex({ key: 1 }, { unique: true }),
    db.collection("comparisonCache").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("comparisonRequests").createIndex({ key: 1 }, { unique: true }),
    db.collection("comparisonRequests").createIndex({ lastSeenAt: -1 }),
    db.collection("regionalCatalog").createIndex({ pincode: 1 }, { unique: true }),
    db.collection("regionalCatalog").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("emailTokens").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("emailTokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("dishes").createIndex({ name: "text", restaurant: "text", tags: "text" }),
    db.collection("dishes").createIndex({ restaurant: 1 }),
    db.collection("restaurants").createIndex({ name: "text" }),
  ]);
}

export function collection(name) {
  if (database) return database.collection(name);
  return null;
}

export function memoryStore(name) {
  return memory[name];
}

export { ObjectId };
