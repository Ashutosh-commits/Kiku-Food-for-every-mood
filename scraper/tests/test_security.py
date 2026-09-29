import pytest

from app.security import normalize_pincode, validate_provider_url


def test_pincode_validation():
    assert normalize_pincode("282001") == "282001"
    assert normalize_pincode("082001") is None
    assert normalize_pincode("28200") is None
    assert normalize_pincode("282001x") is None


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/admin",
        "http://169.254.169.254/latest/meta-data/",
        "https://evil-swiggy.com/path",
        "https://swiggy.com.evil.example/path",
        "https://swiggy.com@127.0.0.1/path",
    ],
)
def test_provider_url_ssrf_rejection(url):
    with pytest.raises(ValueError):
        validate_provider_url(url, "swiggy")


def test_provider_url_accepts_real_provider_host():
    assert validate_provider_url("https://www.swiggy.com/city/agra", "swiggy") == "https://www.swiggy.com/city/agra"
    assert validate_provider_url("https://www.zomato.com/agra", "zomato") == "https://www.zomato.com/agra"


def test_browser_allows_provider_document_hosts_but_blocks_private_subresources():
    from app.providers.browser import _allowed_provider_host, _is_private_or_local_host

    assert _allowed_provider_host("https://www.swiggy.com/city/agra") is True
    assert _allowed_provider_host("https://evil-swiggy.com/city/agra") is False
    assert _is_private_or_local_host("127.0.0.1") is True
    assert _is_private_or_local_host("localhost") is True
