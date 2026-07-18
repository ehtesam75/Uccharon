"""Lightweight, dependency-free rate limiting for Uccharon.

Uses Django's cache framework (see CACHES in settings) as the counter store, so
it works with any configured backend. A simple fixed-window counter is used:
for each (identifier, time-window) pair we keep an integer count in the cache
and reject requests once the count exceeds the limit within that window.

Design goals mirrored from the security audit:
  • Throttle authentication (brute force) and AI-usage (cost abuse) endpoints.
  • Key by IP and/or account so normal users are unaffected.
  • Return a clear but non-sensitive message. The SAME generic message is used
    regardless of whether an account exists, so throttling never reveals account
    existence.
  • Fail open: if the cache backend errors, requests are allowed rather than
    locking users out of the app.

Notes:
  • Behind Railway's proxy the real client IP is in X-Forwarded-For; we read the
    left-most entry and fall back to REMOTE_ADDR.
  • With a per-process cache (LocMemCache) limits are enforced per worker. For
    strict global limits across multiple workers/instances, point CACHES at a
    shared backend (e.g. Redis). The protection still works either way.
"""

import hashlib
import json
import time
from functools import wraps

from django.core.cache import cache
from django.http import JsonResponse


# Generic, non-sensitive message. Intentionally identical across endpoints and
# regardless of account existence.
DEFAULT_MESSAGE = "Too many requests. Please wait a moment and try again."


def get_client_ip(request):
    """Best-effort client IP, honoring the proxy's X-Forwarded-For header."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        # Left-most address is the original client.
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


def _hash(value):
    """Stable, privacy-preserving short hash for use inside cache keys."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def _allow(scope_key, limit, window):
    """Fixed-window counter. Returns True if this hit is within the limit.

    Fails open (returns True) if the cache backend raises.
    """
    bucket = int(time.time()) // window
    cache_key = f"rl:{scope_key}:{window}:{bucket}"
    try:
        # cache.add only succeeds if the key is absent, giving us an atomic-ish
        # "first hit in this window" signal. Subsequent hits use incr.
        if cache.add(cache_key, 1, timeout=window):
            count = 1
        else:
            try:
                count = cache.incr(cache_key)
            except ValueError:
                # Key expired between add and incr — treat as a fresh window.
                cache.set(cache_key, 1, timeout=window)
                count = 1
        return count <= limit
    except Exception:
        # Never lock users out because of a cache hiccup.
        return True


def _identifier(request, by, field, prefix):
    """Build the scope key for the configured strategy.

    Returns None to skip limiting (e.g. a body-field strategy with no value).
    """
    if by == "ip":
        return f"{prefix}:ip:{get_client_ip(request)}"

    if by == "user":
        if request.user.is_authenticated:
            return f"{prefix}:user:{request.user.id}"
        # Anonymous fallback so the limit can't be trivially bypassed.
        return f"{prefix}:anon:{get_client_ip(request)}"

    if by == "field":
        # Throttle on a value from the JSON body (e.g. the login username),
        # combined with IP. request.body is cached by Django so the view can
        # still parse it afterwards.
        value = ""
        try:
            value = str((json.loads(request.body) or {}).get(field, "")).strip().lower()
        except (ValueError, TypeError):
            value = ""
        if not value:
            return None
        return f"{prefix}:field:{_hash(value)}"

    return None


def rate_limit(*, limit, window, methods=("POST",), by="ip", field=None,
               prefix=None, message=DEFAULT_MESSAGE):
    """Decorator that throttles a view.

    Args:
        limit:   max allowed requests per window.
        window:  window length in seconds.
        methods: HTTP methods to throttle (others pass through untouched, so
                 GET reads on dual-method endpoints stay unaffected).
        by:      'ip' | 'user' | 'field' key strategy.
        field:   JSON body field name when by='field'.
        prefix:  cache-key namespace (defaults to the view name).
        message: response body error text on 429.

    Stack multiple decorators to apply several limits (e.g. IP + account).
    """
    throttled_methods = tuple(m.upper() for m in methods)

    def decorator(view):
        key_prefix = prefix or view.__name__

        @wraps(view)
        def wrapper(request, *args, **kwargs):
            if request.method in throttled_methods:
                scope_key = _identifier(request, by, field, key_prefix)
                if scope_key is not None and not _allow(scope_key, limit, window):
                    return JsonResponse({"error": message}, status=429)
            return view(request, *args, **kwargs)

        return wrapper

    return decorator
