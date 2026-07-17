from django.test import TestCase
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
