import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
for candidate in (str(BACKEND_ROOT), str(ROOT)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PASSWORD = "Password123!"


@pytest.fixture
def make_client(tmp_path):
    """Return a factory for clients sharing one fresh database; each keeps its own session cookie."""
    app.state.database_path = tmp_path / "app.db"
    clients = []

    def factory() -> TestClient:
        test_client = TestClient(app)
        test_client.__enter__()
        clients.append(test_client)
        return test_client

    yield factory
    for test_client in clients:
        test_client.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    """A client that is not signed in."""
    return make_client()


def sign_up(test_client: TestClient, username: str, display_name: str = "") -> dict:
    response = test_client.post(
        "/api/auth/register", json={"username": username, "password": PASSWORD, "display_name": display_name}
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def alice(make_client):
    test_client = make_client()
    sign_up(test_client, "alice", "Alice")
    return test_client


@pytest.fixture
def bob(make_client):
    test_client = make_client()
    sign_up(test_client, "bob", "Bob")
    return test_client


@pytest.fixture
def demo(make_client):
    """Signed in as the seeded demo user, whose board uses the fixed demo ids."""
    test_client = make_client()
    assert test_client.post("/api/auth/login", json={"username": "user", "password": "password"}).status_code == 200
    return test_client


def first_board_id(test_client: TestClient) -> str:
    return test_client.get("/api/boards").json()[0]["id"]
