import {
  connectRedis,
  closeRedis,
  getJson,
  deleteKey
} from "./server/redis.js";

const key = "region:202001";

await connectRedis();

try {
  const before = await getJson(key);

  console.log("Before delete:", before ? "CACHE PRESENT" : "CACHE MISSING");

  if (before) {
    console.log({
      pincode: before.pincode,
      status: before.status,
      checkedAt: before.checkedAt
    });
  }

  await deleteKey(key);

  const after = await getJson(key);

  console.log(
    "After delete:",
    after === null ? "CACHE DELETED" : "CACHE STILL PRESENT"
  );
} finally {
  await closeRedis();
}