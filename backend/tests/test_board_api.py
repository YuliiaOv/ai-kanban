import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path):
    app.state.database_path = tmp_path / "app.db"
    with TestClient(app) as test_client:
        yield test_client


def test_database_is_created_and_board_is_seeded(client):
    response = client.get("/api/board")

    assert response.status_code == 200
    board = response.json()
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]


def test_board_mutations_persist_and_keep_card_order(client):
    rename_response = client.patch(
        "/api/board/columns/col-backlog", json={"title": "Ideas"}
    )
    assert rename_response.status_code == 200

    create_response = client.post(
        "/api/board/cards",
        json={
            "column_id": "col-backlog",
            "title": "New card",
            "details": "Created through the API",
        },
    )
    assert create_response.status_code == 201
    created_card_id = create_response.json()["id"]

    move_response = client.patch(
        f"/api/board/cards/{created_card_id}",
        json={"column_id": "col-done", "position": 0},
    )
    assert move_response.status_code == 200

    edit_response = client.patch(
        f"/api/board/cards/{created_card_id}",
        json={"title": "Updated card", "details": "Updated details"},
    )
    assert edit_response.status_code == 200

    board = client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Ideas"
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["columns"][-1]["cardIds"][0] == created_card_id
    assert board["cards"][created_card_id] == {
        "id": created_card_id,
        "title": "Updated card",
        "details": "Updated details",
    }

    delete_response = client.delete(f"/api/board/cards/{created_card_id}")
    assert delete_response.status_code == 200
    assert created_card_id not in client.get("/api/board").json()["cards"]


def test_board_mutations_return_not_found(client):
    assert client.patch(
        "/api/board/columns/missing", json={"title": "Nope"}
    ).status_code == 404
    assert client.patch("/api/board/cards/missing", json={"title": "Nope"}).status_code == 404
    assert client.delete("/api/board/cards/missing").status_code == 404
    assert client.post(
        "/api/board/cards", json={"column_id": "missing", "title": "Nope"}
    ).status_code == 404
