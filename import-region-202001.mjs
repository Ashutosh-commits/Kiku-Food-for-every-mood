import dns from "node:dns";

dns.setServers([
  "8.8.8.8",
  "8.8.4.4"
]);

import fs from "node:fs";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing.");
}

const raw = fs.readFileSync("./region-202001.json", "utf8").replace(/^\uFEFF/, "");
const snapshot = JSON.parse(raw);


if (snapshot.pincode !== "202001") {
  throw new Error(`Expected pincode 202001, got ${snapshot.pincode}`);
}

if (!Array.isArray(snapshot.dishes) || snapshot.dishes.length === 0) {
  throw new Error("202001 snapshot contains no dishes.");
}

const client = new MongoClient(uri);

try {
  await client.connect();

  const db = client.db("Kiku");
  const collection = db.collection("regionalCatalog");

  await collection.replaceOne(
    { pincode: "202001" },
    snapshot,
    { upsert: true }
  );

  const saved = await collection.findOne(
    { pincode: "202001" },
    { projection: { pincode: 1, status: 1, dishes: 1, restaurants: 1 } }
  );

  console.log({
    pincode: saved?.pincode,
    status: saved?.status,
    dishes: saved?.dishes?.length ?? 0,
    restaurants: saved?.restaurants?.length ?? 0,
  });
} finally {
  await client.close();
}