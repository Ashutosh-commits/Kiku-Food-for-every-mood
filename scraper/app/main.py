from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings, validate_settings
from .models import RegionRequest, SearchRequest
from .security import auth_key_matches
from .services import compare, scrape_region

logger = logging.getLogger("mise")

try:
    validate_settings()
except RuntimeError:
    # Fail loudly in production, but retain importability for tooling/tests.
    if settings.app_env == "production":
        raise

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Scraper-Api-Key"],
)

_RATE_HISTORY: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_limit(request: Request) -> None:
    now = time.monotonic()
    bucket = _RATE_HISTORY[_client_key(request)]
    while bucket and now - bucket[0] > settings.rate_limit_window_seconds:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_max_requests:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "Too many scraper requests. Please try again later."})
    bucket.append(now)


def require_scraper_auth(
    request: Request,
    api_key: str | None = Header(default=None, alias="X-Scraper-Api-Key"),
):
    _rate_limit(request)
    if not auth_key_matches(api_key, settings.api_key):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Scraper authentication required."})


@app.get("/")
async def read_root():
    return {"service": settings.app_name, "status": "ok", "version": "1.0.0"}


@app.get("/health")
@app.get("/healthz")
async def health():
    return {"status": "healthy"}


@app.post("/api/v1/compare", response_model=dict, dependencies=[Depends(require_scraper_auth)])
async def compare_food(request: SearchRequest):
    try:
        result = await compare(request)
        return JSONResponse(content=result.model_dump(mode="json"))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Comparison request failed")
        raise HTTPException(status_code=502, detail={"code": "COMPARISON_FAILED", "message": "The comparison service could not complete the request."})


@app.post("/api/v1/region", response_model=dict, dependencies=[Depends(require_scraper_auth)])
async def regional_discovery(request: RegionRequest):
    try:
        result = await scrape_region(request.pincode)
        return JSONResponse(content=result.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_PINCODE", "message": str(exc)})
    except Exception:
        logger.exception("Regional discovery failed")
        raise HTTPException(status_code=502, detail={"code": "REGIONAL_SCRAPE_FAILED", "message": "The regional scraper could not complete the requested PIN."})
