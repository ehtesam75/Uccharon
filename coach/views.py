import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required

from .models import UserProfile, Conversation, Message


def json_body(request):
    """Parse JSON body from request."""
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return {}


# ─── Auth Views ─────────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def signup_view(request):
    """Register a new user."""
    data = json_body(request)
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not email or not password:
        return JsonResponse({'error': 'All fields are required.'}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already taken.'}, status=400)

    if User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already registered.'}, status=400)

    if len(password) < 6:
        return JsonResponse({'error': 'Password must be at least 6 characters.'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    login(request, user)

    return JsonResponse({
        'success': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    })


@csrf_exempt
@require_http_methods(["POST"])
def login_view(request):
    """Login with username/email and password."""
    data = json_body(request)
    identifier = data.get('username', '').strip()  # Can be username or email
    password = data.get('password', '')

    # Try username first, then email
    user = authenticate(request, username=identifier, password=password)
    if user is None:
        # Try email lookup
        try:
            user_obj = User.objects.get(email=identifier)
            user = authenticate(request, username=user_obj.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is not None:
        login(request, user)
        return JsonResponse({
            'success': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
            }
        })
    else:
        return JsonResponse({'error': 'Invalid credentials.'}, status=401)


@csrf_exempt
@require_http_methods(["POST"])
def logout_view(request):
    """Logout current user."""
    logout(request)
    return JsonResponse({'success': True})


@require_http_methods(["GET"])
def current_user_view(request):
    """Get current authenticated user info."""
    if request.user.is_authenticated:
        profile = request.user.profile
        return JsonResponse({
            'authenticated': True,
            'user': {
                'id': request.user.id,
                'username': request.user.username,
                'email': request.user.email,
            },
            'settings': {
                'theme': profile.theme,
                'ai_provider': profile.ai_provider,
                'gemini_api_key': profile.gemini_api_key,
                'groq_api_key': profile.groq_api_key,
            }
        })
    return JsonResponse({'authenticated': False})


# ─── Settings Views ────────────────────────────────────────

@csrf_exempt
@login_required
@require_http_methods(["GET", "PUT"])
def settings_view(request):
    """Get or update user settings."""
    profile = request.user.profile

    if request.method == 'GET':
        return JsonResponse({
            'theme': profile.theme,
            'ai_provider': profile.ai_provider,
            'gemini_api_key': profile.gemini_api_key,
            'groq_api_key': profile.groq_api_key,
        })

    data = json_body(request)
    if 'theme' in data:
        profile.theme = data['theme']
    if 'ai_provider' in data:
        profile.ai_provider = data['ai_provider']
    if 'gemini_api_key' in data:
        profile.gemini_api_key = data['gemini_api_key']
    if 'groq_api_key' in data:
        profile.groq_api_key = data['groq_api_key']
    profile.save()

    return JsonResponse({'success': True})


# ─── Conversation Views ────────────────────────────────────

@csrf_exempt
@login_required
@require_http_methods(["GET", "POST"])
def conversations_view(request):
    """List or create conversations."""
    if request.method == 'GET':
        convos = Conversation.objects.filter(user=request.user)
        return JsonResponse({
            'conversations': [
                {
                    'id': c.id,
                    'title': c.title,
                    'created_at': c.created_at.isoformat(),
                    'updated_at': c.updated_at.isoformat(),
                }
                for c in convos
            ]
        })

    data = json_body(request)
    title = data.get('title', 'New Conversation')
    convo = Conversation.objects.create(user=request.user, title=title)
    return JsonResponse({
        'id': convo.id,
        'title': convo.title,
        'created_at': convo.created_at.isoformat(),
        'updated_at': convo.updated_at.isoformat(),
    })


@csrf_exempt
@login_required
@require_http_methods(["DELETE"])
def conversation_delete_view(request, convo_id):
    """Delete a conversation."""
    try:
        convo = Conversation.objects.get(id=convo_id, user=request.user)
        convo.delete()
        return JsonResponse({'success': True})
    except Conversation.DoesNotExist:
        return JsonResponse({'error': 'Conversation not found.'}, status=404)


# ─── Message Views ──────────────────────────────────────────

@csrf_exempt
@login_required
@require_http_methods(["GET", "POST"])
def messages_view(request, convo_id):
    """Get or add messages for a conversation."""
    try:
        convo = Conversation.objects.get(id=convo_id, user=request.user)
    except Conversation.DoesNotExist:
        return JsonResponse({'error': 'Conversation not found.'}, status=404)

    if request.method == 'GET':
        msgs = Message.objects.filter(conversation=convo)
        return JsonResponse({
            'messages': [
                {
                    'id': m.id,
                    'user_text': m.user_text,
                    'ai_response': m.ai_response,
                    'scores': {
                        'grammar': m.score_grammar,
                        'vocabulary': m.score_vocabulary,
                        'naturalness': m.score_naturalness,
                        'confidence': m.score_confidence,
                        'pronunciation': m.score_pronunciation,
                    },
                    'created_at': m.created_at.isoformat(),
                }
                for m in msgs
            ]
        })

    data = json_body(request)
    user_text = data.get('user_text', '')
    ai_response = data.get('ai_response', {})
    scores = data.get('scores', {})

    if not user_text:
        return JsonResponse({'error': 'User text is required.'}, status=400)

    msg = Message.objects.create(
        conversation=convo,
        user_text=user_text,
        ai_response=ai_response,
        score_grammar=scores.get('grammar'),
        score_vocabulary=scores.get('vocabulary'),
        score_naturalness=scores.get('naturalness'),
        score_confidence=scores.get('confidence'),
        score_pronunciation=scores.get('pronunciation'),
    )

    # Update conversation title from first message
    if convo.messages.count() == 1:
        convo.title = user_text[:60] + ('...' if len(user_text) > 60 else '')
        convo.save()

    return JsonResponse({
        'id': msg.id,
        'user_text': msg.user_text,
        'ai_response': msg.ai_response,
        'scores': {
            'grammar': msg.score_grammar,
            'vocabulary': msg.score_vocabulary,
            'naturalness': msg.score_naturalness,
            'confidence': msg.score_confidence,
            'pronunciation': msg.score_pronunciation,
        },
        'created_at': msg.created_at.isoformat(),
    })


# ─── Stats Views ────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def stats_view(request):
    """Get user's performance statistics."""
    messages = Message.objects.filter(
        conversation__user=request.user,
        score_grammar__isnull=False
    ).order_by('created_at')

    if not messages.exists():
        return JsonResponse({
            'total_messages': 0,
            'total_conversations': 0,
            'scores': [],
            'averages': {
                'grammar': 0,
                'vocabulary': 0,
                'naturalness': 0,
                'confidence': 0,
                'pronunciation': 0,
            }
        })

    scores_list = []
    for m in messages:
        scores_list.append({
            'grammar': m.score_grammar,
            'vocabulary': m.score_vocabulary,
            'naturalness': m.score_naturalness,
            'confidence': m.score_confidence,
            'pronunciation': m.score_pronunciation,
            'created_at': m.created_at.isoformat(),
        })

    count = len(scores_list)
    averages = {
        'grammar': round(sum(s['grammar'] or 0 for s in scores_list) / count, 1),
        'vocabulary': round(sum(s['vocabulary'] or 0 for s in scores_list) / count, 1),
        'naturalness': round(sum(s['naturalness'] or 0 for s in scores_list) / count, 1),
        'confidence': round(sum(s['confidence'] or 0 for s in scores_list) / count, 1),
        'pronunciation': round(sum(s['pronunciation'] or 0 for s in scores_list) / count, 1),
    }

    return JsonResponse({
        'total_messages': Message.objects.filter(conversation__user=request.user).count(),
        'total_conversations': Conversation.objects.filter(user=request.user).count(),
        'scores': scores_list,
        'averages': averages,
    })


# ─── Page View ───────────────────────────────────────────────

def index_view(request):
    """Serve the main SPA page."""
    from django.shortcuts import render
    return render(request, 'coach/index.html')
