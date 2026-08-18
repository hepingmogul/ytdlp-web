def test_first_user_becomes_admin(client) -> None:
    res = client.post(
        "/api/auth/register",
        json={"username": "owner", "password": "password123"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    assert me.json()["username"] == "owner"


def test_second_user_needs_invite(client) -> None:
    first = client.post(
        "/api/auth/register",
        json={"username": "owner", "password": "password123"},
    )
    assert first.status_code == 200
    denied = client.post(
        "/api/auth/register",
        json={"username": "guest", "password": "password123"},
    )
    assert denied.status_code == 400

    admin_token = first.json()["access_token"]
    invite = client.post(
        "/api/admin/invites",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert invite.status_code == 200
    code = invite.json()["code"]

    second = client.post(
        "/api/auth/register",
        json={"username": "guest", "password": "password123", "invite_code": code},
    )
    assert second.status_code == 200
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {second.json()['access_token']}"},
    )
    assert me.json()["role"] == "user"


def test_login_and_task_isolation(client) -> None:
    a = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    invite = client.post(
        "/api/admin/invites",
        headers={"Authorization": f"Bearer {a.json()['access_token']}"},
    )
    b = client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "password": "password123",
            "invite_code": invite.json()["code"],
        },
    )
    headers_a = {"Authorization": f"Bearer {a.json()['access_token']}"}
    headers_b = {"Authorization": f"Bearer {b.json()['access_token']}"}

    created = client.post(
        "/api/tasks",
        headers=headers_a,
        json={"url": "https://example.com/watch?v=demo", "title": "仅爱丽丝可见"},
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    other = client.get(f"/api/tasks/{task_id}", headers=headers_b)
    assert other.status_code == 404

    own_list = client.get("/api/tasks", headers=headers_a)
    assert any(item["id"] == task_id for item in own_list.json()["items"])
    bob_list = client.get("/api/tasks", headers=headers_b)
    assert bob_list.json()["items"] == []


def test_ssrf_rejected_on_parse(client) -> None:
    first = client.post("/api/auth/register", json={"username": "owner", "password": "password123"})
    res = client.post(
        "/api/parse",
        headers={"Authorization": f"Bearer {first.json()['access_token']}"},
        json={"url": "http://127.0.0.1/"},
    )
    assert res.status_code == 400
    assert "内网" in res.json()["detail"] or "本机" in res.json()["detail"]
