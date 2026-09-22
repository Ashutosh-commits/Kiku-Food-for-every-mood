# Kiku v8 — Background Automation

## Added

- Redis-backed BullMQ automation workers.
- Separate comparison, recipe, personalization, maintenance, and health queues.
- Debounced background insight refresh after first-party activity.
- Debounced baseline recommendation refresh after preference/save/activity changes.
- Hot comparison cache refresh jobs that stop after the request goes cold.
- Scheduled recipe cache warming.
- Scheduled provider health checks.
- Scheduled insight/recommendation rollups for active users.
- Scheduled maintenance cleanup for comparison request metadata.
- Redis worker heartbeat integrated into readiness checks.
- Docker Compose worker service.
- Automation configuration/environment documentation.

## Changed

- Authenticated recommendation requests without realtime context can now use the worker-generated Redis baseline cache.
- Successful comparisons persist a compact request context so hot comparison keys can be refreshed asynchronously.
- Comparison cache TTL is centralized in configuration.

## Notes

- The worker runs as a separate process and should be independently scalable in production.
- Full dependency installation/build still needs to be run in a networked environment because this package does not include a generated npm lockfile.

## v8.1 — Conservative comparison automation

- Background comparison refreshes now require recent observed demand.
- A successful background refresh no longer recursively schedules another refresh.
- Added `COMPARISON_DEMAND_WINDOW_MS` (default 30 minutes).
- Idle comparisons no longer generate recurring provider scrape traffic.
