from pathlib import Path

import pytest

import app as app_module

app = app_module.app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(app_module, "CONFIG_FILE_PATH", tmp_path / "config.json")
    app.config.update(TESTING=True)
    with app.test_client() as test_client:
        yield test_client


def test_project_load_separates_text_and_attachments(client, tmp_path: Path):
    (tmp_path / "code&notes.py").write_text("print('ready')\n", encoding="utf-8")
    (tmp_path / "diagram.png").write_bytes(b"\x89PNG\r\n")

    response = client.post(
        "/",
        json={
            "absolute_path": str(tmp_path),
            "respect_gitignore": True,
            "respect_pathignore": False,
            "show_hidden_folders": False,
        },
    )

    assert response.status_code == 200
    payload = response.get_json()
    assert "code&amp;notes.py" in payload["fileTree"]
    assert "diagram.png" not in payload["fileTree"]
    assert "diagram.png" in payload["specialTree"]


def test_file_content_cannot_escape_selected_root(client, tmp_path: Path):
    root = tmp_path / "project"
    root.mkdir()
    outside = tmp_path / "private.txt"
    outside.write_text("outside\n", encoding="utf-8")

    with client.session_transaction() as session:
        session["absolute_root"] = str(root)

    response = client.post("/get_file_content", json={"path": "../private.txt"})

    assert response.status_code == 403


def test_native_open_rejects_file_outside_selected_root(client, tmp_path: Path):
    root = tmp_path / "project"
    root.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("outside\n", encoding="utf-8")

    with client.session_transaction() as session:
        session["absolute_root"] = str(root)

    response = client.post("/api/open_file_native", json={"path": str(outside)})

    assert response.status_code == 403
