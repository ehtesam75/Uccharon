from django.contrib import admin
from .models import UserProfile, Conversation, Message


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'theme', 'ai_provider', 'created_at')
    list_filter = ('theme', 'ai_provider')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'created_at', 'updated_at')
    list_filter = ('user',)
    search_fields = ('title',)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('conversation', 'user_text_short', 'score_grammar', 'score_vocabulary', 'created_at')
    list_filter = ('conversation__user',)

    def user_text_short(self, obj):
        return obj.user_text[:80] + '...' if len(obj.user_text) > 80 else obj.user_text
    user_text_short.short_description = 'User Text'
