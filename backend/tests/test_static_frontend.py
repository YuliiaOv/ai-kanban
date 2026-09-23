import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    build_dir = (tmp_path / "out").resolve()
    (build_dir / "_next").mkdir(parents=True)
    (build_dir / "index.html").write_text("<h1>Kanban Studio</h1>")
    (build_dir / "_next" / "app.js").write_text("console.log('app');")
    monkeypatch.setattr(main, "FRONTEND_BUILD_DIR", build_dir)
    main.app.state.database_path = tmp_path / "app.db"
    with TestClient(main.app) as test_client:
        yield test_client


def test_root_serves_frontend_index(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_static_asset_is_served(client):
    response = client.get("/_next/app.js")

    assert response.status_code == 200
    assert "console.log" in response.text


def test_unknown_page_falls_back_to_index(client):
    response = client.get("/some/client/route")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_unknown_api_path_returns_404(client):
    assert client.get("/api/missing").status_code == 404


def test_path_traversal_is_not_served(client, tmp_path):
    (tmp_path / "secret.txt").write_text("secret")

    response = client.get("/..%2Fsecret.txt")

    assert "secret" not in response.text


def test_missing_build_returns_503(client, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "FRONTEND_BUILD_DIR", tmp_path / "missing")

    response = client.get("/")

    assert response.status_code == 503
    assert "npm run build" in response.text
