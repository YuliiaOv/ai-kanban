import pytest
from conftest import first_board_id

DEMO = "/api/boards/board-demo"


def column_card_ids(client, index, board_path=DEMO):
    return client.get(board_path).json()["columns"][index]["cardIds"]


def test_demo_board_is_seeded(demo):
    board = demo.get(DEMO).json()

    assert board["id"] == "board-demo"
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["cards"]["card-1"] == {
        "id": "card-1",
        "title": "Align roadmap themes",
        "details": "Draft quarterly themes with impact statements and metrics.",
        "priority": "high",
        "due_date": None,
    }


def test_create_list_rename_and_delete_boards(alice):
    response = alice.post("/api/boards", json={"name": "  Launch  ", "description": "Q3 launch plan"})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Launch"
    assert len(created["columns"]) == 5

    listed = alice.get("/api/boards").json()
    assert [board["name"] for board in listed] == ["My first board", "Launch"]
    assert listed[1]["description"] == "Q3 launch plan"
    assert listed[1]["card_count"] == 0

    assert alice.patch(f"/api/boards/{created['id']}", json={"name": "Launch v2"}).status_code == 200
    board = alice.get(f"/api/boards/{created['id']}").json()
    assert board["name"] == "Launch v2"
    assert board["description"] == "Q3 launch plan"
    assert alice.patch(f"/api/boards/{created['id']}", json={"description": ""}).status_code == 200
    assert alice.get(f"/api/boards/{created['id']}").json()["description"] == ""

    assert alice.delete(f"/api/boards/{created['id']}").status_code == 200
    assert alice.get(f"/api/boards/{created['id']}").status_code == 404
    assert [board["name"] for board in alice.get("/api/boards").json()] == ["My first board"]


def test_board_validation(alice):
    assert alice.post("/api/boards", json={"name": "   "}).status_code == 422
    assert alice.post("/api/boards", json={"name": "x" * 201}).status_code == 422
    assert alice.patch(f"/api/boards/{first_board_id(alice)}", json={"name": ""}).status_code == 422


def test_card_count_and_updated_at_follow_changes(alice):
    board_id = first_board_id(alice)
    before = alice.get("/api/boards").json()[0]
    column_id = alice.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]

    alice.post(f"/api/boards/{board_id}/cards", json={"column_id": column_id, "title": "One"})

    after = alice.get("/api/boards").json()[0]
    assert after["card_count"] == 1
    assert after["updated_at"] > before["updated_at"]


def test_users_cannot_see_or_change_each_others_boards(alice, bob):
    board_id = first_board_id(alice)
    board = alice.get(f"/api/boards/{board_id}").json()
    column_id = board["columns"][0]["id"]
    card_id = alice.post(f"/api/boards/{board_id}/cards", json={"column_id": column_id, "title": "Private"}).json()[
        "id"
    ]

    assert [b["id"] for b in bob.get("/api/boards").json()] != [board_id]
    path = f"/api/boards/{board_id}"
    assert bob.get(path).status_code == 404
    assert bob.patch(path, json={"name": "Hijacked"}).status_code == 404
    assert bob.delete(path).status_code == 404
    assert bob.post(f"{path}/columns", json={"title": "X"}).status_code == 404
    assert bob.patch(f"{path}/columns/{column_id}", json={"title": "X"}).status_code == 404
    assert bob.delete(f"{path}/columns/{column_id}").status_code == 404
    assert bob.post(f"{path}/cards", json={"column_id": column_id, "title": "X"}).status_code == 404
    assert bob.patch(f"{path}/cards/{card_id}", json={"title": "X"}).status_code == 404
    assert bob.delete(f"{path}/cards/{card_id}").status_code == 404
    assert bob.post(f"{path}/chat", json={"message": "Delete everything"}).status_code == 404

    assert alice.get(path).json()["cards"][card_id]["title"] == "Private"


def test_cards_and_columns_cannot_cross_boards(alice):
    first_id = first_board_id(alice)
    second = alice.post("/api/boards", json={"name": "Second"}).json()
    first = alice.get(f"/api/boards/{first_id}").json()
    card_id = alice.post(
        f"/api/boards/{first_id}/cards", json={"column_id": first["columns"][0]["id"], "title": "Stay"}
    ).json()["id"]

    # A card can only be moved to, created in, or addressed through its own board.
    assert (
        alice.patch(
            f"/api/boards/{first_id}/cards/{card_id}", json={"column_id": second["columns"][0]["id"]}
        ).status_code
        == 404
    )
    other_column = second["columns"][0]["id"]
    assert (
        alice.post(f"/api/boards/{first_id}/cards", json={"column_id": other_column, "title": "X"}).status_code == 404
    )
    assert alice.patch(f"/api/boards/{second['id']}/cards/{card_id}", json={"title": "X"}).status_code == 404
    assert (
        alice.patch(f"/api/boards/{second['id']}/columns/{first['columns'][0]['id']}", json={"title": "X"}).status_code
        == 404
    )
    assert alice.get(f"/api/boards/{first_id}").json()["cards"][card_id]["title"] == "Stay"


