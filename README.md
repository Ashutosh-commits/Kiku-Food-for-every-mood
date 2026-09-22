<<<<<<< HEAD
# Kiku

### Food for every mood.

Kiku is a mood-aware food discovery and personalization platform. It combines explicit mood and craving input, optional on-device expression signals, personalized recommendations, restaurant/dish discovery, same-restaurant + same-dish price comparison, recipes, saved items, first-party activity, food insights, and a food-specific assistant.

This repository contains the **Kiku web app and Kiku API**. The live Swiggy/Zomato comparison scraper is maintained as a separate Food-Price-Clash/Mise service and is accessed only by the server.

## Production architecture

```text
Browser
  |
  | HTTPS / same-origin / secure session cookie
  v
Kiku Web + Node/Express API
  |
  +---- MongoDB
  |
  +---- comparison adapter ----> Food-Price-Clash/Mise scraper
  |
  +---- recipe adapter ---------> permitted recipe provider(s)
  |
  +---- assistant orchestration -> optional Cloudflare Workers AI
  |
  +---- on-device mood signal <--- browser camera / MediaPipe
```

### Kiku owns

- User accounts and sessions
- Preferences
- Saved dishes, restaurants, and recipes
- First-party activity
- Recommendation scoring/orchestration
- Canonical discovery data
- Recipe normalization
- Comparison normalization and matching
- Assistant tools and user context
- Privacy controls

### External services provide

- Provider listing/price data
- Recipe data where permitted
- Optional language-model generation

The model never receives direct database or scraper credentials, and it never writes database queries itself.

## Comparison contract

Kiku compares **the same restaurant and the same dish** across supported providers.

The comparison response intentionally contains only menu-level price information:

```json
{
  "platform": "swiggy",
  "restaurantName": "Biryani Blues",
  "dishName": "Chicken Biryani",
  "price": 249,
  "listed": true,
  "restaurantUrl": "https://...",
  "matchConfidence": 0.96,
  "checkedAt": "2026-09-21T10:00:00Z"
}
```

Kiku does **not** use or display:

- delivery fees
- platform/service fees
- checkout totals
- delivery ETA
- fastest-provider claims

A user PIN can be provided as a **discovery hint**. It is not treated as an exact delivery address and is not used to fabricate delivery/ETA information.

## Backend API

### Authentication

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/google
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/verify-email
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

Authentication uses a server-side session stored in MongoDB and an HttpOnly cookie. Google credentials are verified server-side.

### User data

```text
GET    /api/me
PUT    /api/me
GET    /api/preferences
PUT    /api/preferences
GET    /api/saved
POST   /api/saved/toggle
DELETE /api/saved/:entityType/:entityKey
DELETE /api/account
```

### Activity and insights

```text
POST   /api/activity
GET    /api/activity
GET    /api/insights
```

The backend records actions Kiku actually observes, such as searches, views, saves, comparisons, recipe opens/completions, external order-link opens, manual mood selections, and mood scans.

### Discovery and recommendations

```text
GET    /api/discover
GET    /api/search
GET    /api/dishes/:id
GET    /api/restaurants/:id
POST   /api/recommendations
```

The first recommendation release is deterministic and explainable. It uses mood/craving context alongside dietary preferences, cuisines, spice, budget, time, saved items, and first-party activity.

### Recipes

```text
GET    /api/recipes
GET    /api/recipes/:id
```

The recipe layer normalizes provider data and preserves the original source URL when one exists. If configured, Cloudflare Workers AI is asked only for missing recipe metadata such as prep/cook time, servings, difficulty, equipment, a concise description, and missing step guidance. Existing provider ingredients and instructions are never rewritten. AI-inferred fields are explicitly marked as inferred and are never used to assert nutrition, allergen, dietary, or food-safety facts.

### Comparison

```text
POST   /api/compare
```

The Kiku API validates provider URLs, applies rate limits, deduplicates identical in-flight requests, caches successful comparisons briefly, and isolates upstream failures behind a circuit breaker.

### Assistant

```text
POST   /api/assistant/message
GET    /api/assistant/conversations
GET    /api/assistant/conversations/:id/messages
```

The assistant is a food-specific orchestration layer. It uses optional Cloudflare Workers AI for natural-language generation/tool selection and always falls back to deterministic Kiku logic when AI is unavailable, rate-limited, or unconfigured. It can call tools such as:

```text
searchFood()
recommendFood()
findRestaurant()
getRecipe()
compareOffers()
```

User preferences, saved items, and recent Kiku activity are runtime context. They are not used to train the model.

## Security middleware

The server includes:

- secure response headers via Helmet
- request IDs
- structured JSON logs
- JSON body size limits
- origin allowlisting
- HttpOnly/SameSite cookies
- password hashing with scrypt
- server-side Google ID-token verification
- request validation with Zod
- endpoint-specific rate limits
- provider URL allowlisting to reduce SSRF risk
- timeout/retry/circuit-breaker handling for the comparison service
- authorization checks on user-owned resources
- graceful shutdown
- health and readiness endpoints

