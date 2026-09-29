# Kiku cache architecture

Kiku now treats upstream provider calls as an expensive refresh operation rather than the normal path for repeated searches.

## Regional PIN snapshots

A verified regional snapshot is keyed by the exact six-digit pincode.

- Fresh window: 24 hours
- Retention window: 7 days
- Hot cache: Redis
- Persistent cache: MongoDB `regionalCatalog`
- Refresh locking: distributed Redis lock per pincode
- In-process queue: bounded regional refresh queue

A new PIN is fetched once, normalized, verified for the requested PIN, and then stored. Other users asking for the same PIN reuse the same snapshot during the fresh window.

An empty regional result is intentionally cached for a much shorter period (`REGION_EMPTY_TTL_MS`) so a temporary provider failure or transient no-result response is not turned into a 24-hour negative cache.

When a refresh fails after a usable snapshot already exists, Kiku keeps the old dishes/restaurants and marks the snapshot stale instead of deleting the data.

## Comparison snapshots

Successful comparisons are persisted in MongoDB `comparisonCache` and hot-cached in Redis.

- Fresh window: 24 hours
- Retention window: 7 days
- Cache key: location + pincode + restaurant + dish
- Identical simultaneous requests: coalesced with a distributed Redis lock
- Background refresh: scheduled near cache expiry only
- Demand guard: background refresh is skipped when the comparison has not been requested recently

A comparison that is older than 24 hours can still be used as a stale fallback for up to 7 days when a fresh provider request fails.

## Relationship between regional and comparison caches

The regional snapshot already contains the verified provider-visible restaurant/dish catalog returned by the regional service, so Kiku does not maintain a second duplicate MongoDB menu table just to achieve daily reuse. This regional catalog is the persistent menu/discovery snapshot for a PIN.

The comparison cache covers direct restaurant/dish comparisons that are not satisfied by an existing regional snapshot.

## Provider selection

When `REALDATA_API_KEY` is configured, the comparison and regional scraper paths use the Real Data API provider adapters. The direct Playwright Swiggy/Zomato adapters remain as development fallback code when Real Data API is disabled.

The current project documentation mentions Apify as a possible free fallback, but Apify is not an active runtime provider in this bundle. Adding an Apify token alone does not route traffic to Apify.
