from django.urls import path
from . import views

app_name = 'coach'

urlpatterns = [
    # Public marketing homepage / landing page
    path('', views.home_view, name='home'),

    # Main app (login, signup, and the logged-in SPA)
    path('app/', views.index_view, name='index'),


    # Auth API
    path('api/auth/signup/', views.signup_view, name='api-signup'),
    path('api/auth/validate-signup-step1/', views.validate_signup_step1_view, name='api-validate-signup-step1'),
    path('api/auth/login/', views.login_view, name='api-login'),
    path('api/auth/logout/', views.logout_view, name='api-logout'),
    path('api/auth/user/', views.current_user_view, name='api-user'),

    # Settings API
    path('api/settings/', views.settings_view, name='api-settings'),

    # Conversations API
    path('api/conversations/', views.conversations_view, name='api-conversations'),
    path('api/conversations/<int:convo_id>/', views.conversation_delete_view, name='api-conversation-delete'),

    # Messages API
    path('api/conversations/<int:convo_id>/messages/', views.messages_view, name='api-messages'),

    # Stats API
    path('api/stats/', views.stats_view, name='api-stats'),

    # Learning History API
    path('api/learning-history/', views.learning_history_view, name='api-learning-history'),
]
