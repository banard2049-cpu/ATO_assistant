"""Run with: python -m unittest tests.test_upload_limits -v (in asset-studio)."""
from __future__ import annotations

import asyncio
import json
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, FastAPI, File, Request, UploadFile

from app import main
from app.db import Database
from app.upload_limits import UploadLimitMiddleware


class UploadLimitTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now = 100.0
        self.app = FastAPI()
        self.started = asyncio.Queue()
        self.release = asyncio.Event()
        self.hold = False
        self.fail = False
        self.background = False
        self.background_started = asyncio.Event()
        self.background_release = asyncio.Event()
        self.token = main.make_token()

        async def work(request: Request, background_tasks: BackgroundTasks):
            await self.started.put(request.url.path)
            if self.hold:
                await self.release.wait()
            if self.fail:
                raise RuntimeError('processing failed')
            await request.body()
            if self.background:
                async def job():
                    self.background_started.set()
                    await self.background_release.wait()
                background_tasks.add_task(job)
            return {'ok': True}

        for (method, path) in main.UPLOAD_BODY_LIMITS:
            self.app.add_api_route(path, work, methods=[method])

        @self.app.post('/form')
        async def form(file: UploadFile = File(...)):
            return {'bytes': file.size}

        @self.app.get('/api/catalog')
        async def catalog():
            return {'ok': True}

        limits = {**main.UPLOAD_BODY_LIMITS, ('POST', '/form'): 2048}
        self.limiter = UploadLimitMiddleware(
            self.app, require_auth=main.require_auth, body_limits=limits,
            clock=lambda: self.now,
        )

    async def request(self, method='POST', path='/api/assets/upload', *,
                      ip='192.168.1.20', cookie=None, body=b'x', declared=None,
                      content_type='application/octet-stream', middleware=None,
                      packets=None):
        headers = [(b'host', b'testserver'), (b'content-type', content_type.encode())]
        if declared is not None:
            headers.append((b'content-length', str(declared).encode()))
        if cookie is None:
            cookie = self.token
        if cookie:
            headers.append((b'cookie', ('ato_session=' + cookie).encode()))
        url, _, query = path.partition('?')
        scope = {
            'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
            'method': method, 'scheme': 'http', 'path': url, 'raw_path': url.encode(),
            'query_string': query.encode(), 'headers': headers, 'client': (ip, 1234),
            'server': ('testserver', 80),
        }
        messages = iter(packets if packets is not None else [body])
        reads = []
        responses = []
        async def receive():
            try:
                packet = next(messages)
            except StopIteration:
                return {'type': 'http.disconnect'}
            reads.append(len(packet))
            return {'type': 'http.request', 'body': packet, 'more_body': packets is not None}
        async def send(message):
            responses.append(message)
        await (middleware or self.limiter)(scope, receive, send)
        start = next(m for m in responses if m['type'] == 'http.response.start')
        return start['status'], reads, dict(start['headers'])

    async def hold_two(self, **kwargs):
        self.hold = True
        tasks = [asyncio.create_task(self.request(**kwargs)) for _ in range(2)]
        for _ in tasks:
            await asyncio.wait_for(self.started.get(), 3)
        return tasks

    async def finish(self, tasks):
        self.release.set()
        results = await asyncio.gather(*tasks)
        self.assertTrue(all(result[0] == 200 for result in results))
        self.assertEqual({}, self.limiter._active)
        self.assertEqual(0, self.limiter._total_active)

    async def test_third_multipart_upload_rejected_without_reading_or_spooling(self):
        tasks = await self.hold_two()
        with patch('starlette.formparsers.SpooledTemporaryFile') as spool:
            result = await self.request(body=b'file' * 1000, content_type='multipart/form-data; boundary=x')
        self.assertEqual((429, []), result[:2])
        self.assertEqual(b'1', result[2][b'retry-after'])
        spool.assert_not_called()
        await self.finish(tasks)

    async def test_all_real_upload_routes_share_limit(self):
        tasks = await self.hold_two()
        # Exercise the real application's router, not just synthetic handlers.
        real = UploadLimitMiddleware(main.app, require_auth=main.require_auth,
                                     body_limits=main.UPLOAD_BODY_LIMITS)
        real._active = self.limiter._active
        real._total_active = self.limiter._total_active
        paths = [
            ('POST', '/api/assets/upload'), ('POST', '/api/uploads/start'),
            ('PUT', '/api/uploads/example'), ('POST', '/api/uploads/example/finish'),
            ('POST', '/api/batch/upload'), ('POST', '/api/packages/inspect'),
            ('POST', '/api/stories/import'), ('POST', '/api/packages/import'),
        ]
        for method, path in paths:
            with self.subTest(path=path):
                self.assertEqual((429, []), (await self.request(method, path, middleware=real))[:2])
        await self.finish(tasks)

    async def test_chunks_are_limited_for_entire_transfer(self):
        tasks = await self.hold_two(method='PUT', path='/api/uploads/first')
        self.assertEqual((429, []), (await self.request('PUT', '/api/uploads/third'))[:2])
        await self.finish(tasks)

    async def test_cookie_rotation_does_not_change_client_bucket(self):
        tasks = await self.hold_two(ip='127.0.0.1', cookie='invalid-a')
        for cookie in ['invalid-b', '', main.make_token(3600)]:
            with self.subTest(cookie=bool(cookie)):
                self.assertEqual((429, []), (await self.request(ip='127.0.0.1', cookie=cookie))[:2])
        await self.finish(tasks)

    async def test_unauthenticated_remote_upload_rejected_before_read(self):
        self.assertEqual((401, []), (await self.request(cookie='invalid'))[:2])
        self.assertEqual({}, self.limiter._active)
        self.assertEqual({}, self.limiter._starts)

    async def test_untrusted_local_host_or_origin_rejected_before_read(self):
        # The existing auth policy remains responsible for Host/Origin validation.
        with patch.object(main, 'trusted_host', return_value=False):
            self.assertEqual((403, []), (await self.request(ip='127.0.0.1', cookie=''))[:2])
        with patch.object(main, 'trusted_origin', return_value=False):
            self.assertEqual((403, []), (await self.request(ip='127.0.0.1', cookie=''))[:2])

    async def test_global_limit_caps_multiple_ips(self):
        self.limiter.total = 3
        self.hold = True
        tasks = []
        for ip in ['192.168.1.21', '192.168.1.22', '192.168.1.23']:
            tasks.append(asyncio.create_task(self.request(ip=ip)))
            await asyncio.wait_for(self.started.get(), 3)
        self.assertEqual((429, []), (await self.request(ip='192.168.1.24'))[:2])
        await self.finish(tasks)

    async def test_sequential_upload_start_rate_expires(self):
        self.limiter.starts_per_minute = 2
        for _ in range(2):
            self.assertEqual(200, (await self.request())[0])
        self.assertEqual((429, []), (await self.request())[:2])
        self.now += 60
        self.assertEqual(200, (await self.request())[0])

    async def test_global_start_rate_and_state_are_bounded(self):
        self.limiter.total_starts_per_minute = 3
        for i in range(3):
            self.assertEqual(200, (await self.request(ip=f'192.168.1.{i}'))[0])
        for i in range(3, 20):
            self.assertEqual((429, []), (await self.request(ip=f'192.168.1.{i}'))[:2])
        self.assertEqual(3, len(self.limiter._starts))
        self.now += 60
        self.assertEqual(200, (await self.request(ip='192.168.1.99'))[0])
        self.assertEqual(['192.168.1.99'], list(self.limiter._starts))

    async def test_chunk_and_finish_requests_do_not_spend_start_rate(self):
        self.limiter.starts_per_minute = 1
        self.assertEqual(200, (await self.request(path='/api/uploads/start'))[0])
        for _ in range(130):
            self.assertEqual(200, (await self.request('PUT', '/api/uploads/example'))[0])
        self.assertEqual(200, (await self.request(path='/api/uploads/example/finish'))[0])
        self.assertEqual(429, (await self.request(path='/api/uploads/start'))[0])

    async def test_declared_body_limit_rejects_before_read(self):
        for size in [main.CHUNK_LIMIT + 1, -1, 'invalid']:
            with self.subTest(size=size):
                expected = 413 if isinstance(size, int) and size > 0 else 400
                self.assertEqual((expected, []), (await self.request('PUT', '/api/uploads/example', declared=size))[:2])
        self.assertEqual({}, self.limiter._active)

    async def test_streamed_body_limit_ignores_missing_or_false_length(self):
        self.limiter.body_limits[('PUT', '/api/uploads/{upload_id}')] = 4
        for declared in [None, 1]:
            with self.subTest(declared=declared):
                result = await self.request('PUT', '/api/uploads/example', declared=declared, packets=[b'ab', b'cde'])
                self.assertEqual((413, [2, 3]), result[:2])
                self.assertEqual({}, self.limiter._active)

    async def test_exact_body_limit_and_multipart_still_work(self):
        self.limiter.body_limits[('PUT', '/api/uploads/{upload_id}')] = 4
        self.assertEqual(200, (await self.request('PUT', '/api/uploads/example', body=b'abcd', declared=4))[0])
        body = b'--x\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\nabc\r\n--x--\r\n'
        self.assertEqual(200, (await self.request(path='/form', body=body, content_type='multipart/form-data; boundary=x'))[0])

    async def test_exception_releases_slot(self):
        self.fail = True
        with self.assertRaisesRegex(RuntimeError, 'processing failed'):
            await self.request()
        self.assertEqual({}, self.limiter._active)
        self.assertEqual(0, self.limiter._total_active)
        self.fail = False
        self.assertEqual(200, (await self.request())[0])

    async def test_cancellation_releases_slot(self):
        self.hold = True
        task = asyncio.create_task(self.request())
        await asyncio.wait_for(self.started.get(), 3)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual({}, self.limiter._active)
        self.assertEqual(0, self.limiter._total_active)

    async def test_background_processing_retains_slot(self):
        self.limiter.per_client = 1
        self.background = True
        task = asyncio.create_task(self.request(path='/api/packages/inspect'))
        await asyncio.wait_for(self.background_started.wait(), 3)
        self.assertEqual((429, []), (await self.request())[:2])
        self.background_release.set()
        self.assertEqual(200, (await task)[0])
        self.assertEqual({}, self.limiter._active)

    async def test_non_upload_routes_are_available_when_slots_full(self):
        tasks = await self.hold_two()
        self.assertEqual(200, (await self.request('GET', '/api/catalog'))[0])
        await self.finish(tasks)

    async def test_trailing_slash_cannot_bypass_limit(self):
        tasks = await self.hold_two()
        self.assertEqual((429, []), (await self.request(path='/api/batch/upload/'))[:2])
        await self.finish(tasks)

    async def test_real_app_can_start_resume_transfer_and_finish_upload(self):
        parent = (Path(main.PROJECT_DIR) / '.local/tests').resolve()
        scratch = parent / ('upload-limit-' + uuid.uuid4().hex)
        scratch.mkdir(parents=True)
        (scratch / 'tmp').mkdir()
        db = Database(scratch / 'library.sqlite3')
        payload = {'item_id': 'test', 'face': 'front', 'original_name': 'test.png', 'total_size': 4}
        try:
            with patch.object(main, 'library_and_db', return_value=(scratch, db)), patch.object(main, 'store_image', return_value={'ok': True}) as store:
                for _ in range(2):
                    self.assertEqual(200, (await self.request(path='/api/uploads/start', body=json.dumps(payload).encode(), content_type='application/json', middleware=main.app))[0])
                sessions = db.all('SELECT * FROM upload_sessions')
                self.assertEqual(1, len(sessions))
                session = sessions[0]
                path = '/api/uploads/' + session['id']
                self.assertEqual(200, (await self.request('PUT', path + '?offset=0', body=b'ab', middleware=main.app))[0])
                self.assertEqual(200, (await self.request('PUT', path + '?offset=2', body=b'cd', middleware=main.app))[0])
                self.assertEqual(b'abcd', (scratch / session['stored_path']).read_bytes())
                self.assertEqual(200, (await self.request(path=path + '/finish', body=b'{}', content_type='application/json', middleware=main.app))[0])
                store.assert_called_once()
                self.assertEqual('complete', db.one('SELECT status FROM upload_sessions')['status'])
        finally:
            self.assertEqual(parent, scratch.resolve().parent)
            shutil.rmtree(scratch)


if __name__ == '__main__':
    unittest.main()
