# Kiku provider data setup

## Real Data API (primary comparison provider)

Kiku can use Real Data API for Swiggy/Zomato restaurant and menu/price retrieval when `REALDATA_API_KEY` is configured in the scraper environment. The public Real Data API pages document Swiggy and Zomato restaurant, search, menu, delivery-time and related endpoint families and state that free sandbox/test keys are available; the public pages do not expose the full account-specific request parameter reference, so Kiku keeps the endpoint paths and key parameter names configurable.

Required scraper settings:

```env
REALDATA_API_KEY=
REALDATA_API_BASE_URL=https://api.realdataapi.com
REALDATA_API_TIMEOUT_SECONDS=30
REALDATA_SWIGGY_SEARCH_PATH=/v1/swiggy/search
REALDATA_SWIGGY_MENU_PATH=/v1/swiggy/menu
REALDATA_ZOMATO_SEARCH_PATH=/v1/zomato/search
REALDATA_ZOMATO_MENU_PATH=/v1/zomato/menu
REALDATA_QUERY_PARAM=query
REALDATA_LOCATION_PARAM=city
REALDATA_URL_PARAM=url
```

When the key is present, `/api/v1/compare` and `/api/v1/region` use the Real Data providers instead of the direct Playwright provider adapters. The existing adapters remain available when the key is absent.

Kiku does **not** treat a city/locality match as proof of exact PIN serviceability. Regional discovery remains fail-closed unless provider data contains verifiable PIN evidence. This is deliberate and prevents cross-PIN results from being shown as local results.

## 24-hour persistent regional caching

Regional discovery is persisted in MongoDB by exact six-digit pincode. Once a pincode such as `202001` has a verified regional snapshot, Kiku treats that snapshot as **fresh for 24 hours**. Additional users requesting the same pincode reuse the stored dishes/restaurants without starting another upstream regional scrape. Redis is used as the hot cache and MongoDB is the persistent cache, so a Kiku API restart does not throw away the regional snapshot.

Expired regional snapshots are retained for up to 7 days and can be served as stale fallback when an upstream refresh is unavailable. Kiku keeps the exact-PIN verification requirement when the snapshot is first created; a city/locality match is not enough to populate the regional cache.

Comparison results are also cached persistently for 24 hours, keyed by location, exact pincode, restaurant and dish. Repeated identical comparisons therefore normally avoid new provider calls during the same 24-hour freshness window. Old comparison snapshots are retained for up to 7 days for stale-if-upstream-fails fallback.

## Free/zero-payment development path

Real Data API currently advertises a free sandbox/test key and sample credits, but its public pages do not state that live production usage is permanently unlimited at $0. Do not assume the free sandbox is a permanent production tier.

Apify is not wired into the current runtime bundle; the current ZIP does not make Apify requests. It remains an optional design documented separately.

For a small personal project, an alternative is Apify's Free plan. Apify currently provides a monthly free usage allowance and suspends the free account when the allowance is exhausted rather than automatically charging the free plan. Third-party Swiggy and Zomato actors are available through the Apify API. This path is still quota-limited and is not an unlimited permanent-free guarantee.

Do not enable an Apify fallback for exact regional discovery until its actor output proves serviceability for the requested PIN. A city match alone is not enough for Kiku's regional safety contract.

## Local validation

Do not put either provider API key in any `VITE_*` variable. Provider keys belong only in the scraper/server environment.

After adding the Real Data API key, restart the scraper and test `/api/v1/compare` directly. A successful response with provider offers is the first verification that the account key and endpoint configuration are correct. Regional `/api/v1/region` verification must still pass the exact-PIN evidence checks before Kiku will expose regional dishes.


## Apify primary providers

The current build supports Thirdwatch's public Apify Actors as the primary comparison providers when the corresponding server-side tokens are configured. See `APIFY_INTEGRATION.md`.

The selected Actors are city/coordinate-oriented. Kiku does not infer exact PIN serviceability from a city result, so exact-PIN regional discovery remains fail-closed unless the provider response carries matching PIN evidence.
