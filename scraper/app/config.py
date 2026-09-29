from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


def _load_dotenv() -> None:
    """Load a local `.env` (standalone/non-Docker dev only).

    Docker Compose injects real environment variables directly, so this never
    overrides anything already present in os.environ - it only fills the gap
    for `uvicorn app.main:app` run by hand without a process manager.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        os.environ[key] = value


_load_dotenv()


def _csv(name: str, default: str = "") -> tuple[str, ...]:
    raw = os.getenv(name, default)
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Mise Comparison Service")
    app_env: str = os.getenv("APP_ENV", "development")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))
    request_timeout_seconds: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "25"))
    browser_timeout_ms: int = int(os.getenv("BROWSER_TIMEOUT_MS", "20000"))
    max_concurrent_comparisons: int = int(os.getenv("MAX_CONCURRENT_COMPARISONS", "2"))
    max_concurrent_searches: int = int(os.getenv("MAX_CONCURRENT_SEARCHES", "4"))
    cache_ttl_seconds: int = int(os.getenv("CACHE_TTL_SECONDS", "60"))
    cache_max_items: int = int(os.getenv("CACHE_MAX_ITEMS", "256"))
    region_max_restaurants_per_provider: int = int(os.getenv("REGION_MAX_RESTAURANTS_PER_PROVIDER", "5"))
    region_max_dishes: int = int(os.getenv("REGION_MAX_DISHES", "1500"))
    region_max_restaurants: int = int(os.getenv("REGION_MAX_RESTAURANTS", "100"))
    region_max_concurrent_restaurants: int = int(os.getenv("REGION_MAX_CONCURRENT_RESTAURANTS", "2"))
    api_key: str = os.getenv("SCRAPER_API_KEY", "")
    rate_limit_window_seconds: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
    rate_limit_max_requests: int = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "20"))
    debug_errors: bool = os.getenv("SCRAPER_DEBUG_ERRORS", "false").lower() == "true"
    browser_channel: str = os.getenv("PLAYWRIGHT_BROWSER_CHANNEL", "").strip().lower()
    realdata_api_key: str = os.getenv("REALDATA_API_KEY", "").strip()
    realdata_api_base_url: str = os.getenv("REALDATA_API_BASE_URL", "https://api.realdataapi.com").rstrip("/")
    realdata_api_timeout_seconds: float = float(os.getenv("REALDATA_API_TIMEOUT_SECONDS", "30"))
    realdata_swiggy_search_path: str = os.getenv("REALDATA_SWIGGY_SEARCH_PATH", "/v1/swiggy/search")
    realdata_swiggy_menu_path: str = os.getenv("REALDATA_SWIGGY_MENU_PATH", "/v1/swiggy/menu")
    realdata_zomato_search_path: str = os.getenv("REALDATA_ZOMATO_SEARCH_PATH", "/v1/zomato/search")
    realdata_zomato_menu_path: str = os.getenv("REALDATA_ZOMATO_MENU_PATH", "/v1/zomato/menu")
    realdata_query_param: str = os.getenv("REALDATA_QUERY_PARAM", "query")
    realdata_location_param: str = os.getenv("REALDATA_LOCATION_PARAM", "city")
    realdata_url_param: str = os.getenv("REALDATA_URL_PARAM", "url")
    apify_api_base_url: str = os.getenv("APIFY_API_BASE_URL", "https://api.apify.com").rstrip("/")
    apify_timeout_seconds: float = float(os.getenv("APIFY_TIMEOUT_SECONDS", "90"))
    apify_run_timeout_seconds: float = float(os.getenv("APIFY_RUN_TIMEOUT_SECONDS", "90"))
    apify_status_wait_seconds: float = float(os.getenv("APIFY_STATUS_WAIT_SECONDS", "10"))
    apify_response_max_bytes: int = int(os.getenv("APIFY_RESPONSE_MAX_BYTES", "8388608"))
    apify_swiggy_enabled: bool = os.getenv("APIFY_SWIGGY_ENABLED", "true").lower() == "true"
    apify_swiggy_token: str = os.getenv("APIFY_SWIGGY_TOKEN", "").strip()
    apify_zomato_enabled: bool = os.getenv("APIFY_ZOMATO_ENABLED", "false").lower() == "true"
    apify_zomato_token: str = os.getenv("APIFY_ZOMATO_TOKEN", "").strip()
    apify_swiggy_actor: str = os.getenv("APIFY_SWIGGY_ACTOR", "shahidirfan~swiggy-restaurant-scraper").strip()
    apify_zomato_actor: str = os.getenv("APIFY_ZOMATO_ACTOR", "thirdwatch~zomato-scraper").strip()
    apify_swiggy_max_results: int = int(os.getenv("APIFY_SWIGGY_MAX_RESULTS", "5"))
    apify_swiggy_region_keyword: str = os.getenv("APIFY_SWIGGY_REGION_KEYWORD", "biryani").strip()
    apify_swiggy_region_keywords: tuple[str, ...] = _csv(
        "APIFY_SWIGGY_REGION_KEYWORDS",
        "biryani,paneer,chicken,mutton,egg,ramen,thai,pizza,desserts,dal,noodles",
    )
    apify_swiggy_region_max_pages: int = int(os.getenv("APIFY_SWIGGY_REGION_MAX_PAGES", "1"))
    apify_swiggy_menu_actor: str = os.getenv("APIFY_SWIGGY_MENU_ACTOR", "smacient~swiggy-restaurant-menu-extractor").strip()
    apify_swiggy_menu_max_restaurants: int = int(os.getenv("APIFY_SWIGGY_MENU_MAX_RESTAURANTS", "5"))
    apify_swiggy_menu_run_timeout_seconds: float = float(os.getenv("APIFY_SWIGGY_MENU_RUN_TIMEOUT_SECONDS", "360"))
    apify_zomato_max_results: int = int(os.getenv("APIFY_ZOMATO_MAX_RESULTS", "5"))
    apify_max_concurrent_runs: int = int(os.getenv("APIFY_MAX_CONCURRENT_RUNS", "1"))
    apify_error_cooldown_seconds: int = int(os.getenv("APIFY_ERROR_COOLDOWN_SECONDS", "300"))
    apify_fallback_realdata: bool = os.getenv("APIFY_FALLBACK_REALDATA", "false").lower() == "true"
    # PIN -> postal geography is cached aggressively so provider lookups do not repeat geocoding.
    pin_resolver_postal_base_url: str = os.getenv("PIN_RESOLVER_POSTAL_BASE_URL", "https://api.postalpincode.in").rstrip("/")
    pin_resolver_geocode_base_url: str = os.getenv("PIN_RESOLVER_GEOCODE_BASE_URL", "https://nominatim.openstreetmap.org").rstrip("/")
    pin_resolver_timeout_seconds: float = float(os.getenv("PIN_RESOLVER_TIMEOUT_SECONDS", "10"))
    pin_resolver_response_max_bytes: int = int(os.getenv("PIN_RESOLVER_RESPONSE_MAX_BYTES", "1048576"))
    pin_resolver_cache_ttl_seconds: int = int(os.getenv("PIN_RESOLVER_CACHE_TTL_SECONDS", "2592000"))
    pin_resolver_cache_max_items: int = int(os.getenv("PIN_RESOLVER_CACHE_MAX_ITEMS", "1024"))
    pin_resolver_min_geocode_interval_seconds: float = float(os.getenv("PIN_RESOLVER_MIN_GEOCODE_INTERVAL_SECONDS", "1.1"))
    pin_resolver_user_agent: str = os.getenv("PIN_RESOLVER_USER_AGENT", "Kiku/1.0 (local food discovery app)")
    pin_resolver_referer: str = os.getenv("PIN_RESOLVER_REFERER", "http://localhost:5173/")
    cors_origins: tuple[str, ...] = _csv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    user_agent: str = os.getenv(
        "USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    )


settings = Settings()


def validate_settings() -> None:
    if settings.app_env == "production":
        if settings.host not in {"0.0.0.0", "::"}:
            raise RuntimeError("HOST must be 0.0.0.0 or :: in production")
        if not settings.api_key or len(settings.api_key) < 24:
            raise RuntimeError("SCRAPER_API_KEY must be at least 24 characters in production")
    if settings.max_concurrent_comparisons < 1:
        raise RuntimeError("MAX_CONCURRENT_COMPARISONS must be >= 1")
    if settings.max_concurrent_searches < 1:
        raise RuntimeError("MAX_CONCURRENT_SEARCHES must be >= 1")
    if settings.region_max_restaurants_per_provider < 1:
        raise RuntimeError("REGION_MAX_RESTAURANTS_PER_PROVIDER must be >= 1")
    if settings.region_max_dishes < 1:
        raise RuntimeError("REGION_MAX_DISHES must be >= 1")
    if settings.region_max_restaurants < 1:
        raise RuntimeError("REGION_MAX_RESTAURANTS must be >= 1")
    if settings.region_max_concurrent_restaurants < 1:
        raise RuntimeError("REGION_MAX_CONCURRENT_RESTAURANTS must be >= 1")
    if settings.apify_swiggy_menu_run_timeout_seconds < 60 or settings.apify_swiggy_menu_run_timeout_seconds > 600:
        raise RuntimeError("APIFY_SWIGGY_MENU_RUN_TIMEOUT_SECONDS must be between 60 and 600")
    if settings.apify_timeout_seconds < 10 or settings.apify_timeout_seconds > 300:
        raise RuntimeError("APIFY_TIMEOUT_SECONDS must be between 10 and 300")
    if settings.apify_run_timeout_seconds < 15 or settings.apify_run_timeout_seconds > 180:
        raise RuntimeError("APIFY_RUN_TIMEOUT_SECONDS must be between 15 and 180")
    if settings.apify_status_wait_seconds < 5 or settings.apify_status_wait_seconds > 30:
        raise RuntimeError("APIFY_STATUS_WAIT_SECONDS must be between 5 and 30")
    if settings.apify_swiggy_menu_max_restaurants < 1 or settings.apify_swiggy_menu_max_restaurants > 10:
        raise RuntimeError("APIFY_SWIGGY_MENU_MAX_RESTAURANTS must be between 1 and 10")
    if settings.apify_response_max_bytes < 1048576 or settings.apify_response_max_bytes > 33554432:
        raise RuntimeError("APIFY_RESPONSE_MAX_BYTES must be between 1048576 and 33554432")
    if settings.apify_swiggy_max_results < 1 or settings.apify_swiggy_max_results > 25:
        raise RuntimeError("APIFY_SWIGGY_MAX_RESULTS must be between 1 and 25")
    if settings.apify_swiggy_region_max_pages < 1 or settings.apify_swiggy_region_max_pages > 5:
        raise RuntimeError("APIFY_SWIGGY_REGION_MAX_PAGES must be between 1 and 5")
    if not settings.apify_swiggy_region_keywords:
        raise RuntimeError("APIFY_SWIGGY_REGION_KEYWORDS must contain at least one keyword")
    if len(settings.apify_swiggy_region_keywords) > 15:
        raise RuntimeError("APIFY_SWIGGY_REGION_KEYWORDS must contain at most 15 keywords")
    if settings.apify_zomato_max_results < 1 or settings.apify_zomato_max_results > 10:
        raise RuntimeError("APIFY_ZOMATO_MAX_RESULTS must be between 1 and 10")
    if settings.apify_max_concurrent_runs < 1 or settings.apify_max_concurrent_runs > 4:
        raise RuntimeError("APIFY_MAX_CONCURRENT_RUNS must be between 1 and 4")
    if settings.apify_error_cooldown_seconds < 30 or settings.apify_error_cooldown_seconds > 3600:
        raise RuntimeError("APIFY_ERROR_COOLDOWN_SECONDS must be between 30 and 3600")
    if settings.pin_resolver_timeout_seconds < 2 or settings.pin_resolver_timeout_seconds > 60:
        raise RuntimeError("PIN_RESOLVER_TIMEOUT_SECONDS must be between 2 and 60")
    if settings.pin_resolver_cache_ttl_seconds < 3600:
        raise RuntimeError("PIN_RESOLVER_CACHE_TTL_SECONDS must be at least 3600")
    if settings.pin_resolver_cache_max_items < 1 or settings.pin_resolver_cache_max_items > 10000:
        raise RuntimeError("PIN_RESOLVER_CACHE_MAX_ITEMS must be between 1 and 10000")
    if settings.pin_resolver_min_geocode_interval_seconds < 1.0:
        raise RuntimeError("PIN_RESOLVER_MIN_GEOCODE_INTERVAL_SECONDS must be at least 1 second")