Health endpoints:

```text
GET /health/live
GET /health/ready
GET /healthz
```

## Data model

MongoDB collections include:

```text
users
sessions
preferences
savedItems
activityEvents
restaurants
dishes
recipes
assistantConversations
assistantMessages
emailTokens
```

Useful indexes are created automatically at API startup, including unique email/session/token indexes, user activity indexes, assistant history indexes, comparison cache indexes, and discovery text indexes.

## Location / PIN behavior

Kiku accepts a 6-digit PIN code and stores it in the authenticated user's preferences when signed in.

The PIN is only discovery context for provider lookup.

It is **not** used to claim:

- exact delivery availability
- delivery ETA
- delivery fee
- checkout total

Guests may keep a browser-side convenience copy of the PIN; authenticated account data remains server-backed.

## Mood scanning

Kiku's primary production mood flow uses on-device MediaPipe Face Landmarker + a Kiku heuristic.

```text
Camera
  |
  v
Local browser inference
  |
  v
Expression / blendshape signal
  |
  v
Kiku mood context
  |
  v
Recommendation service
```

The camera is off by default, starts only after explicit user action, and stops after the scan. Raw frames are not uploaded.

## Environment configuration

Copy the server example and provide the real values through your development shell, deployment platform, or local secret manager:

```text
server/.env.example
```

Public client variables are documented in:

```text
.env.example
```

Never place MongoDB credentials, session secrets, comparison service secrets, email credentials, or AI provider keys in `VITE_*` variables.

### Minimum production configuration

```text
NODE_ENV=production
MONGODB_URI=...
MONGODB_DB_NAME=kiku
SESSION_SECRET=<32+ random characters>
REDIS_URL=rediss://...
REQUIRE_REDIS=true
TRUSTED_ORIGINS=https://your-kiku-domain.example
COMPARE_SERVICE_URL=https://your-private-comparison-service.example
PUBLIC_APP_URL=https://your-kiku-domain.example
```

Redis is used for shared caching, distributed rate limits, short-lived insight/catalog/recipe data, and cross-instance comparison request coordination. Production should use a TLS-enabled managed Redis instance and must not expose Redis directly to the public internet.

Optional features:

```text
GOOGLE_CLIENT_ID=...
AI_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_AI_MODEL=@cf/zai-org/glm-4.7-flash
EMAIL_WEBHOOK_URL=...
PUBLIC_APP_URL=https://your-kiku-domain.example
REQUIRE_EMAIL_VERIFICATION=true
```

The Kiku assistant has a deterministic fallback. If Cloudflare Workers AI is not configured, unavailable, capacity-limited, or rate-limited, Kiku continues using its own search, recommendation, recipe, restaurant, and comparison logic.

Cloudflare Workers AI is optional and quota-limited on the Free plan; the project must never depend on it for correctness, dietary/allergen filtering, or core food discovery.

## Cloudflare Workers AI setup

Kiku calls the Cloudflare Workers AI chat-completions endpoint from the server. The recommended Free-plan model is `@cf/zai-org/glm-4.7-flash`, which supports function calling and is currently available on Workers Free. Keep `AI_PROVIDER=cloudflare`; omit the Cloudflare credentials to disable AI while retaining deterministic fallback behavior.

Create a Workers AI API token with the required Workers AI permissions and set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as server-side secrets. Never expose the token as a `VITE_*` variable.

Recipe enrichment is inference-only: when Cloudflare Workers AI is configured, Kiku may fill missing metadata from the provider recipe (prep/cook time, servings, difficulty, equipment, concise description, and missing step guidance). Existing provider ingredients and instructions remain authoritative. AI-inferred fields are explicitly marked as inferred and are never used for allergen, dietary, nutrition, or food-safety verification.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Start MongoDB + Redis

Use local services or the included development compose file:

```bash
docker compose -f docker-compose.dev.yml up -d mongo redis
```

### 3. Start the comparison service

Use the separate fixed Food-Price-Clash/Mise project:

```bash
uvicorn app.main:app --reload
```

Make sure `COMPARE_SERVICE_URL` points to that service.

### 4. Start the Kiku API

Set the variables from `server/.env.example` in your shell/environment and run:

```bash
npm run server
```

### 5. Start the frontend

In another terminal:

```bash
npm run dev
```

Vite proxies `/api/*` to the Kiku API during development.

## Production-style run

Build and serve the web app and API from one Node process:

```bash
npm run start
```

The API serves `dist/` as the web client and keeps the `/api/*` boundary server-side.

## Redis caching

The API uses Redis when `REDIS_URL` is configured. Cache layers include:

- comparison results
- recipe searches and details
- discovery/catalog results
- user insights
- distributed comparison locks/deduplication
- distributed API/auth/comparison/assistant rate limits

