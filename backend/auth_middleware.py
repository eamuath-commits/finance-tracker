"""
Authentication middleware for FastAPI.

Intercepts all requests and validates JWT Bearer tokens,
except for explicitly whitelisted public paths.
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from auth import decode_access_token

# Paths that do NOT require authentication
PUBLIC_PATHS = {
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/auth/register",
    "/auth/token",
    "/webhook/sms",           # Telegram webhook (authenticated via ALLOWED_TELEGRAM_USERS)
    "/webhook/telegram",      # Telegram webhook alternate path
    "/api/bank/callback",     # OAuth callback from Al Rajhi (no JWT in redirect)
}

# Path prefixes that are public (checked with startswith)
PUBLIC_PREFIXES = (
    "/auth/",
    "/docs/",
    "/redoc/",
)


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces JWT authentication on all non-public routes.
    
    Public routes (login, register, docs, webhooks) are whitelisted.
    All other routes require a valid Authorization: Bearer <token> header.
    
    The decoded user's username is stored in request.state.username
    for downstream access if needed.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        method = request.method

        # Allow preflight CORS requests
        if method == "OPTIONS":
            return await call_next(request)

        # Allow public paths
        if path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES):
            return await call_next(request)

        # Extract and validate token
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Not authenticated"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header.split(" ", 1)[1]
        payload = decode_access_token(token)
        if payload is None:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Could not validate credentials"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Store username in request state for downstream use
        request.state.username = payload.get("sub")
        return await call_next(request)
