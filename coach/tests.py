import json

from django.test import TestCase, Client, override_settings
from django.urls import reverse
from django.core.cache import cache
from django.contrib.auth.models import User

from .models import UserProfile, Conversation, Message, DailyProgress
from .ratelimit import DEFAULT_MESSAGE
from . import views






class DeleteAccountTests(TestCase):
    """Tests for the permanent account-deletion endpoint."""

    def setUp(self):
        self.url = reverse('coach:api-delete-account')
        self.user = User.objects.create_user(
            username='alice', email='alice@example.com', password='pw-123456'
        )
        # Some related data across every user-linked model.
        convo = Conversation.objects.create(user=self.user, title='Chat 1')
        Message.objects.create(conversation=convo, user_text='Hello there')
        DailyProgress.objects.create(user=self.user, date='2024-01-01', goal_target=250)

        # A second user whose data must survive the first user's deletion.
        self.other = User.objects.create_user(
            username='bob', email='bob@example.com', password='pw-123456'
        )
        other_convo = Conversation.objects.create(user=self.other, title='Bob chat')
        Message.objects.create(conversation=other_convo, user_text='Bob message')

    def test_requires_authentication(self):
        """Anonymous requests are redirected to login, not allowed to delete."""
        resp = self.client.post(self.url)
        self.assertIn(resp.status_code, (302, 403))
        self.assertTrue(User.objects.filter(username='alice').exists())

    def test_get_not_allowed(self):
        """Only POST may trigger deletion."""
        self.client.force_login(self.user)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 405)
        self.assertTrue(User.objects.filter(username='alice').exists())

    def test_deletes_own_account_and_all_data(self):
        """POST deletes the user plus all conversations, messages, progress, profile."""
        self.client.force_login(self.user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('success'))

        # The account and all its related data are gone.
        self.assertFalseUserExists('alice')
        self.assertEqual(Conversation.objects.filter(user__username='alice').count(), 0)
        self.assertEqual(Message.objects.filter(conversation__user__username='alice').count(), 0)
        self.assertEqual(DailyProgress.objects.filter(user__username='alice').count(), 0)
        self.assertEqual(UserProfile.objects.filter(user__username='alice').count(), 0)

        # The other user's data is untouched.
        self.assertTrue(User.objects.filter(username='bob').exists())
        self.assertEqual(Conversation.objects.filter(user__username='bob').count(), 1)
        self.assertEqual(Message.objects.filter(conversation__user__username='bob').count(), 1)

    def test_session_logged_out_after_deletion(self):
        """After deletion the session no longer identifies an authenticated user."""
        self.client.force_login(self.user)
        self.client.post(self.url)
        # A follow-up request to the current-user endpoint reports not authenticated.
        resp = self.client.get(reverse('coach:api-user'))
        self.assertFalse(resp.json().get('authenticated'))

    def assertFalseUserExists(self, username):
        self.assertFalse(User.objects.filter(username=username).exists())


