from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder

from fastapi.responses import JSONResponse

from app.api.platform import router as platform_router
from app.api.router import router
from app.core.config import get_settings
from app.core.security_headers import SecurityHeadersMiddleware

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.db.session import SessionLocal
        from app.services.seed import seed_rbac_if_empty

        with SessionLocal() as db:
            seed_rbac_if_empty(db)
    except Exception as exc:
        logger.warning("Database auto-seed check skipped or deferred: %s", exc)
    yield


fastapi_kwargs: dict = {
    "title": "TeamWise Authentication API",
    "description": (
        "Employee registration and login with JWT bearer tokens. "
        "Unified review platform endpoints under /api align with Enterprise API v2.1."
    ),
    "version": "2.1.0",
    "lifespan": lifespan,
}
if settings.is_production:
    fastapi_kwargs.update(docs_url=None, redoc_url=None, openapi_url=None)

app = FastAPI(**fastapi_kwargs)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _is_platform_path(path: str) -> bool:
    return path.startswith("/api/") and not path.startswith("/api/v1/")


def _platform_error_body(
    *,
    code: str,
    message: str,
    details: object = None,
) -> dict:
    return {"success": False, "code": code, "message": message, "details": details}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if _is_platform_path(request.url.path):
        if isinstance(exc.detail, dict) and exc.detail.get("success") is False:
            body = exc.detail
        else:
            code = "AUTHENTICATION_ERROR" if exc.status_code == 401 else "FORBIDDEN"
            if exc.status_code == 404:
                code = "NOT_FOUND"
            elif exc.status_code == 429:
                code = "RATE_LIMIT_EXCEEDED"
            elif exc.status_code >= 500:
                code = "INTERNAL_SERVER_ERROR"
            message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            body = _platform_error_body(code=code, message=message)
        return JSONResponse(status_code=exc.status_code, content=body, headers=getattr(exc, "headers", None))
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    if _is_platform_path(request.url.path):
        return JSONResponse(
            status_code=422,
            content=_platform_error_body(
                code="VALIDATION_ERROR",
                message="Request validation failed",
                details=jsonable_encoder(exc.errors()),
            ),
        )
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})


api = router
app.include_router(api, prefix="/api/v1")
app.include_router(platform_router, prefix="/api")


@app.get("/health", tags=["health"], summary="Check API availability (spec)")
@app.get("/api/v1/health", tags=["health"], summary="Check API availability (v1)")
def health() -> dict[str, str]:
    return {"status": "ok"}
