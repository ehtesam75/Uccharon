import json

from django.test import TestCase, Client, override_settings
from django.urls import reverse
from django.contrib.auth.models import User

from .models import UserProfile, Conversation, Message, DailyProgress




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


