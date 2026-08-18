import pytest

from app.core.ssrf import UnsafeUrlError, assert_proxy_url, assert_public_http_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/secret",
        "http://10.0.0.1/",
        "http://192.168.1.1/",
        "http://[::1]/",
        "ftp://example.com/a",
        "file:///etc/passwd",
        "",
    ],
)
def test_reject_unsafe_urls(url: str) -> None:
    with pytest.raises(UnsafeUrlError):
        assert_public_http_url(url)


def test_accept_public_https() -> None:
    assert assert_public_http_url("https://example.com/watch?v=1").startswith("https://")
    assert assert_public_http_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")


def test_reject_bad_proxy() -> None:
    with pytest.raises(UnsafeUrlError):
        assert_proxy_url("file:///tmp/x")
    assert assert_proxy_url("http://127.0.0.1:7890") == "http://127.0.0.1:7890"
    assert assert_proxy_url("  ") is None
