# TeamWise authentication backend

FastAPI REST API backed by MySQL. The users table has the eight required fields;
passwords are stored as Argon2 hashes. Login issues a short-lived JWT bearer
token, and `/api/v1/auth/me` requires that token.

## Run with Docker Compose

From `backend/`:

```sh
cp .env.example .env
# Edit .env: set unique MySQL passwords and a random JWT_SECRET_KEY.
docker compose up --build
```

Generate a signing secret with:

```sh
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

The API waits for MySQL, applies Alembic migrations, then starts on port 8000.
Data is persisted in the `mysql_data` Docker volume. Stop the services with
`docker compose down`; the volume remains. Use `docker compose down -v` only
when intentionally deleting the local database contents.

## Run locally without Docker

Create and activate a virtual environment, install dependencies, and configure
`backend/.env` as above. Make sure a MySQL server is reachable at `MYSQL_HOST`
and `MYSQL_PORT` (default host port **3307** so it does not clash with the Play Store review MySQL on 3306).

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

## API and Swagger

- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>
- OpenAPI JSON: <http://localhost:8000/openapi.json>
- Health: <http://localhost:8000/api/v1/health>

In Swagger, use `POST /api/v1/auth/register` to create an account, then
`POST /api/v1/auth/login` to get an access token. Click **Authorize**, enter
the token (without the `Bearer ` prefix), and authorize. Swagger adds the
`Authorization: Bearer ...` header to protected requests. The register/login
payloads and copy-paste examples are in [`../testAPIs.md`](../testAPIs.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Register a user; returns public profile fields only |
| `POST` | `/api/v1/auth/login` | Verify email/password; returns an access token and profile |
| `POST` | `/api/v1/auth/change-password` | Change password while signed in (current + new + confirm) |
| `GET` | `/api/v1/auth/me` | Return the current user's profile; requires bearer token |
| `GET` | `/api/v1/health` | Check API availability |

Validation errors return `422`, duplicate registration returns `409`, invalid
credentials and missing/invalid tokens return `401`. Login uses the same error
message for unknown emails and incorrect passwords. Registration is currently
open and accepts the submitted `role`; connect it to trusted employee onboarding
or restrict it to administrators before exposing the API publicly.

## Tests

Tests use an isolated in-memory SQLite database and do not require Docker/MySQL:

```sh
pip install -r requirements.txt
pip install pytest httpx
pytest -q
```

Do not use the example secrets in production. Restrict registration and configure
HTTPS, secret rotation, database backups, and appropriate rate limiting before
deploying publicly.
