from fastapi.testclient import TestClient

from app.main import app
from app.config import settings


def test_health_aliases():
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "healthy"
    assert client.get("/healthz").json()["status"] == "healthy"


def test_auth_is_required_when_configured(monkeypatch):
    original = settings.api_key
    object.__setattr__(settings, "api_key", "secret-key-123456789012345678901234")
    client = TestClient(app)
    response = client.post("/api/v1/compare", json={"location": "Agra", "restaurant": "Cafe"})
    assert response.status_code == 401
    object.__setattr__(settings, "api_key", original)


def test_invalid_provider_urls_are_rejected():
    client = TestClient(app)
    response = client.post(
        "/api/v1/compare",
        json={
            "location": "Agra",
            "restaurant": "Cafe",
            "swiggy_url": "https://evil-swiggy.com/menu",
        },
    )
    assert response.status_code == 422
