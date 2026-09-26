from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, first_board_id, sign_up

from app.auth import SESSION_COOKIE, hash_password, verify_password
from app.database import connect
from app.main import app


def test_password_hash_round_trip():
    stored = hash_password("correct horse")

    assert stored.startswith("scrypt$")
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong horse", stored)
    assert not verify_password("anything", "mvp-placeholder")
    assert hash_password("same") != hash_password("same")


def test_api_requires_a_session(client):
    for method, path in [
        ("get", "/api/auth/me"),
        ("get", "/api/boards"),
        ("post", "/api/boards"),
        ("get", "/api/boards/board-demo"),
        ("post", "/api/boards/board-demo/chat"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path


def test_register_signs_in_and_creates_a_starter_board(client):
    user = sign_up(client, "carol", "Carol C")

    assert user["username"] == "carol"
    assert user["display_name"] == "Carol C"
    assert SESSION_COOKIE in client.cookies
    assert client.get("/api/auth/me").json() == user
    boards = client.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["My first board"]
    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert [column["title"] for column in board["columns"]] == ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    assert board["cards"] == {}


def test_display_name_defaults_to_username(client):
    assert sign_up(client, "dave")["display_name"] == "dave"


def test_register_rejects_taken_usernames_case_insensitively(client, make_client):
    sign_up(client, "erin")

    response = make_client().post("/api/auth/register", json={"username": "ERIN", "password": PASSWORD})

    assert response.status_code == 409
    assert response.json()["detail"] == "That username is already taken."


def test_register_validates_username_and_password(client):
    for payload in [
        {"username": "ab", "password": PASSWORD},
        {"username": "has space", "password": PASSWORD},
        {"username": "x" * 33, "password": PASSWORD},
    ]:
        assert client.post("/api/auth/register", json=payload).status_code == 422, payload
    assert SESSION_COOKIE not in client.cookies


def test_register_enforces_password_rules(client):
    # Too short, then missing each required character class in turn.
    for password in ["Pa1!", "password1!", "PASSWORD1!", "Password!!", "Password12"]:
        response = client.post("/api/auth/register", json={"username": "frank", "password": password})
        assert response.status_code == 422, password
        assert response.json()["detail"][0]["msg"].startswith("Password must be at least 8 characters"), password
    assert client.post("/api/auth/register", json={"username": "frank", "password": "Password1!"}).status_code == 201


def test_change_password_enforces_password_rules(alice):
    response = alice.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "weakpassword"})
    assert response.status_code == 422


def test_login_and_logout(client, make_client):
    sign_up(make_client(), "gina")

    assert client.post("/api/auth/login", json={"username": "gina", "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "nobody", "password": PASSWORD}).status_code == 401
    response = client.post("/api/auth/login", json={"username": "Gina", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["username"] == "gina"
    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_logout_revokes_the_session_server_side(alice, make_client):
    token = alice.cookies[SESSION_COOKIE]
    alice.post("/api/auth/logout")

    replay = make_client()
    replay.cookies.set(SESSION_COOKIE, token)
    assert replay.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(alice):
    with connect(app.state.database_path) as connection:
        connection.execute(
            "UPDATE sessions SET expires_at = ?", ((datetime.now(UTC) - timedelta(minutes=1)).isoformat(),)
        )

    assert alice.get("/api/auth/me").status_code == 401


def test_demo_user_can_sign_in(demo):
    assert demo.get("/api/auth/me").json()["display_name"] == "Demo User"
    board = demo.get(f"/api/boards/{first_board_id(demo)}").json()
    assert board["name"] == "Project Board"
    assert len(board["cards"]) == 8


def test_update_profile(alice):
    response = alice.patch("/api/auth/me", json={"display_name": "  Alice Liddell  "})

    assert response.status_code == 200
    assert response.json()["display_name"] == "Alice Liddell"
    assert alice.get("/api/auth/me").json()["display_name"] == "Alice Liddell"
    assert alice.patch("/api/auth/me", json={"display_name": "x" * 65}).status_code == 422


def test_change_password_keeps_current_session_and_revokes_others(alice, make_client):
    other = make_client()
    other.post("/api/auth/login", json={"username": "alice", "password": PASSWORD})
    assert other.get("/api/auth/me").status_code == 200

    wrong = alice.post("/api/auth/password", json={"current_password": "nope-nope", "new_password": "New-password1"})
    assert wrong.status_code == 400
    response = alice.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "New-password1"})
    assert response.status_code == 200

    assert alice.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    fresh = make_client()
    assert fresh.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code == 401
    assert fresh.post("/api/auth/login", json={"username": "alice", "password": "New-password1"}).status_code == 200


def test_delete_account_removes_user_and_boards(alice, make_client):
    board_id = first_board_id(alice)

    assert alice.request("DELETE", "/api/auth/me", json={"password": "wrong-pass"}).status_code == 400
    assert alice.request("DELETE", "/api/auth/me", json={"password": PASSWORD}).status_code == 200

    assert alice.get("/api/auth/me").status_code == 401
    assert make_client().post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code == 401
    with connect(app.state.database_path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM boards WHERE id = ?", (board_id,)).fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    # The username is free again.
    sign_up(make_client(), "alice")
