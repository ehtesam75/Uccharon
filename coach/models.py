import json
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserProfile(models.Model):
    """Extended user profile for preferences and settings."""
    PROVIDER_CHOICES = [
        ('openai', 'OpenAI'),
        ('gemini', 'Gemini'),
        ('groq', 'Groq'),
        ('openrouter', 'OpenRouter'),
    ]

    THEME_CHOICES = [
        ('dark', 'Dark'),
        ('light', 'Light'),
    ]
    EXPLANATION_LANGUAGE_CHOICES = [
        ('en', 'English'),
        ('bn', 'Bengali'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    theme = models.CharField(max_length=10, choices=THEME_CHOICES, default='dark')
    ai_provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='gemini')
    # Language used ONLY for the explanations/tips (grammar, sentence, vocabulary,
    # pronunciation). Corrections/suggestions/targets always remain in English.
    explanation_language = models.CharField(
        max_length=5, choices=EXPLANATION_LANGUAGE_CHOICES, default='en'
    )

    # NOTE: API keys are NEVER stored server-side. They live ONLY on the user's
    # device (browser local storage) and are never received, stored, or returned
    # by Uccharon's servers. The former *_api_key columns were removed in
    # migration 0016.
    openai_model = models.CharField(max_length=100, blank=True, default='gpt-4o')


    daily_word_goal = models.IntegerField(default=250)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s profile"


class DailyProgress(models.Model):
    """Tracks a user's daily word count progress against their goal."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='daily_progress')
    date = models.DateField()
    word_count = models.IntegerField(default=0)
    goal_target = models.IntegerField()
    is_completed = models.BooleanField(default=False)

    class Meta:
        unique_together = ('user', 'date')
        ordering = ['-date']

    def __str__(self):
        return f"{self.user.username} - {self.date} ({self.word_count}/{self.goal_target})"


class Conversation(models.Model):
    """A conversation session between user and AI coach."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, default='New Conversation')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.title} ({self.user.username})"


class Message(models.Model):
    """A single message exchange — user input + AI response."""
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages'
    )
    user_text = models.TextField()
    ai_response = models.JSONField(default=dict)

    # Performance scores (0-10 scale, stored per message)
    score_grammar = models.FloatField(null=True, blank=True)
    score_vocabulary = models.FloatField(null=True, blank=True)
    score_naturalness = models.FloatField(null=True, blank=True)
    score_expression = models.FloatField(null=True, blank=True)
    score_mechanics = models.FloatField(null=True, blank=True)
    score_overall = models.FloatField(null=True, blank=True)

    # AI model attribution
    ai_provider_name = models.CharField(max_length=50, blank=True, default='')
    ai_model_name = models.CharField(max_length=100, blank=True, default='')

    # Whether this message counts toward user statistics (word count, message count, etc.)
    # False for non-English or gibberish input — determined by AI's input_status classification
    counts_for_stats = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Message in {self.conversation.title} at {self.created_at}"


# Auto-create UserProfile when a User is created
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()
