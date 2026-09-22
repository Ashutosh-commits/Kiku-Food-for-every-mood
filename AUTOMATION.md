# Kiku Automation & Background Jobs

Kiku uses Redis-backed BullMQ workers for work that should not block an HTTP request.
BullMQ 6 job schedulers are used for recurring jobs; queue jobs are idempotent and use bounded retries/backoff.

## Worker process

```bash
npm run worker
```

Run the API and worker as separate processes in production. The worker is stateless and can be horizontally scaled; concurrency is intentionally lower for provider/scraper jobs.

## Queues

- `comparison`: hot comparison refreshes and provider scrapes.
- `recipes`: recipe-provider warming/sync.
- `personalization`: insight and baseline recommendation refreshes.
- `maintenance`: retention/cleanup tasks.
- `health`: provider and worker health checks.

## Scheduled jobs

- Insight rollup: every 15 minutes by default, active users only.
- Recommendation rollup: every 30 minutes by default, active users only.
- Recipe sync: every 12 hours by default.
- Provider health: every 3 hours by default.
- Maintenance: hourly by default.

All schedules are configurable with `*_EVERY_MS` environment variables.

## Event-driven jobs

- Activity invalidates insights and schedules a debounced insights refresh.
- Preference/save changes schedule a debounced recommendation refresh.
- A successful live comparison stores its request context and schedules at most **one** background refresh shortly before the cache expires.

### Conservative comparison refresh policy

Kiku does **not** continuously refresh every comparison forever. A background comparison scrape is allowed only when the comparison was actually requested by a user within `COMPARISON_DEMAND_WINDOW_MS` (30 minutes by default).

A successful background refresh does **not** schedule another background refresh by itself. A new user request is what re-arms the refresh cycle. This means an idle restaurant/dish comparison eventually stops generating scraper traffic.

## Failure handling

Jobs use three attempts by default with exponential backoff. Completed/failed job retention is bounded through BullMQ `removeOnComplete`/`removeOnFail` settings.

Provider work is separately isolated from personalization work so a slow scraper does not monopolize the entire worker pool.

## Health

The worker publishes `automation:heartbeat` in Redis. In production `REQUIRE_AUTOMATION=true` makes `/health/ready` fail unless a current worker heartbeat exists.

## Local development

```bash
docker compose -f docker-compose.dev.yml up -d mongo redis
npm run server
npm run worker
npm run dev
```

The development compose file also includes `kiku-worker` so the complete stack can be run with one command.

## Security

- Redis credentials stay server-side.
- BullMQ keys use the configured Redis prefix.
- Job payloads must contain identifiers/context only; never place passwords, session cookies, OAuth tokens, or raw camera frames in jobs.
- Scraper jobs are bounded by queue concurrency and the comparison service's own timeouts/circuit breaker.
