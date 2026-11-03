# TeamWise Authentication API test formats

The API runs at `http://localhost:8000` by default. Start it using the
instructions in [`backend/README.md`](backend/README.md). These examples work
with Swagger, curl, or Postman.

# To start project
python3 -m uvicorn app.main:app --reload

# To end project
pkill -f "uvicorn app.main:app"

## 1. Check that the API is running

**GET** `/api/v1/health`
```sh
curl http://localhost:8000/api/v1/health
```

Expected response (`200 OK`):

```json
{
  "status": "ok"
}
```

## 2. Register a user

**POST** `/api/v1/auth/register` with `Content-Type: application/json`.

```sh
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "emp_id": "TW-1001",
    "email": "alex@example.com",
    "password": "SecurePassword1!",
    "name": "Alex Employee",
    "department": "Engineering",
    "role": "employee",
    "job_title": "Software Engineer",
    "mobile_number": "+14155550123"
  }'
```

Expected response (`201 Created`): the employee profile, with no password
or password hash.

The password must be 12-128 characters and contain lowercase, uppercase,
numeric, and special characters. The mobile number must contain 7-15 digits,
optionally beginning with `+`. All eight fields are required.

## 3. Log in and copy the token

**POST** `/api/v1/auth/login`

```sh
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "alex@example.com",
    "password": "SecurePassword1!"
  }'
```

Expected response (`200 OK`):

```json
{
  "access_token": "<JWT access token>",
  "token_type": "bearer",
  "user": {
    "emp_id": "TW-1001",
    "email": "alex@example.com",
    "name": "Alex Employee",
    "department": "Engineering",
    "role": "employee",
    "job_title": "Software Engineer",
    "mobile_number": "+14155550123"
  }
}
```

Login with an unknown email or incorrect password returns `401` with
`{"detail":"Invalid email or password"}`.

## 4. Call the protected profile endpoint

Copy `access_token` from the login response and replace `<TOKEN>`:

```sh
curl http://localhost:8000/api/v1/auth/me \
  -H 'Authorization: Bearer <TOKEN>'
```

Expected response (`200 OK`): the authenticated employee profile without any
password field. A missing, expired, or invalid token returns `401`.

## 5. Try validation and duplicate cases

- Register the same `emp_id` or email twice: `409 Conflict`.
- Register an invalid email, weak password, or invalid phone number: `422
  Unprocessable Entity`.
- Call `/api/v1/auth/me` without a bearer token: `401 Unauthorized`.
- Registration is currently open and accepts the submitted `role`; do not
  expose it publicly until account creation is restricted to a trusted flow.

## Use Swagger UI

1. Open <http://localhost:8000/docs>.
2. Expand `POST /api/v1/auth/register`, select **Try it out**, enter the
   registration JSON above, and select **Execute**.
3. Expand `POST /api/v1/auth/login`, enter the login JSON, execute it, and copy
   `access_token` from the response.
4. Select **Authorize** near the top of the Swagger page. Paste only the token
   value (do not add `Bearer `), then authorize and close the dialog.
5. Execute `GET /api/v1/auth/me`. Swagger will send the bearer token for you.
6. Select **Logout** in the Authorize dialog when finished testing.

Swagger's registration and login requests use JSON. The bearer token returned
by login is then applied to protected endpoints with the **Authorize** button.
