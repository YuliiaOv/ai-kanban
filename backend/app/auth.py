import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import AfterValidator, BaseModel, Field, StringConstraints
from pydantic_core import PydanticCustomError

from .boards import create_board
from .database import connect, utc_now

SESSION_COOKIE = "pm_session"
SESSION_DAYS = 30
SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$")]
PASSWORD_RULES = (
    "Password must be at least 8 characters and include an uppercase letter, "
    "a lowercase letter, a number, and a special character."
)


def check_password_strength(password: str) -> str:
    if len(password) < 8 or not all(
        re.search(pattern, password) for pattern in (r"[A-Z]", r"[a-z]", r"[0-9]", r"[^A-Za-z0-9]")
    ):
        raise PydanticCustomError("password_strength", PASSWORD_RULES)
    return password


Password = Annotated[str, Field(max_length=128), AfterValidator(check_password_strength)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=64)]


class User(BaseModel):
    id: str
    username: str
    display_name: str


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Username
    password: Password
    display_name: DisplayName = ""


class ProfileUpdate(BaseModel):
    display_name: DisplayName


class PasswordChange(BaseModel):
    current_password: str
    new_password: Password


class AccountDeletion(BaseModel):
    password: str


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    scheme, _, rest = stored.partition("$")
    if scheme != "scrypt":
        return False
    salt_hex, _, digest_hex = rest.partition("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), **SCRYPT_PARAMS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user(row: sqlite3.Row) -> User:
    return User(id=row["id"], username=row["username"], display_name=row["display_name"] or row["username"])


def create_user(connection: sqlite3.Connection, username: str, password: str, display_name: str = "") -> User:
    """Insert a user with a starter board. Raises sqlite3.IntegrityError if the username is taken."""
    user_id = str(uuid4())
    connection.execute(
        "INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, username, display_name, hash_password(password), utc_now()),
    )
    create_board(connection, user_id, "My first board")
    return User(id=user_id, username=username, display_name=display_name or username)


def authenticate(connection: sqlite3.Connection, username: str, password: str) -> User | None:
    row = connection.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return None
    return _user(row)


def create_session(connection: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    connection.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_token_hash(token), user_id, now.isoformat(), (now + timedelta(days=SESSION_DAYS)).isoformat()),
    )
    return token


def session_user(connection: sqlite3.Connection, token: str) -> User | None:
    row = connection.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id "
        "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
        (_token_hash(token), utc_now()),
    ).fetchone()
    return _user(row) if row else None


def _database(request: Request):
    return connect(request.app.state.database_path)


def current_user(request: Request) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with _database(request) as connection:
            user = session_user(connection, token)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not signed in")


CurrentUser = Annotated[User, Depends(current_user)]

router = APIRouter(prefix="/api/auth")


def _start_session(connection: sqlite3.Connection, response: Response, user: User) -> None:
    token = create_session(connection, user.id)
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", path="/")


@router.post("/register", status_code=201)
def register(payload: Registration, request: Request, response: Response) -> User:
    try:
        with _database(request) as connection:
            user = create_user(connection, payload.username, payload.password, payload.display_name)
            _start_session(connection, response, user)
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="That username is already taken.") from error
    return user


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response) -> User:
    with _database(request) as connection:
        user = authenticate(connection, payload.username, payload.password)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        _start_session(connection, response, user)
    return user


@router.post("/logout")
def logout(request: Request, response: Response) -> dict[str, str]:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with _database(request) as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "signed out"}


@router.get("/me")
def me(user: CurrentUser) -> User:
    return user


@router.patch("/me")
def update_profile(payload: ProfileUpdate, user: CurrentUser, request: Request) -> User:
    with _database(request) as connection:
        connection.execute("UPDATE users SET display_name = ? WHERE id = ?", (payload.display_name, user.id))
    return User(id=user.id, username=user.username, display_name=payload.display_name or user.username)


@router.post("/password")
def change_password(payload: PasswordChange, user: CurrentUser, request: Request) -> dict[str, str]:
    with _database(request) as connection:
        if authenticate(connection, user.username, payload.current_password) is None:
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(payload.new_password), user.id)
        )
        # Sign out every other session; the current one stays valid.
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user.id, _token_hash(request.cookies[SESSION_COOKIE])),
        )
    return {"status": "updated"}


@router.delete("/me")
def delete_account(payload: AccountDeletion, user: CurrentUser, request: Request, response: Response) -> dict:
    with _database(request) as connection:
        if authenticate(connection, user.username, payload.password) is None:
            raise HTTPException(status_code=400, detail="Password is incorrect.")
        # Sessions and boards (with their columns and cards) cascade.
        connection.execute("DELETE FROM users WHERE id = ?", (user.id,))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "deleted"}
