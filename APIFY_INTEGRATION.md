# Kiku Apify Integration

The current Kiku regional/discovery path uses the Swiggy Actor that has been verified with the project's current Apify setup:

- Swiggy: `shahidirfan~swiggy-restaurant-scraper`
- Zomato: disabled for the current release

## Credentials

Keep the Swiggy token server-side only. Do not add it to any `VITE_*` variable and do not commit `.env` files.

```env
APIFY_SWIGGY_ENABLED=true
APIFY_SWIGGY_TOKEN=token_for_authorized_swiggy_provider_account
APIFY_SWIGGY_ACTOR=shahidirfan~swiggy-restaurant-scraper
APIFY_ZOMATO_ENABLED=false
APIFY_ZOMATO_TOKEN=
```

Apify tokens are sent in the `Authorization: Bearer <token>` header.

## Regional usage controls

The regional path intentionally performs **one Swiggy Actor run per uncached PIN refresh**. The tested Actor returns restaurant records and can include up to five matching dishes per restaurant for a keyword search, so Kiku consumes `matchedDishes` from that same response instead of starting a separate menu Actor run for every restaurant.

```env
APIFY_SWIGGY_MAX_RESULTS=5
APIFY_SWIGGY_REGION_KEYWORDS=biryani,paneer,chicken,mutton,egg,ramen,thai,pizza,desserts,dal,noodles
APIFY_SWIGGY_REGION_MAX_PAGES=1
APIFY_MAX_CONCURRENT_RUNS=1
APIFY_ERROR_COOLDOWN_SECONDS=300
APIFY_FALLBACK_REALDATA=false
```

`APIFY_SWIGGY_REGION_KEYWORD` is deliberately configurable because changing the keyword changes which matching dishes the Actor returns. Increasing result/page limits increases provider usage.

## 24-hour persistent regional cache

```text
PIN
  ↓
PIN/location resolver
  ↓
24h regional snapshot?
  ├─ yes → MongoDB/Redis
  └─ no  → one Swiggy Actor run
               ↓
          store snapshot
               ↓
          24h fresh / 7d retained
```

Identical simultaneous refreshes for the same PIN are coalesced by the server Redis lock.

## PIN targeting

Kiku resolves the six-digit PIN to postal geography before provider targeting. The working Swiggy Actor accepts a free-form `location`, so the request uses the first resolved postal-office name plus the resolved city when available. The PIN remains the primary Kiku cache key.

The resolver caches PIN metadata for 30 days and coalesces identical in-flight PIN resolutions.

## Frontend polling

The browser no longer polls the regional status endpoint every second. It uses an increasing delay starting at 2 seconds and stops as soon as the snapshot is `ready`, `stale`, `empty`, or `error`, with a 60-second hard timeout. This keeps status traffic low without making the UI feel stuck.

## Zomato

The Zomato provider is intentionally disabled in this release. The previously tested Thirdwatch/ScrapeSage Actors did not produce a usable live result set in the current tests. The adapter remains isolated for a future provider.
