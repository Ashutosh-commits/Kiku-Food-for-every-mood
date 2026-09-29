from app.config import Settings


def test_realdata_key_is_server_side_configuration_only():
    settings = Settings(realdata_api_key="")
    assert settings.realdata_api_key == ""
    assert not settings.realdata_api_key.startswith("VITE_")
