import pytest
from pydantic import ValidationError

from app.models import RegionRequest, SearchRequest


def test_search_request_preserves_pincode():
    request = SearchRequest(location="Agra", restaurant="Cafe", pincode="282001")
    assert request.pincode == "282001"


def test_search_request_rejects_ssrf_provider_url():
    with pytest.raises(ValidationError):
        SearchRequest(location="Agra", restaurant="Cafe", swiggy_url="https://swiggy.com.evil.example/x")


def test_region_request_rejects_leading_zero():
    with pytest.raises(ValidationError):
        RegionRequest(pincode="082001")
