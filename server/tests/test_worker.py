import time

from app.services.ytdlp_service import YtdlpCancelled


def test_worker_picks_up_queued_task(client, monkeypatch) -> None:
    def fake_download(task, outdir, **kwargs):
        hook = kwargs.get("progress_hook")
        if hook:
            hook(
                {
                    "status": "downloading",
                    "downloaded_bytes": 40,
                    "total_bytes": 80,
                    "speed": 2048,
                    "eta": 2,
                }
            )
            hook({"status": "finished"})

    monkeypatch.setattr("app.workers.downloader.download_task", fake_download)
    first = client.post("/api/auth/register", json={"username": "owner", "password": "password123"})
    headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    created = client.post(
        "/api/tasks",
        headers=headers,
        json={"url": "https://example.com/watch?v=demo", "title": "进度测试"},
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    status = "queued"
    for _ in range(40):
        detail = client.get(f"/api/tasks/{task_id}", headers=headers)
        assert detail.status_code == 200
        status = detail.json()["status"]
        if status in {"done", "failed", "cancelled"}:
            break
        time.sleep(0.05)

    assert status == "done", detail.text


def test_progress_fields_from_fragments() -> None:
    from app.workers.downloader import _progress_fields

    data = _progress_fields(
        {
            "status": "downloading",
            "downloaded_bytes": 0,
            "fragment_index": 3,
            "fragment_count": 10,
        }
    )
    assert data["percent"] == 30.0


def test_cancel_exception_type() -> None:
    assert issubclass(YtdlpCancelled, Exception)
