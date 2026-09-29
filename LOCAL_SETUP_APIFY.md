# Kiku Local Setup — Apify + PIN Location Resolution

## 1. Prerequisites

Use Docker Desktop with Compose and Node.js installed on Windows.

Kiku's Docker development stack starts:

- MongoDB
- Redis
- scraper service
- Kiku API
- Kiku automation worker

The React/Vite frontend runs from the host in a separate terminal.

## 2. Create the root `.env`

Copy `.env.example` to `.env` in the project root.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and add the Swiggy Apify token. The Zomato provider is disabled in this release:

```env
APIFY_SWIGGY_ENABLED=true
APIFY_SWIGGY_TOKEN=YOUR_SWIGGY_APIFY_TOKEN
APIFY_ZOMATO_ENABLED=false
APIFY_ZOMATO_TOKEN=
```

Keep both tokens server-side. Do not put either token in any `VITE_*` variable or frontend source.

Use the currently verified Swiggy Actor:

```env
APIFY_SWIGGY_ACTOR=shahidirfan~swiggy-restaurant-scraper
APIFY_SWIGGY_MAX_RESULTS=5
APIFY_SWIGGY_REGION_KEYWORDS=biryani,paneer,chicken,mutton,egg,ramen,thai,pizza,desserts,dal,noodles
APIFY_SWIGGY_REGION_MAX_PAGES=1
```

This Actor accepts a city/area `location` and one keyword per run. Its keyword-search results can include matching dishes in the same restaurant record. Kiku uses a bounded set of the original planned dish families and merges the returned dishes into the daily regional snapshot. Zomato remains disabled until a working provider is selected.

## 3. Keep the usage caps conservative

The project defaults to:

```env
APIFY_SWIGGY_MAX_RESULTS=10
APIFY_ZOMATO_MAX_RESULTS=5
APIFY_MAX_CONCURRENT_RUNS=1
APIFY_ERROR_COOLDOWN_SECONDS=300
```

Do not increase result caps until the provider response format and billing behavior have been verified against your actual accounts.

## 4. Start the backend stack

From the project root:

```powershell
docker compose -f docker-compose.dev.yml up -d --build
```

Check the containers:

```powershell
docker compose -f docker-compose.dev.yml ps
```

You should see healthy MongoDB, Redis, scraper, Kiku API, and worker containers.

Check Kiku API:

```text
http://localhost:4000/health/live
```

Check the scraper from inside Docker:

```powershell
docker compose -f docker-compose.dev.yml exec scraper python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/healthz').read().decode())"
```

## 5. Start the frontend

In a second PowerShell window:

```powershell
npm ci
npm run dev
```

Open the Vite URL shown by the command, normally `http://localhost:5173`.

## 6. How PIN resolution now works

When the user supplies a six-digit PIN, the scraper resolves it before the Apify call:

```text
202001
  ↓
Postal PIN lookup
  ↓
city / district / state
  ↓
Nominatim cached PIN-area coordinate anchor
  ↓
Swiggy: city + custom latitude/longitude
Zomato: resolved supported city
  ↓
provider response
  ↓
24-hour regional cache in MongoDB/Redis
```

The PIN-to-location result is also cached in the scraper process for 30 days and identical concurrent PIN resolutions are coalesced.

The public Nominatim service has a strict usage policy, including a maximum of 1 request/second, a real identifying User-Agent/Referer, and caching. The resolver therefore throttles Nominatim requests and caches them. For a higher-volume production deployment, replace the geocoder base URL with an approved alternative or self-hosted geocoder.

## 7. First regional lookup test

In Kiku, enter a PIN such as:

```text
202001
```

Watch the scraper:

```powershell
docker compose -f docker-compose.dev.yml logs -f scraper
```

The first lookup should resolve the PIN and then make one Swiggy Actor run for the uncached regional snapshot. The Actor response is normalized into restaurants plus its matching dishes in the same pass.

Now poll:

```text
http://localhost:4000/api/region/202001
```

The response should eventually move from `scraping`/`queued` to `ready`, `empty`, `stale`, or `error`. If an old server process left a stale `scraping` state in Redis, the API now expires that state and returns an actionable error rather than spinning forever.

Search the same PIN again. While the regional snapshot is fresh, Kiku should reuse the existing MongoDB/Redis snapshot rather than start a new provider scrape.

## 8. Test comparison caching

For the same PIN + restaurant + dish:

1. Make the comparison once.
2. Repeat the exact same comparison.
3. The second request should be served from the 24-hour comparison cache unless the cache was explicitly invalidated.

The response header from the comparison route includes the Kiku cache state, such as `X-Kiku-Cache: fresh` or `X-Kiku-Cache: stale`.

## 9. Verify Apify usage

Open each provider account's Apify Console and check Runs/Usage.

The expected pattern during a repeated same-PIN test is:

```text
first uncached lookup     → provider run(s)
repeat within 24 hours    → no new regional provider run
same comparison again     → no new comparison provider run
```

The exact number of billable results depends on the Actor's actual output. Kiku limits requested result counts and coalesces identical work so accidental bursts do not multiply provider usage unnecessarily.

## 10. Troubleshooting

### Apify returns 401/403

The token is wrong, expired, revoked, or the account is not authorized for the requested Actor.

Check:

```env
APIFY_SWIGGY_TOKEN=...
APIFY_ZOMATO_TOKEN=...
```

then restart:

```powershell
docker compose -f docker-compose.dev.yml up -d --build scraper
```

### PIN resolution fails

The Kiku scraper will fail closed for a PIN-only regional request if the postal resolver cannot resolve the PIN.

For comparison requests that also include an explicit city/location, Kiku can temporarily use that supplied location if the resolver is unavailable.

### Zomato does not return results for a PIN

The Thirdwatch Zomato Actor currently uses a documented supported-city input rather than custom coordinates. A PIN whose resolved city is outside that Actor's supported city set will not be guessed into another city.

### Swiggy works but Zomato does not

This can happen when the resolved PIN is usable through Swiggy's custom-coordinate path but the resolved city is not in the Zomato Actor's supported set.

## 11. Stop and reset local data

Stop services:

```powershell
docker compose -f docker-compose.dev.yml down
```

To also delete the persistent MongoDB data used for local cache testing:

```powershell
docker compose -f docker-compose.dev.yml down -v
```

The second command deletes the local MongoDB volume, including Kiku's regional and comparison caches.
