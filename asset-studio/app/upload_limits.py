"""Bound upload work before FastAPI reads or spools the request body."""
from __future__ import annotations

import re
import threading
import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class UploadLimitMiddleware:
    def __init__(
        self, app: ASGIApp, *, require_auth: Callable, body_limits: dict[tuple[str, str], int],
        per_client: int = 2, total: int = 8, starts_per_minute: int = 30,
        total_starts_per_minute: int = 120, clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.app = app
        self.require_auth = require_auth
        self.body_limits = body_limits
        self.per_client = per_client
        self.total = total
        self.starts_per_minute = starts_per_minute
        self.total_starts_per_minute = total_starts_per_minute
        self.clock = clock
        self._lock = threading.Lock()
        self._active: dict[str, int] = {}
        self._total_active = 0
        self._starts: dict[str, deque[float]] = {}
        self._total_starts: deque[float] = deque()

    def _policy(self, scope: Scope) -> tuple[int, bool] | None:
        path = scope['path'].rstrip('/')
        if re.fullmatch(r'/api/uploads/[^/]+/finish', path):
            path = '/api/uploads/{upload_id}/finish'
        elif path != '/api/uploads/start' and re.fullmatch(r'/api/uploads/[^/]+', path):
            path = '/api/uploads/{upload_id}'
        limit = self.body_limits.get((scope['method'], path))
        if limit is None:
            return None
        starts = path not in {'/api/uploads/{upload_id}', '/api/uploads/{upload_id}/finish'}
        return limit, starts

    def _acquire(self, client: str, starts: bool) -> None:
        with self._lock:
            now = self.clock()
            cutoff = now - 60
            # Only admitted starts create state, and the global rate caps its size.
            for key in list(self._starts):
                history = self._starts[key]
                while history and history[0] <= cutoff:
                    history.popleft()
                if not history:
                    del self._starts[key]
            while self._total_starts and self._total_starts[0] <= cutoff:
                self._total_starts.popleft()
            if self._active.get(client, 0) >= self.per_client or self._total_active >= self.total:
                raise HTTPException(429, '同时上传的任务过多，请稍后再试', headers={'Retry-After': '1'})
            if starts:
                history = self._starts.get(client, ())
                if len(history) >= self.starts_per_minute or len(self._total_starts) >= self.total_starts_per_minute:
                    raise HTTPException(429, '上传过于频繁，请稍后再试', headers={'Retry-After': '60'})
                self._starts.setdefault(client, deque()).append(now)
                self._total_starts.append(now)
            self._active[client] = self._active.get(client, 0) + 1
            self._total_active += 1

    def _release(self, client: str) -> None:
        with self._lock:
            count = self._active[client] - 1
            if count:
                self._active[client] = count
            else:
                del self._active[client]
            self._total_active -= 1

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http' or (policy := self._policy(scope)) is None:
            await self.app(scope, receive, send)
            return
        limit, starts = policy
        request = Request(scope)
        client = request.client.host if request.client else 'unknown'
        try:
            # Authentication and admission happen before even the first receive().
            self.require_auth(request, request.cookies.get('ato_session'))
            declared = request.headers.get('content-length')
            if declared is not None:
                try:
                    size = int(declared)
                except ValueError:
                    raise HTTPException(400, 'Content-Length 无效') from None
                if size < 0:
                    raise HTTPException(400, 'Content-Length 无效')
                if size > limit:
                    raise HTTPException(413, '上传请求超过大小限制')
            self._acquire(client, starts)
        except HTTPException as exc:
            await JSONResponse({'detail': exc.detail}, exc.status_code, headers=exc.headers)(scope, receive, send)
            return

        received = 0
        async def limited_receive() -> dict:
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > limit:
                    raise HTTPException(413, '上传请求超过大小限制')
            return message

        try:
            # Pure ASGI wrapping holds the slot through parsing, processing and
            # BackgroundTasks; cancellation and exceptions release it as well.
            await self.app(scope, limited_receive, send)
        finally:
            self._release(client)
