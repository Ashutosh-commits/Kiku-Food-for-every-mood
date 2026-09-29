# Mise Comparison / Regional Scraper Service

This service is the server-side scraping boundary for Kiku/Mise. It exposes two APIs:

- `POST /api/v1/compare` — compare the same restaurant/dish across supported providers.
- `POST /api/v1/region` — discover provider listings for a six-digit PIN and return only listings for which the provider page itself contains evidence of the requested PIN.

The regional endpoint is intentionally fail-closed: if a provider page cannot be tied to the requested PIN, its listings are not returned as verified regional data.

## Kiku integration contract

### Regional discovery

```http
POST /api/v1/region
X-Scraper-Api-Key: <shared-secret>
Content-Type: application/json
```

```json
{"pincode":"282001"}
```

Response fields:

- `pincode`
- `checkedAt`
- `dishes`
- `restaurants`
- `offers`
- `warnings`

Each returned dish includes provider/listing URLs plus explicit dietary/allergen evidence when the provider supplies it. Unknown allergen state remains unverified.

### Comparison

```http
POST /api/v1/compare
X-Scraper-Api-Key: <shared-secret>
Content-Type: application/json
```

```json
{
  "location": "Agra",
  "pincode": "282001",
  "restaurant": "Example Restaurant",
  "dish": "Chicken Biryani",
  "swiggy_url": "https://www.swiggy.com/...",
  "zomato_url": "https://www.zomato.com/..."
}
```

Provider URLs are restricted to HTTPS and the real provider hostnames. Arbitrary/internal URLs are rejected to prevent SSRF.

## Local setup on Windows

On Windows, you can use the installed Google Chrome instead of downloading a Playwright-managed browser:

```env
PLAYWRIGHT_BROWSER_CHANNEL=chrome
```

Do not run `python -m playwright install chromium` when using this local configuration.

```powershell
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
```

Create `.env` from `.env.example` and choose a development key:

```env
SCRAPER_API_KEY=local-kiku-scraper-secret
```

Start:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health:

```text
http://localhost:8000/health
http://localhost:8000/healthz
```

## Test directly

```powershell
$headers = @{ "X-Scraper-Api-Key" = "local-kiku-scraper-secret" }
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/v1/region `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"pincode":"282001"}'
```

A `200` response with an empty `dishes` array is possible when no provider listing contains verifiable evidence for that exact PIN. That is intentional; the service does not claim a listing is regional merely because a search engine returned it.

## Tests

```powershell
python -m pytest -q
```

The test suite covers:

- health and Kiku-compatible `/healthz`;
- API-key authentication;
- provider URL/SSRF validation;
- pincode validation;
- JSON-LD `@graph` and nested menu parsing;
- one-to-one dish matching;
- duplicate concurrent request coalescing;
- regional contract validation.

## Production

Use an HTTPS reverse proxy/service URL and a strong `SCRAPER_API_KEY` of at least 24 characters. Set `HOST=0.0.0.0`.

The service uses short-lived in-memory cache and in-flight coalescing. For a single personal/free instance this is sufficient; horizontal scaling should add a shared Redis lock/cache before increasing concurrency.

The provider websites are external dependencies. Their markup, anti-bot controls, and regional behavior can change, so live provider success still needs smoke tests from the deployed region and load testing before raising concurrency.


## Optional Real Data API provider

Set `REALDATA_API_KEY` to use Real Data API for Swiggy/Zomato comparison requests instead of the direct browser adapters. The public provider pages document the Swiggy/Zomato restaurant, search, and menu endpoint families and bearer-token authentication. The full account reference should be used to confirm the exact request parameter schema for your account; the integration keeps those paths/parameter names configurable instead of hard-coding undocumented assumptions. Regional PIN responses remain fail-closed unless returned provider records contain verifiable PIN evidence.
