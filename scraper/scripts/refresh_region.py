from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from pymongo import MongoClient

from app.services import scrape_region


def main() -> None:
    pincode = os.environ["PINCODE"].strip()

    if not pincode.isdigit() or len(pincode) != 6 or pincode.startswith("0"):
        raise ValueError(f"Invalid PIN code: {pincode}")

    snapshot = asyncio.run(scrape_region(pincode))
    data = snapshot.model_dump(mode="json")

    dishes = data.get("dishes") or []
    restaurants = data.get("restaurants") or []
    offers = data.get("offers") or []

    if not dishes and not restaurants and not offers:
        raise RuntimeError(
            f"Scraper returned no verified regional data for PIN {pincode}. "
            "Existing Atlas data was not overwritten."
        )

    now = datetime.now(timezone.utc)

    record = {
        **data,
        "pincode": pincode,
        "status": "ready",
        "checkedAt": data.get("checkedAt") or now.isoformat(),
        "updatedAt": now,
        "freshUntil": now + timedelta(days=1),
        "expiresAt": now + timedelta(days=7),
        "error": None,
        "menuEnrichmentStatus": "succeeded" if dishes else (
            "empty" if restaurants else "not_attempted"
        ),
        "menuEnrichmentLastAttemptAt": now,
    }

    client = MongoClient(os.environ["MONGODB_URI"])

    try:
        db = client["Kiku"]

        db["regionalCatalog"].replace_one(
            {"pincode": pincode},
            record,
            upsert=True,
        )

        print(
            f"Regional snapshot stored successfully: "
            f"PIN={pincode}, "
            f"dishes={len(dishes)}, "
            f"restaurants={len(restaurants)}, "
            f"offers={len(offers)}"
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()