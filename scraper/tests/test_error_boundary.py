from fastapi.testclient import TestClient

from app.main import app


def test_compare_does_not_leak_provider_exception(monkeypatch):
    async def explode(_request):
        raise RuntimeError("SUPER_SECRET_PROVIDER_DETAIL")

    monkeypatch.setattr("app.main.compare", explode)
    client = TestClient(app)
    response = client.post("/api/v1/compare", json={"location": "Agra", "restaurant": "Cafe"})
    assert response.status_code == 502
    body = response.json()
    assert "SUPER_SECRET_PROVIDER_DETAIL" not in str(body)
    assert body["detail"]["code"] == "COMPARISON_FAILED"
