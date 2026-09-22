# Regional Scraper Contract

Kiku now treats regional discovery as a separate live service boundary.

## Endpoint

`POST /api/v1/region`

### Request

```json
{"pincode":"282001"}
```

### Response requirements

Return HTTP 200 with an object containing:

- `pincode`: six-digit pincode
- `checkedAt`: ISO timestamp
- `dishes`: array
- `restaurants`: array
- optional `offers`: array

Each dish should include whatever provider metadata is available. For dietary/allergen safety, provider evidence should be explicit. Kiku does not infer vegetarian/vegan/allergen safety from names or descriptions.

## Concurrency expectations

Kiku can invoke this endpoint concurrently for multiple different pincodes. The scraper service must therefore:

- treat the pincode as an isolation key;
- avoid mutable global state that can leak one pincode's results into another;
- be safe for concurrent requests;
- respect upstream provider rate limits;
- use per-pincode or provider-specific locks rather than one global scraper lock;
- return a bounded response size;
- fail one pincode without failing unrelated pincodes.

For identical pincode requests, Kiku coalesces work so the scraper should not need to defend against a stampede in normal operation, but it should still be idempotent.

## Failure behavior

Use normal HTTP semantics:

- `200` successful regional snapshot;
- `4xx` for invalid/request-rejected input;
- `5xx` for scraper/provider failure.

Do not return HTTP 200 with a fabricated successful empty catalog when upstream scraping actually failed.