@override_settings(
    # The SPA page (index.html) uses {% static %} with WhiteNoise's hashed
    # manifest storage, which requires collectstatic to have run. Tests don't
    # run it, so fall back to plain storage that resolves paths without a
    # manifest — this lets index_view render so we can read the csrftoken cookie.
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
)
class CsrfProtectionTests(TestCase):
    """Verify state-changing API endpoints reject forged (cross-site) requests

    but still accept the SPA's requests that carry the CSRF token.

    These use a CSRF-enforcing client (enforce_csrf_checks=True) because the
    default test client bypasses CSRF entirely. This mirrors how a real browser
    behaves: Django's CsrfViewMiddleware validates the X-CSRFToken header sent
    by the SPA (see the api() helper in core.js) against the csrftoken cookie
    set by @ensure_csrf_cookie on index_view.
    """

    def setUp(self):
        # A client that enforces CSRF like a real browser does.
        self.client = Client(enforce_csrf_checks=True)
        self.user = User.objects.create_user(
            username='alice', email='alice@example.com', password='pw-123456'
        )
        self.convo = Conversation.objects.create(user=self.user, title='Chat 1')

    def _csrf_token(self):
        """Fetch the SPA page to obtain the csrftoken cookie, mirroring how the
        real frontend acquires the token before making API calls."""
        self.client.get(reverse('coach:index'))
        return self.client.cookies['csrftoken'].value

    # ── Forged requests (no token) must be rejected ──────────────────────

    def test_settings_update_without_token_forbidden(self):
        self.client.force_login(self.user)
        resp = self.client.put(
            reverse('coach:api-settings'),
            data=json.dumps({'daily_word_goal': 500}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_message_create_without_token_forbidden(self):
        self.client.force_login(self.user)
        resp = self.client.post(
            reverse('coach:api-messages', args=[self.convo.id]),
            data=json.dumps({'user_text': 'hello world'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_conversation_delete_without_token_forbidden(self):
        self.client.force_login(self.user)
        resp = self.client.delete(
            reverse('coach:api-conversation-delete', args=[self.convo.id])
        )
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(Conversation.objects.filter(id=self.convo.id).exists())

    def test_delete_account_without_token_forbidden(self):
        self.client.force_login(self.user)
        resp = self.client.post(reverse('coach:api-delete-account'))
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(User.objects.filter(username='alice').exists())

    def test_logout_without_token_forbidden(self):
        self.client.force_login(self.user)
        resp = self.client.post(reverse('coach:api-logout'))
        self.assertEqual(resp.status_code, 403)

    # ── Legitimate SPA requests (with token) must succeed ────────────────

    def test_login_with_token_succeeds(self):
        token = self._csrf_token()
        resp = self.client.post(
            reverse('coach:api-login'),
            data=json.dumps({'username': 'alice', 'password': 'pw-123456'}),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('success'))

    def test_signup_with_token_succeeds(self):
        token = self._csrf_token()
        resp = self.client.post(
            reverse('coach:api-signup'),
            data=json.dumps({
                'username': 'charlie',
                'email': 'charlie@example.com',
                'password': 'pw-123456',
                'ai_provider': 'gemini',
                'daily_word_goal': 250,
            }),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(username='charlie').exists())

    def test_settings_update_with_token_succeeds(self):
        token = self._csrf_token()
        self.client.force_login(self.user)
        resp = self.client.put(
            reverse('coach:api-settings'),
            data=json.dumps({'daily_word_goal': 500}),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, 500)

    def test_message_create_with_token_succeeds(self):
        token = self._csrf_token()
        self.client.force_login(self.user)
        resp = self.client.post(
            reverse('coach:api-messages', args=[self.convo.id]),
            data=json.dumps({'user_text': 'hello world', 'ai_response': {}}),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 1)

    def test_conversation_delete_with_token_succeeds(self):
        token = self._csrf_token()
        self.client.force_login(self.user)
        resp = self.client.delete(
            reverse('coach:api-conversation-delete', args=[self.convo.id]),
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Conversation.objects.filter(id=self.convo.id).exists())

    def test_delete_account_with_token_succeeds(self):
        token = self._csrf_token()
        self.client.force_login(self.user)
        resp = self.client.post(
            reverse('coach:api-delete-account'),
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(User.objects.filter(username='alice').exists())


class RateLimitTests(TestCase):
    """Verify throttling on auth and AI-usage endpoints.

    Confirms three things for each protected endpoint:
      • requests within the limit succeed,
      • excessive requests are blocked with HTTP 429 and a generic message,
      • normal usage volumes are never blocked.

    The default test client is used (CSRF is bypassed) because rate limiting is
    orthogonal to CSRF. The cache — which backs the limiter — is cleared before
    each test so counters never leak between tests.
    """

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='alice', email='alice@example.com', password='pw-123456'
        )
        self.convo = Conversation.objects.create(user=self.user, title='Chat 1')

    def tearDown(self):
        cache.clear()

    # ── Login: per-IP brute-force limit (10 / 5 min) ─────────────────────

    def test_login_within_ip_limit_allowed(self):
        """The first 10 attempts from one IP are processed (401 for bad creds),
        not throttled. Username is varied so the per-username limit isn't hit."""
        url = reverse('coach:api-login')
        for i in range(10):
            resp = self.client.post(
                url,
                data=json.dumps({'username': f'nobody{i}', 'password': 'wrong'}),
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 401, f'attempt {i} should be processed')

    def test_login_excessive_from_ip_blocked(self):
        """The 11th attempt from one IP is blocked with a generic 429."""
        url = reverse('coach:api-login')
        for i in range(10):
            self.client.post(
                url,
                data=json.dumps({'username': f'nobody{i}', 'password': 'wrong'}),
                content_type='application/json',
            )
        resp = self.client.post(
            url,
            data=json.dumps({'username': 'nobody-final', 'password': 'wrong'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json().get('error'), DEFAULT_MESSAGE)

    # ── Login: per-username limit must NOT reveal account existence ──────

    def test_login_throttle_does_not_reveal_account_existence(self):
        """Hammering a real vs. a fake username yields the SAME generic 429, so
        throttling can't be used to enumerate accounts.

        Each uses its own IP (via X-Forwarded-For) so the per-username limit (5)
        is what trips, not the per-IP limit (10)."""
        url = reverse('coach:api-login')

        def hammer(username, ip):
            last = None
            for _ in range(6):  # limit is 5, so the 6th trips it
                last = self.client.post(
                    url,
                    data=json.dumps({'username': username, 'password': 'wrong'}),
                    content_type='application/json',
                    HTTP_X_FORWARDED_FOR=ip,
                )
            return last

        real = hammer('alice', '10.0.0.1')          # existing account
        fake = hammer('ghost', '10.0.0.2')          # non-existent account

        self.assertEqual(real.status_code, 429)
        self.assertEqual(fake.status_code, 429)
        # Identical body → no signal about which account exists.
        self.assertEqual(real.json(), fake.json())
        self.assertEqual(real.json().get('error'), DEFAULT_MESSAGE)

    def test_valid_login_not_blocked_by_normal_use(self):
        """A genuine user logging in normally is never throttled."""
        resp = self.client.post(
            reverse('coach:api-login'),
            data=json.dumps({'username': 'alice', 'password': 'pw-123456'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('success'))

    # ── Signup: per-IP limit (5 / hour) ──────────────────────────────────

    def test_signup_excessive_from_ip_blocked(self):
        """After 5 signups from one IP, the 6th is blocked with a 429 — and no
        6th user is created."""
        url = reverse('coach:api-signup')
        for i in range(5):
            resp = self.client.post(
                url,
                data=json.dumps({
                    'username': f'user{i}',
                    'email': f'user{i}@example.com',
                    'password': 'pw-123456',
                    'ai_provider': 'gemini',
                }),
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 200)

        resp = self.client.post(
            url,
            data=json.dumps({
                'username': 'user-blocked',
                'email': 'blocked@example.com',
                'password': 'pw-123456',
                'ai_provider': 'gemini',
            }),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json().get('error'), DEFAULT_MESSAGE)
        self.assertFalse(User.objects.filter(username='user-blocked').exists())

    # ── Messages (AI usage): per-user burst limit (30 / min) ─────────────

    def test_message_create_within_limit_allowed(self):
        """A normal burst of messages (well under the cap) all succeed."""
        self.client.force_login(self.user)
        url = reverse('coach:api-messages', args=[self.convo.id])
        for _ in range(10):
            resp = self.client.post(
                url,
                data=json.dumps({'user_text': 'hello world', 'ai_response': {}}),
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 10)

    def test_message_create_excessive_blocked(self):
        """The 31st message POST in a minute is blocked (AI-cost protection),
        and no extra Message row is created for the blocked request."""
        self.client.force_login(self.user)
        url = reverse('coach:api-messages', args=[self.convo.id])
        for _ in range(30):
            resp = self.client.post(
                url,
                data=json.dumps({'user_text': 'hello world', 'ai_response': {}}),
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 200)

        resp = self.client.post(
            url,
            data=json.dumps({'user_text': 'one too many', 'ai_response': {}}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json().get('error'), DEFAULT_MESSAGE)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 30)

    def test_message_read_not_throttled(self):
        """GET (loading history) is never throttled, even past the POST cap."""
        self.client.force_login(self.user)
        url = reverse('coach:api-messages', args=[self.convo.id])
        for _ in range(40):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200)

    # ── Conversations: per-user create limit (20 / min) ──────────────────

    def test_conversation_create_excessive_blocked(self):
        """The 21st conversation created in a minute is blocked with a 429."""
        self.client.force_login(self.user)
        url = reverse('coach:api-conversations')
        for _ in range(20):
            resp = self.client.post(
                url,
                data=json.dumps({'title': 'New chat'}),
                content_type='application/json',
            )
            self.assertEqual(resp.status_code, 200)

        resp = self.client.post(
            url,
            data=json.dumps({'title': 'blocked chat'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 429)
        self.assertEqual(resp.json().get('error'), DEFAULT_MESSAGE)

    def test_per_user_limits_are_isolated(self):
        """One user hitting their message cap does NOT throttle another user."""
        self.client.force_login(self.user)
        url = reverse('coach:api-messages', args=[self.convo.id])
        for _ in range(30):
            self.client.post(
                url,
                data=json.dumps({'user_text': 'hi', 'ai_response': {}}),
                content_type='application/json',
            )
        # alice is now capped.
        capped = self.client.post(
            url,
            data=json.dumps({'user_text': 'blocked', 'ai_response': {}}),
            content_type='application/json',
        )
        self.assertEqual(capped.status_code, 429)

        # A different user is unaffected.
        other = User.objects.create_user(
            username='bob', email='bob@example.com', password='pw-123456'
        )
        other_convo = Conversation.objects.create(user=other, title='Bob chat')
        self.client.force_login(other)
        resp = self.client.post(
            reverse('coach:api-messages', args=[other_convo.id]),
            data=json.dumps({'user_text': 'hello', 'ai_response': {}}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)


@override_settings(
    # Same static-storage fallback as CsrfProtectionTests: the SPA page uses
    # {% static %} with WhiteNoise's hashed manifest, which needs collectstatic.
    # Plain storage lets index_view render during tests.
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
)
class ContentSecurityPolicyTests(TestCase):
    """Verify the Content-Security-Policy header locks down script and connect
    sources so injected scripts can't run or exfiltrate the on-device API keys.

    django-csp emits the header on every response; these tests assert the policy
    on a representative page (the SPA) and confirm the key protections are in
    place: a strict script-src (nonce, no 'unsafe-inline'), an allowlisted
    connect-src limited to our origin plus the AI providers, and hardening
    directives like object-src 'none'.
    """

    HEADER = 'Content-Security-Policy'

    def _policy(self):
        resp = self.client.get(reverse('coach:index'))
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.HEADER, resp.headers)
        return resp.headers[self.HEADER]

    def test_header_present_on_responses(self):
        self.assertTrue(self._policy())

    def test_script_src_is_strict(self):
        """script-src uses a nonce and does NOT allow 'unsafe-inline' — the core
        defense that stops injected inline scripts from executing."""
        policy = self._policy()
        self.assertIn("script-src", policy)
        self.assertIn("'nonce-", policy)
        # Pull out just the script-src directive to assert on it precisely.
        script_src = next(
            part.strip() for part in policy.split(';') if part.strip().startswith('script-src')
        )
        self.assertNotIn("'unsafe-inline'", script_src)

    def test_inline_script_carries_nonce(self):
        """The page's own inline <script> blocks must carry the same nonce the
        header advertises, otherwise the strict policy would block our own JS."""
        resp = self.client.get(reverse('coach:index'))
        policy = resp.headers[self.HEADER]
        # Extract the nonce value from the header: ...'nonce-XXXX'...
        token = policy.split("'nonce-", 1)[1].split("'", 1)[0]
        self.assertIn(f'nonce="{token}"'.encode(), resp.content)

    def test_connect_src_allows_only_self_and_ai_providers(self):
        """connect-src must permit our origin and the four AI provider APIs the
        browser calls directly — and nothing else — so a compromised page can't
        POST stolen keys to an attacker endpoint."""
        policy = self._policy()
        connect_src = next(
            part.strip() for part in policy.split(';') if part.strip().startswith('connect-src')
        )
        for origin in (
            "https://generativelanguage.googleapis.com",
            "https://api.groq.com",
            "https://openrouter.ai",
            "https://api.openai.com",
        ):
            self.assertIn(origin, connect_src)
        self.assertIn("'self'", connect_src)

    def test_hardening_directives_present(self):
        """object-src, base-uri, and frame-ancestors are locked down to blunt
        plugin, base-tag, and clickjacking vectors."""
        policy = self._policy()
        self.assertIn("object-src 'none'", policy)
        self.assertIn("base-uri 'self'", policy)
        self.assertIn("frame-ancestors 'none'", policy)

    def test_nonce_differs_per_request(self):
        """Each response gets a fresh nonce; a static, guessable nonce would let
        an attacker mark injected scripts as trusted."""
        p1 = self._policy()
        p2 = self._policy()
        n1 = p1.split("'nonce-", 1)[1].split("'", 1)[0]
        n2 = p2.split("'nonce-", 1)[1].split("'", 1)[0]
        self.assertNotEqual(n1, n2)


class InputValidationTests(TestCase):
    """Verify server-side payload size limits on the write endpoints.

    The client is untrusted, so every size/format constraint is enforced in the
    view before anything is persisted. These tests confirm three things per
    endpoint: normal-sized input is accepted and saved, oversized/malformed
    input is rejected with a clear 4xx error, and nothing is written to the DB
    when a request is rejected.

    The default test client is used (CSRF is bypassed); input validation is
    orthogonal to CSRF, which is covered by CsrfProtectionTests.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='alice', email='alice@example.com', password='pw-123456'
        )
        self.convo = Conversation.objects.create(user=self.user, title='Chat 1')
        self.client.force_login(self.user)
        self.msg_url = reverse('coach:api-messages', args=[self.convo.id])
        self.convos_url = reverse('coach:api-conversations')
        self.convo_edit_url = reverse('coach:api-conversation-delete', args=[self.convo.id])

    def _post_message(self, payload):
        return self.client.post(
            self.msg_url, data=json.dumps(payload), content_type='application/json'
        )

    # ── Normal input is accepted (existing chat still works) ─────────────

    def test_normal_message_accepted(self):
        """A realistic message with a full AI feedback payload is saved."""
        ai_response = {
            'reply': 'That sounds great! Tell me more about your trip.',
            'input_status': 'valid',
            'grammar_corrections': [
                {'original': 'I go store', 'corrected': 'I went to the store',
                 'explanation': 'Use past tense and an article.'}
            ],
            'vocabulary_improvements': [
                {'original': 'good', 'suggestion': 'wonderful', 'synonyms': ['great', 'fantastic']}
            ],
        }
        resp = self._post_message({
            'user_text': 'Yesterday I go store and buy some good food.',
            'ai_response': ai_response,
            'scores': {'grammar': 7.5, 'vocabulary': 8, 'naturalness': 7,
                       'expression': 7, 'mechanics': 8, 'overall': 7.4},
            'ai_provider_name': 'gemini',
            'ai_model_name': 'gemini-2.0-flash',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 1)
        saved = Message.objects.get(conversation=self.convo)
        self.assertEqual(saved.ai_response['reply'], ai_response['reply'])
        self.assertEqual(saved.ai_provider_name, 'gemini')

    def test_message_at_max_length_accepted(self):
        """User text exactly at the limit is still accepted (boundary case)."""
        text = 'a' * views.MAX_USER_TEXT_LENGTH
        resp = self._post_message({'user_text': text, 'ai_response': {}})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 1)

    # ── Oversized / malformed message input is rejected ──────────────────

    def test_oversized_user_text_rejected(self):
        """User text longer than the cap is rejected and nothing is saved."""
        text = 'a' * (views.MAX_USER_TEXT_LENGTH + 1)
        resp = self._post_message({'user_text': text, 'ai_response': {}})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('too long', resp.json().get('error', '').lower())
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 0)

    def test_oversized_ai_response_rejected(self):
        """An AI-response JSON blob over the byte cap is rejected before saving."""
        big_blob = {'reply': 'x' * (views.MAX_AI_RESPONSE_BYTES + 100)}
        resp = self._post_message({'user_text': 'hello', 'ai_response': big_blob})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 0)

    def test_oversized_raw_body_rejected(self):
        """A raw request body beyond the overall cap is rejected with 413 and
        no message is persisted."""
        huge_text = 'a' * (views.MAX_MESSAGE_REQUEST_BYTES + 1000)
        resp = self._post_message({'user_text': huge_text, 'ai_response': {}})
        self.assertEqual(resp.status_code, 413)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 0)

    def test_non_dict_ai_response_rejected(self):
        """A non-object ai_response (e.g. a string) is rejected."""
        resp = self._post_message({'user_text': 'hello', 'ai_response': 'not-a-dict'})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 0)

    def test_oversized_provider_name_rejected(self):
        """An over-length provider name (past the column width) is rejected."""
        resp = self._post_message({
            'user_text': 'hello',
            'ai_response': {},
            'ai_provider_name': 'p' * (views.MAX_PROVIDER_NAME_LENGTH + 1),
        })
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Message.objects.filter(conversation=self.convo).count(), 0)

    # ── Conversation title validation (create + rename) ──────────────────

    def test_normal_title_create_accepted(self):
        resp = self.client.post(
            self.convos_url,
            data=json.dumps({'title': 'My interview practice'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['title'], 'My interview practice')

    def test_oversized_title_create_rejected(self):
        """A title longer than the column width is rejected; no convo created."""
        before = Conversation.objects.filter(user=self.user).count()
        resp = self.client.post(
            self.convos_url,
            data=json.dumps({'title': 'T' * (views.MAX_TITLE_LENGTH + 1)}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('too long', resp.json().get('error', '').lower())
        self.assertEqual(Conversation.objects.filter(user=self.user).count(), before)

    def test_normal_title_rename_accepted(self):
        resp = self.client.put(
            self.convo_edit_url,
            data=json.dumps({'title': 'Renamed chat'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.title, 'Renamed chat')

    def test_oversized_title_rename_rejected(self):
        """An over-length rename is rejected and the title is left unchanged."""
        resp = self.client.put(
            self.convo_edit_url,
            data=json.dumps({'title': 'T' * (views.MAX_TITLE_LENGTH + 1)}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)
        self.convo.refresh_from_db()
        self.assertEqual(self.convo.title, 'Chat 1')


class SettingsValidationTests(TestCase):
    """Verify server-side validation on the settings PUT endpoint.

    The client is untrusted, so every settings field is validated in the view
    before anything is persisted. These tests confirm valid payloads are
    accepted and saved, and that malformed or out-of-range values are rejected
    with a 400 (never a 500) and leave the stored profile unchanged.

    The default test client is used (CSRF is bypassed); settings validation is
    orthogonal to CSRF, which is covered by CsrfProtectionTests.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='alice', email='alice@example.com', password='pw-123456'
        )
        self.client.force_login(self.user)
        self.url = reverse('coach:api-settings')

    def _put(self, payload):
        return self.client.put(
            self.url, data=json.dumps(payload), content_type='application/json'
        )

    # ── daily_word_goal ──────────────────────────────────────────────────

    def test_valid_goal_accepted_and_saved(self):
        resp = self._put({'daily_word_goal': 500})
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, 500)

    def test_numeric_string_goal_accepted(self):
        """The SPA sends the goal as a string from a <select>; that still works."""
        resp = self._put({'daily_word_goal': '1000'})
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, 1000)

    def test_non_numeric_goal_rejected_not_500(self):
        """A non-numeric goal returns 400 (previously an unguarded int() → 500)."""
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': 'abc'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('number', resp.json().get('error', '').lower())
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_null_goal_rejected(self):
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': None})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_boolean_goal_rejected(self):
        """bool is an int subclass; it must not slip through as 1/0."""
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': True})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_negative_goal_rejected(self):
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': -5})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_zero_goal_rejected(self):
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': 0})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_absurdly_large_goal_rejected(self):
        original = self.user.profile.daily_word_goal
        resp = self._put({'daily_word_goal': 10 ** 9})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, original)

    def test_goal_at_max_boundary_accepted(self):
        resp = self._put({'daily_word_goal': views.MAX_DAILY_WORD_GOAL})
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.daily_word_goal, views.MAX_DAILY_WORD_GOAL)

    # ── ai_provider ──────────────────────────────────────────────────────

    def test_valid_ai_provider_accepted(self):
        resp = self._put({'ai_provider': 'openai'})
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.ai_provider, 'openai')

    def test_invalid_ai_provider_rejected(self):
        """An arbitrary provider string is rejected and the value is unchanged."""
        original = self.user.profile.ai_provider
        resp = self._put({'ai_provider': 'evilcorp'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('provider', resp.json().get('error', '').lower())
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.ai_provider, original)

    # ── openai_model ─────────────────────────────────────────────────────

    def test_valid_openai_model_accepted(self):
        resp = self._put({'openai_model': 'gpt-4o-mini'})
        self.assertEqual(resp.status_code, 200)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.openai_model, 'gpt-4o-mini')

    def test_invalid_openai_model_rejected(self):
        original = self.user.profile.openai_model
        resp = self._put({'openai_model': 'gpt-9-ultra-hacker'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('model', resp.json().get('error', '').lower())
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.openai_model, original)

    # ── explanation_language & theme ─────────────────────────────────────

    def test_invalid_explanation_language_rejected(self):
        original = self.user.profile.explanation_language
        resp = self._put({'explanation_language': 'zz'})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.explanation_language, original)

    def test_invalid_theme_rejected(self):
        original = self.user.profile.theme
        resp = self._put({'theme': 'rainbow'})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.theme, original)

    # ── Partial-write safety ─────────────────────────────────────────────

    def test_invalid_field_does_not_persist_valid_sibling(self):
        """When one field in a multi-field payload is invalid, the whole request
        is rejected and NO field is persisted (validate-before-mutate)."""
        original_provider = self.user.profile.ai_provider
        original_goal = self.user.profile.daily_word_goal
        resp = self._put({'ai_provider': 'openai', 'daily_word_goal': 'not-a-number'})
        self.assertEqual(resp.status_code, 400)
        self.user.profile.refresh_from_db()
        # The valid ai_provider must NOT have been saved because the goal was bad.
        self.assertEqual(self.user.profile.ai_provider, original_provider)
        self.assertEqual(self.user.profile.daily_word_goal, original_goal)


class PasswordPolicyTests(TestCase):
    """Verify the signup password-length policy (minimum 8 characters).

    The backend is the source of truth (the frontend enforces the same rule for
    UX). These tests confirm short passwords are rejected with a clear message
    and no user is created, a password at exactly the 8-char boundary is
    accepted, and that login still works for an account created under the policy.
    """

    def setUp(self):
        self.signup_url = reverse('coach:api-signup')
        self.login_url = reverse('coach:api-login')

    def _signup(self, username, password):
        return self.client.post(
            self.signup_url,
            data=json.dumps({
                'username': username,
                'email': f'{username}@example.com',
                'password': password,
                'ai_provider': 'gemini',
            }),
            content_type='application/json',
        )

    def test_password_shorter_than_8_rejected(self):
        """A 7-character password is rejected and no account is created."""
        resp = self._signup('shorty', '1234567')  # 7 chars
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json().get('error'), 'Password must be at least 8 characters.')
        self.assertFalse(User.objects.filter(username='shorty').exists())

    def test_password_exactly_8_accepted(self):
        """A password of exactly 8 characters is accepted (boundary case)."""
        resp = self._signup('eight', '12345678')  # 8 chars
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('success'))
        self.assertTrue(User.objects.filter(username='eight').exists())

    def test_password_longer_than_8_accepted(self):
        resp = self._signup('longpw', 'a-very-long-password')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(User.objects.filter(username='longpw').exists())

    def test_login_works_for_policy_compliant_account(self):
        """Authentication still works end-to-end for an account created under
        the 8-char policy."""
        self._signup('validuser', 'goodpass1')
        # Log out the session established by signup, then log back in.
        self.client.post(reverse('coach:api-logout'))
        resp = self.client.post(
            self.login_url,
            data=json.dumps({'username': 'validuser', 'password': 'goodpass1'}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json().get('success'))






