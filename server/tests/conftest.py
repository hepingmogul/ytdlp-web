import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LUODAI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LUODAI_JWT_SECRET", "test-secret-key-test-secret-key-32")
    get_settings.cache_clear()
    from app.main import create_app

    application = create_app()
    with TestClient(application) as test_client:
        yield test_client
    get_settings.cache_clear()
