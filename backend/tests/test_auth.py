from sqlalchemy import select

from app.models import User
from conftest import TestingSessionLocal


def registration_payload(**overrides):
    return {
        "emp_id": "NP1001",
        "email": "alex@example.com",
        "password": "SecurePassword1!",
        "name": "Alex Employee",
        "department_id": 1,
        "role_id": 1,
        "job_title": "Software Engineer",
        "mobile_number": "+14155550123",
        **overrides,
    }


def test_registration_options_lists_departments_and_roles(client):
    response = client.get("/api/v1/auth/registration-options")
    assert response.status_code == 200
    body = response.json()
    assert len(body["departments"]) >= 1
    assert len(body["roles"]) >= 1
    assert body["departments"][0]["name"]
    assert body["roles"][0]["name"]


def test_register_login_and_get_me(client):
    register_response = client.post("/api/v1/auth/register", json=registration_payload())
    assert register_response.status_code == 201
    assert "password" not in register_response.json()

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "SecurePassword1!"},
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    assert token_data["token_type"] == "bearer"
    assert token_data["user"]["emp_id"] == "NP1001"

    profile_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["email"] == "alex@example.com"
    assert profile["department_id"] == 1
    assert "password" not in profile


def test_password_is_hashed_in_database(client):
    client.post("/api/v1/auth/register", json=registration_payload())
    db = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.emp_id == "NP1001"))
        assert user is not None
        assert user.password != "SecurePassword1!"
        assert user.password.startswith("$argon2")
    finally:
        db.close()


def test_duplicate_registration_is_rejected(client):
    payload = registration_payload()
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


def test_bad_password_and_missing_token_are_rejected(client):
    client.post("/api/v1/auth/register", json=registration_payload())
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "wrong-password"},
    )
    assert login_response.status_code == 401
    assert login_response.json()["detail"] == "Invalid email or password"
    assert client.get("/api/v1/auth/me").status_code == 401


def test_change_password_requires_correct_current_password(client):
    client.post("/api/v1/auth/register", json=registration_payload())
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "SecurePassword1!"},
    )
    token = login_response.json()["access_token"]

    wrong_current = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "wrong-password",
            "new_password": "NewSecurePassword1!",
            "confirm_new_password": "NewSecurePassword1!",
        },
    )
    assert wrong_current.status_code == 401

    mismatch = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "SecurePassword1!",
            "new_password": "NewSecurePassword1!",
            "confirm_new_password": "DifferentSecure1!",
        },
    )
    assert mismatch.status_code == 422

    success = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "SecurePassword1!",
            "new_password": "NewSecurePassword1!",
            "confirm_new_password": "NewSecurePassword1!",
        },
    )
    assert success.status_code == 204

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "SecurePassword1!"},
    )
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "alex@example.com", "password": "NewSecurePassword1!"},
    )
    assert old_login.status_code == 401
    assert new_login.status_code == 200


def test_registration_validates_password_and_mobile(client):
    weak_password = client.post(
        "/api/v1/auth/register",
        json=registration_payload(password="not-strong"),
    )
    invalid_mobile = client.post(
        "/api/v1/auth/register",
        json=registration_payload(mobile_number="call-me"),
    )
    assert weak_password.status_code == 422
    assert invalid_mobile.status_code == 422
