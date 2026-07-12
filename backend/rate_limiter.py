# backend/rate_limiter.py
"""
Simple in-memory rate limiter for API protection.
Uses a sliding window approach with configurable limits per endpoint type.
"""
import os
import time
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import logging

logger = logging.getLogger("rate_limiter")

# Configuration from environment (requests per minute)
RATE_LIMIT_GENERAL = int(os.getenv("RATE_LIMIT_GENERAL", "200"))
RATE_LIMIT_AI_PARSING = int(os.getenv("RATE_LIMIT_AI_PARSING", "30"))
RATE_LIMIT_BULK = int(os.getenv("RATE_LIMIT_BULK", "10"))
RATE_LIMIT_EXPORT = int(os.getenv("RATE_LIMIT_EXPORT", "5"))

# Window size in seconds
WINDOW_SIZE = 60


class RateLimiter:
    """In-memory rate limiter with sliding window."""
    
    def __init__(self):
        # Store: {client_id: {endpoint_type: [(timestamp, count), ...]}}
        self.requests: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
    
    def _get_endpoint_type(self, path: str, method: str) -> Tuple[str, int]:
        """Determine endpoint type and its rate limit."""
        # AI/SMS parsing endpoints
        if any(x in path for x in ["/parse", "/sms", "/process-queue"]):
            return "ai_parsing", RATE_LIMIT_AI_PARSING
        
        # Bulk operations
        if "bulk" in path or method == "DELETE" and "/transactions" in path:
            return "bulk", RATE_LIMIT_BULK
        
        # Export endpoints
        if "/export" in path:
            return "export", RATE_LIMIT_EXPORT
        
        # General API
        return "general", RATE_LIMIT_GENERAL
    
    def _cleanup_old_requests(self, requests: list, now: float):
        """Remove requests older than the window."""
        cutoff = now - WINDOW_SIZE
        while requests and requests[0] < cutoff:
            requests.pop(0)
    
    def is_allowed(self, client_id: str, path: str, method: str) -> Tuple[bool, int, int]:
        """
        Check if request is allowed.
        Returns: (allowed, current_count, limit)
        """
        now = time.time()
        endpoint_type, limit = self._get_endpoint_type(path, method)
        
        # Get and clean up request history
        requests = self.requests[client_id][endpoint_type]
        self._cleanup_old_requests(requests, now)
        
        current_count = len(requests)
        
        if current_count >= limit:
            return False, current_count, limit
        
        # Record this request
        requests.append(now)
        return True, current_count + 1, limit


# Global rate limiter instance
rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting."""
    
    # CORS headers to include in rate-limited (429) responses so the browser
    # can read the error. Origin is reflected per-request in dispatch(); a
    # static "*" together with Allow-Credentials is an invalid, unsafe combo.
    CORS_HEADERS = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "*",
    }
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and docs
        path = request.url.path
        if path in ["/", "/docs", "/openapi.json", "/health"]:
            return await call_next(request)
        
        # Skip rate limiting for OPTIONS preflight requests (CORS)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Get client identifier (IP or forwarded IP)
        client_ip = request.client.host if request.client else "unknown"
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        
        # Check rate limit
        allowed, count, limit = rate_limiter.is_allowed(
            client_ip, path, request.method
        )
        
        if not allowed:
            logger.warning(f"Rate limit exceeded for {client_ip}: {count}/{limit} on {path}")
            # Include CORS headers in 429 response so browser can read it.
            # Reflect the request Origin (valid alongside credentials, unlike "*").
            headers = {
                "Retry-After": str(WINDOW_SIZE),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                **self.CORS_HEADERS
            }
            origin = request.headers.get("Origin")
            if origin:
                headers["Access-Control-Allow-Origin"] = origin
                headers["Access-Control-Allow-Credentials"] = "true"
                headers["Vary"] = "Origin"
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Please slow down.",
                    "retry_after_seconds": WINDOW_SIZE
                },
                headers=headers
            )
        
        # Process request and add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(limit - count)
        
        return response
