from fastapi.testclient import TestClient

from app.main import app


def test_region_requires_six_digit_pincode():
    client = TestClient(app)
    response = client.post("/api/v1/region", json={"pincode": "28200"})
    assert response.status_code == 422
