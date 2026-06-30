import json
from datetime import timedelta
from django.http import JsonResponse
from django.utils import timezone
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
                        'overall': m.score_overall,
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
        score_overall=scores.get('overall'),
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
            'overall': msg.score_overall,
        },
        'created_at': msg.created_at.isoformat(),
    })


# ─── Stats Views ────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def stats_view(request):
    """Get user's performance statistics with optional time-range filtering."""
    range_param = request.GET.get('range', 'all')  # daily, weekly, monthly, all

    now_local = timezone.localtime(timezone.now())
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_param == 'daily':
        start_date = today_start
    elif range_param == 'weekly':
        start_date = today_start - timedelta(days=6)
    elif range_param == 'monthly':
        start_date = today_start - timedelta(days=29)
    else:
        start_date = None

    # For total messages/conversations, count all (not just rated ones) in the time window
    base_all_msgs = Message.objects.filter(conversation__user=request.user)
    if start_date:
        filtered_all_msgs = base_all_msgs.filter(created_at__gte=start_date)
    else:
        filtered_all_msgs = base_all_msgs
        
    total_messages = filtered_all_msgs.count()
    total_conversations = filtered_all_msgs.values('conversation').distinct().count()

    # For scores, only look at rated messages
    base_qs = Message.objects.filter(
        conversation__user=request.user,
        score_grammar__isnull=False
    )
    if start_date:
        filtered_qs = base_qs.filter(created_at__gte=start_date).order_by('created_at')
    else:
        filtered_qs = base_qs.order_by('created_at')

    if not filtered_qs.exists():
        return JsonResponse({
            'total_messages': total_messages,
            'total_conversations': total_conversations,
            'scores': [],
            'daily_scores': [],
            'averages': {
                'grammar': 0,
                'vocabulary': 0,
                'naturalness': 0,
                'confidence': 0,
                'overall': 0,
            },
            'best_scores': {
                'grammar': 0,
                'vocabulary': 0,
                'naturalness': 0,
                'confidence': 0,
                'overall': 0,
            },
            'streak': 0,
        })

    # Build per-message scores list
    scores_list = []
    for m in filtered_qs:
        local_dt = timezone.localtime(m.created_at)
        
        # Calculate overall score if missing in database
        overall = m.score_overall
        if overall is None and m.score_grammar is not None:
            overall = round((m.score_grammar * 0.4) + (m.score_naturalness * 0.3) + (m.score_vocabulary * 0.2) + (m.score_confidence * 0.1), 1)

        scores_list.append({
            'grammar': m.score_grammar,
            'vocabulary': m.score_vocabulary,
            'naturalness': m.score_naturalness,
            'confidence': m.score_confidence,
            'overall': overall,
            'local_date': local_dt.date().isoformat(),  # Grouping by local date
            'created_at': m.created_at.isoformat(),
        })

    count = len(scores_list)
    averages = {
        'grammar': round(sum(s['grammar'] or 0 for s in scores_list) / count, 1),
        'vocabulary': round(sum(s['vocabulary'] or 0 for s in scores_list) / count, 1),
        'naturalness': round(sum(s['naturalness'] or 0 for s in scores_list) / count, 1),
        'confidence': round(sum(s['confidence'] or 0 for s in scores_list) / count, 1),
        'overall': round(sum(s['overall'] or 0 for s in scores_list) / count, 1),
    }

    # Group scores by day for charting (using local_date)
    from collections import defaultdict
    daily_map = defaultdict(lambda: {'grammar': [], 'vocabulary': [], 'naturalness': [], 'confidence': [], 'overall': []})
    for s in scores_list:
        day = s['local_date']
        for key in ('grammar', 'vocabulary', 'naturalness', 'confidence', 'overall'):
            if s[key] is not None:
                daily_map[day][key].append(s[key])

    daily_scores = []
    for day in sorted(daily_map.keys()):
        entry = {'date': day}
        for key in ('grammar', 'vocabulary', 'naturalness', 'confidence', 'overall'):
            vals = daily_map[day][key]
            entry[key] = round(sum(vals) / len(vals), 1) if vals else 0
        daily_scores.append(entry)

    # Best scores (all-time, not filtered)
    all_scores = base_qs.order_by('created_at')
    best_scores = {
        'grammar': 0, 'vocabulary': 0, 'naturalness': 0, 'confidence': 0, 'overall': 0,
    }
    for m in all_scores:
        # Calculate overall dynamically if missing
        overall = m.score_overall
        if overall is None and m.score_grammar is not None:
            overall = round((m.score_grammar * 0.4) + (m.score_naturalness * 0.3) + (m.score_vocabulary * 0.2) + (m.score_confidence * 0.1), 1)

        scores_dict = {
            'grammar': m.score_grammar or 0,
            'vocabulary': m.score_vocabulary or 0,
            'naturalness': m.score_naturalness or 0,
            'confidence': m.score_confidence or 0,
            'overall': overall or 0,
        }
        
        for key, val in scores_dict.items():
            if val > best_scores[key]:
                best_scores[key] = val

    # Calculate practice streak (consecutive days with at least one scored message)
    # Streak should always use all-time data
    all_days = set()
    for m in all_scores:
        all_days.add(timezone.localtime(m.created_at).date())

    streak = 0
    check_date = now_local.date()
    # If user hasn't practiced today, start from yesterday
    if check_date not in all_days:
        check_date -= timedelta(days=1)
    while check_date in all_days:
        streak += 1
        check_date -= timedelta(days=1)

    return JsonResponse({
        'total_messages': total_messages,
        'total_conversations': total_conversations,
        'scores': scores_list,
        'daily_scores': daily_scores,
        'averages': averages,
        'best_scores': best_scores,
        'streak': streak,
    })


# ─── Page View ───────────────────────────────────────────────

def index_view(request):
    """Serve the main SPA page."""
    from django.shortcuts import render
    return render(request, 'coach/index.html')