Production requires Redis by default; use a managed TLS-enabled Redis endpoint and keep Redis private.

## Docker

The included Dockerfile builds the frontend and produces a production Node runtime image:

```bash
docker build -t kiku .
docker run --env-file server/.env -p 4000:4000 kiku
```

MongoDB can be provided as a managed MongoDB deployment or through the development compose file.

## Testing and validation

Run the server test suite after dependencies are installed:

```bash
npm test
```

Run the TypeScript typecheck:

```bash
npm run typecheck
```

Validate JavaScript syntax without installing dependencies:

```bash
for f in server/**/*.js; do node --check "$f"; done
```

The repository intentionally does not include a generated `package-lock.json` in this environment because dependency installation was unavailable here; run `npm install` once on a networked development/CI machine and commit the generated lockfile for reproducible builds.

The comparison provider has its own test suite in the separate scraper repository. Keep the two projects independently deployable.

## Production hardening checklist

Before a public deployment, verify:

- MongoDB backups and restore procedure
- managed secrets and rotated session secret
- HTTPS and correct trusted origins
- Google OAuth redirect/origin configuration if enabled
- an email delivery webhook/provider if email verification or password reset is required
- Cloudflare Workers AI quota and rate limits if enabled
- comparison-service health and private network access
- scraper provider smoke tests from the actual deployment region
- Redis or another shared cache before horizontal API scaling
- external error tracking and alerting
- log retention and PII redaction
- accessibility audit
- browser/device matrix for mood scanning
- recipe provider terms/attribution review
- comparison provider terms/robots/operational review

## Project structure

```text
kiku/
├── src/
│   ├── components/
│   ├── data/
│   ├── pages/
│   ├── services/
│   ├── stores/
│   ├── types/
│   └── App.tsx
│
├── server/
│   ├── auth.js
│   ├── config.js
│   ├── db.js
│   ├── email.js
│   ├── catalog.js
│   ├── providers/
│   ├── services/
│   ├── lib/
│   ├── tests/
│   └── index.js
│
├── docs/
├── Dockerfile
├── docker-compose.dev.yml
├── .env.example
├── server/.env.example
└── package.json
```

## Product boundaries

Kiku intentionally does not process checkout/payment itself, does not claim order completion when only an external link was opened, does not implement internal rider tracking, does not fabricate popularity metrics, and does not upload hidden camera footage.


## Production hardening rules

- Put MongoDB and Redis behind private networking; the included development compose binds those ports to loopback only.
- Use `rediss://` for production Redis and HTTPS for externally reachable provider/AI/email endpoints.
- Keep the Vite dev server private; the project binds it to `127.0.0.1` by default.
- The production Docker runtime runs as the non-root `node` user.
- Generate and commit `package-lock.json` on a networked machine, then use `npm ci` in CI/deployment.

## Public information pages

Kiku exposes the following dedicated, theme-matched information routes rather than inline footer modals:

- `/about` — product overview and architecture principles
- `/how-it-works` — recommendation and discovery flow
- `/privacy` — privacy policy and data controls
- `/terms` — terms of use and product boundaries
- `/accessibility` — accessibility statement and interaction guidance
- `/support` — product help and troubleshooting guidance

Signed-in users can use the privacy page's **Manage my data** action to open Profile → Mood & Privacy, where the permanent account deletion flow is available.

## Recommendation inputs

Kiku's recommendation engine does not use a user-provided preparation-time signal. Recommendation context is based on mood/expression signals, cravings, dietary choices, allergies, cuisine preferences, spice preferences, budget, saved items, and observed first-party activity.

Recipe cooking times and cooking-mode timers remain recipe features and are intentionally separate from recommendation ranking.

## Price comparison notice

Kiku's comparison view is intentionally limited to menu prices and listing/match information for the same restaurant and same dish. Displayed prices do not include tax, service/platform fees, or delivery charges; those are calculated by the external provider according to its own ordering context and location.

## Regional discovery deployment

For the pincode-first live discovery architecture, see:

- `REGIONAL_DISCOVERY_DEPLOYMENT.md` — deployment and free-tier setup.
- `REGIONAL_SCRAPER_CONTRACT.md` — required live scraper API contract.

The live regional path starts from `POST /api/region/refresh` and is isolated by pincode. GitHub Actions should be used for background refresh/maintenance, not as the latency-sensitive live scraper trigger.
=======
# Kiku Frontend

Kiku is a Vite + React + TypeScript frontend.

## Structure

- `src/components/` reusable UI components
- `src/pages/` page-level screens grouped by domain
- `src/data/` static data and feature helpers
- `src/stores/` local application state/persistence
- `src/types/` shared TypeScript contracts
- `src/utils/` small cross-feature utilities
- `src/App.tsx` application composition and page state

## Scripts

- `npm run dev` starts Vite development mode
- `npm run build` creates a production build
- `npm run preview` previews the production build
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