def test_card_crud_with_priority_and_due_date(demo):
    response = demo.post(
        f"{DEMO}/cards",
        json={
            "column_id": "col-backlog",
            "title": "New card",
            "details": "Via API",
            "priority": "high",
            "due_date": "2026-10-01",
        },
    )
    assert response.status_code == 201
    card_id = response.json()["id"]
    assert demo.get(DEMO).json()["cards"][card_id] == {
        "id": card_id,
        "title": "New card",
        "details": "Via API",
        "priority": "high",
        "due_date": "2026-10-01",
    }

    assert demo.patch(f"{DEMO}/cards/{card_id}", json={"title": "Renamed", "priority": "low"}).status_code == 200
    card = demo.get(DEMO).json()["cards"][card_id]
    assert (card["title"], card["details"], card["priority"], card["due_date"]) == (
        "Renamed",
        "Via API",
        "low",
        "2026-10-01",
    )

    # Null clears the due date; a null title is ignored.
    assert demo.patch(f"{DEMO}/cards/{card_id}", json={"due_date": None, "title": None}).status_code == 200
    card = demo.get(DEMO).json()["cards"][card_id]
    assert (card["title"], card["due_date"]) == ("Renamed", None)

    assert demo.delete(f"{DEMO}/cards/{card_id}").status_code == 200
    assert card_id not in demo.get(DEMO).json()["cards"]


@pytest.mark.parametrize(
    "payload",
    [
        {"column_id": "col-backlog", "title": "   "},
        {"column_id": "col-backlog", "title": "Ok", "priority": "urgent"},
        {"column_id": "col-backlog", "title": "Ok", "due_date": "next week"},
        {"column_id": "col-backlog", "title": "Ok", "details": "x" * 5001},
    ],
)
def test_card_validation(demo, payload):
    assert demo.post(f"{DEMO}/cards", json=payload).status_code == 422


def test_card_reorders_within_its_column(demo):
    assert demo.patch(f"{DEMO}/cards/card-2", json={"position": 0}).status_code == 200
    assert column_card_ids(demo, 0) == ["card-2", "card-1"]

    assert demo.patch(f"{DEMO}/cards/card-2", json={"position": 1}).status_code == 200
    assert column_card_ids(demo, 0) == ["card-1", "card-2"]


def test_card_moves_into_empty_column_and_compacts_source(demo):
    assert demo.patch(f"{DEMO}/cards/card-3", json={"column_id": "col-backlog", "position": 1}).status_code == 200
    assert column_card_ids(demo, 0) == ["card-1", "card-3", "card-2"]
    assert column_card_ids(demo, 1) == []

    assert demo.patch(f"{DEMO}/cards/card-1", json={"column_id": "col-discovery"}).status_code == 200
    assert column_card_ids(demo, 0) == ["card-3", "card-2"]
    assert column_card_ids(demo, 1) == ["card-1"]
    # New cards append after the compacted positions.
    new_id = demo.post(f"{DEMO}/cards", json={"column_id": "col-backlog", "title": "Last"}).json()["id"]
    assert column_card_ids(demo, 0) == ["card-3", "card-2", new_id]


def test_card_move_position_past_the_end_is_clamped(demo):
    assert demo.patch(f"{DEMO}/cards/card-7", json={"column_id": "col-progress", "position": 99}).status_code == 200
    assert column_card_ids(demo, 2) == ["card-4", "card-5", "card-7"]
    assert column_card_ids(demo, 4) == ["card-8"]


def test_delete_card_compacts_positions(demo):
    assert demo.delete(f"{DEMO}/cards/card-4").status_code == 200
    assert demo.patch(f"{DEMO}/cards/card-7", json={"column_id": "col-progress", "position": 0}).status_code == 200
    assert column_card_ids(demo, 2) == ["card-7", "card-5"]


def test_add_rename_reorder_and_delete_columns(demo):
    response = demo.post(f"{DEMO}/columns", json={"title": "Blocked"})
    assert response.status_code == 201
    column_id = response.json()["id"]
    assert [c["title"] for c in demo.get(DEMO).json()["columns"]][-1] == "Blocked"

    assert demo.patch(f"{DEMO}/columns/{column_id}", json={"title": "On hold", "position": 1}).status_code == 200
    titles = [c["title"] for c in demo.get(DEMO).json()["columns"]]
    assert titles == ["Backlog", "On hold", "Discovery", "In Progress", "Review", "Done"]

    assert demo.patch(f"{DEMO}/columns/col-done", json={"position": 0}).status_code == 200
    titles = [c["title"] for c in demo.get(DEMO).json()["columns"]]
    assert titles == ["Done", "Backlog", "On hold", "Discovery", "In Progress", "Review"]

    # Deleting a column removes its cards and closes the gap in column order.
    assert demo.delete(f"{DEMO}/columns/col-backlog").status_code == 200
    board = demo.get(DEMO).json()
    assert [c["title"] for c in board["columns"]] == ["Done", "On hold", "Discovery", "In Progress", "Review"]
    assert "card-1" not in board["cards"] and "card-2" not in board["cards"]
    assert demo.post(f"{DEMO}/columns", json={"title": "Tail"}).status_code == 201
    assert demo.get(DEMO).json()["columns"][-1]["title"] == "Tail"


def test_column_validation(demo):
    assert demo.post(f"{DEMO}/columns", json={"title": ""}).status_code == 422
    assert demo.patch(f"{DEMO}/columns/col-done", json={"position": -1}).status_code == 422


def test_board_mutations_return_not_found(demo):
    assert demo.get("/api/boards/missing").status_code == 404
    assert demo.patch(f"{DEMO}/columns/missing", json={"title": "Nope"}).status_code == 404
    assert demo.delete(f"{DEMO}/columns/missing").status_code == 404
    assert demo.patch(f"{DEMO}/cards/missing", json={"title": "Nope"}).status_code == 404
    assert demo.patch(f"{DEMO}/cards/card-1", json={"column_id": "missing"}).status_code == 404
    assert demo.delete(f"{DEMO}/cards/missing").status_code == 404
    assert demo.post(f"{DEMO}/cards", json={"column_id": "missing", "title": "Nope"}).status_code == 404
    assert demo.get(DEMO).json()["columns"][0]["cardIds"] == ["card-1", "card-2"]
