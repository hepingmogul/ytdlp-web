import ipaddress
from urllib.parse import urlparse

ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_HOSTS = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "metadata.goog",
}


class UnsafeUrlError(ValueError):
    """链接未通过安全校验。"""


def _is_blocked_ip(raw: str) -> bool:
    ip = ipaddress.ip_address(raw)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_unspecified
        or ip.is_reserved
    )


def assert_public_http_url(url: str) -> str:
    """拦截明显的内网/本机目标。

    只检查字面量主机名和 IP，不做 DNS 解析：本机若开了 Fake-IP / TUN，
    公网域名也会被解析到 198.18.0.0/15，解析后再判断会误杀正常链接。
    """
    text = (url or "").strip()
    if not text:
        raise UnsafeUrlError("请输入链接")
    if len(text) > 4000:
        raise UnsafeUrlError("链接过长")

    parsed = urlparse(text)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("只支持 http/https 链接")
    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("链接无效")
    lowered = host.lower().rstrip(".")
    if lowered in BLOCKED_HOSTS or lowered.endswith(".localhost"):
        raise UnsafeUrlError("不允许访问本机地址")

    try:
        blocked = _is_blocked_ip(host)
    except ValueError:
        blocked = False
    if blocked:
        raise UnsafeUrlError("不允许访问内网地址")

    return text


def assert_proxy_url(proxy: str | None) -> str | None:
    if proxy is None:
        return None
    text = proxy.strip()
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https", "socks5", "socks5h", "socks4"}:
        raise UnsafeUrlError("代理只支持 http / https / socks5")
    if not parsed.hostname:
        raise UnsafeUrlError("代理地址无效")
    return text
