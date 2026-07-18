import json
import re
from datetime import timedelta
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required

from .models import UserProfile, Conversation, Message, DailyProgress
from .ratelimit import rate_limit


# ─── Payload size limits (server-side input validation) ─────
# These cap the size of client-supplied data before it is persisted. They are
# deliberately generous so normal AI practice conversations are never affected,
# while still rejecting abusive or malformed oversized payloads that could bloat
# the database, exhaust memory, or be used for a denial-of-service. All limits
# are enforced server-side because the client is untrusted.
MAX_USER_TEXT_LENGTH = 10_000        # characters — far above any real message
MAX_AI_RESPONSE_BYTES = 100_000      # serialized feedback JSON (~100 KB)
MAX_TITLE_LENGTH = 255               # matches Conversation.title max_length
MAX_PROVIDER_NAME_LENGTH = 50        # matches Message.ai_provider_name max_length
MAX_MODEL_NAME_LENGTH = 100          # matches Message.ai_model_name max_length
# Overall raw-body cap for the message endpoint: the AI-response cap plus room
# for the user text and metadata, bounded so a single request can't be huge.
MAX_MESSAGE_REQUEST_BYTES = 200_000


def json_body(request):
    """Parse JSON body from request."""
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return {}


def _json_byte_size(value):
    """Return the UTF-8 byte size of ``value`` serialized as JSON.

    Used to bound stored JSON (the AI feedback payload) before saving. Returns
    None if the value can't be serialized, so callers can reject it.
    """
    try:
        return len(json.dumps(value).encode('utf-8'))
    except (TypeError, ValueError):
        return None



# ─── Auth Views ─────────────────────────────────────────────

@require_http_methods(["POST"])
def validate_signup_step1_view(request):
    """Validate username and email before proceeding to signup step 2."""
    data = json_body(request)
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already taken.'}, status=400)

    if User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already registered.'}, status=400)

    return JsonResponse({'valid': True})

# Limit new-account creation per IP to curb mass/automated signups.
@rate_limit(limit=5, window=3600, prefix="signup", by="ip")
@require_http_methods(["POST"])
def signup_view(request):
    """Register a new user."""

    data = json_body(request)
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    ai_provider = data.get('ai_provider', 'gemini')

    # NOTE: API keys are NEVER received or stored by the server. They live only
    # on the user's device (browser storage). Any api_key fields in the request
    # body are intentionally ignored.

    if not username or not email or not password:
        return JsonResponse({'error': 'All fields are required.'}, status=400)

    if User.objects.filter(username=username).exists():
        return JsonResponse({'error': 'Username already taken.'}, status=400)

    if User.objects.filter(email=email).exists():
        return JsonResponse({'error': 'Email already registered.'}, status=400)

    if len(password) < 8:
        return JsonResponse({'error': 'Password must be at least 8 characters.'}, status=400)


    valid_providers = {choice[0] for choice in UserProfile.PROVIDER_CHOICES}
    if ai_provider not in valid_providers:
        return JsonResponse({'error': 'Please select a valid AI provider.'}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    user.profile.ai_provider = ai_provider

    # Set daily word goal if provided

    daily_word_goal = data.get('daily_word_goal')
    if daily_word_goal is not None:
        try:
            user.profile.daily_word_goal = int(daily_word_goal)
            user.profile.save()
        except ValueError:
            pass

    login(request, user)

    return JsonResponse({
        'success': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
        }
    })


# Brute-force protection. Two stacked limits, both returning the SAME generic
# message so throttling never reveals whether an account exists:
#   • per IP: blunt cap on total attempts from one address.
#   • per submitted username/email (hashed): stops targeting a single account
#     from many IPs. The value is hashed in the cache key, never stored raw.
@rate_limit(limit=10, window=300, prefix="login", by="ip")
@rate_limit(limit=5, window=300, prefix="login", by="field", field="username")
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


@require_http_methods(["POST"])
def logout_view(request):
    """Logout current user."""
    logout(request)
    return JsonResponse({'success': True})


@login_required
@require_http_methods(["POST"])
def delete_account_view(request):
    """Permanently delete the authenticated user's account and ALL related data.

    Security:
      • @login_required ensures only an authenticated user can reach this view.
      • This view is intentionally NOT @csrf_exempt — Django's CsrfViewMiddleware
        validates the X-CSRFToken header against the session, so cross-site or
        forged requests are rejected. The SPA page sets the CSRF cookie via
        @ensure_csrf_cookie on index_view.
      • A user can only ever delete their OWN account: the target is always
        request.user, never an id supplied by the client. There is no way to
        target another user's account.

    All data linked to the user is removed. Every model below has a ForeignKey /
    OneToOne to User with on_delete=CASCADE, so deleting the User row cascades to
    the rest. We still delete explicitly inside a transaction and then delete the
    User so no orphan records can remain even if new related models are added.
    """
    user = request.user

    with transaction.atomic():
        # Learning data: messages live under the user's conversations.
        Message.objects.filter(conversation__user=user).delete()
        Conversation.objects.filter(user=user).delete()
        # Statistics / progress data.
        DailyProgress.objects.filter(user=user).delete()
        # Profile (preferences, settings). OneToOne — also covered by cascade.
        UserProfile.objects.filter(user=user).delete()
        # Finally the account itself (username, email, password, session link).
        # Log the user out first so the session is flushed, then delete the row.
        logout(request)
        user.delete()

    return JsonResponse({
        'success': True,
        'message': 'Your account and all associated data have been permanently deleted.',
    })



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
            # API keys are NEVER returned by the server. They live only on the
            # user's device (browser local storage).
            'settings': {
                'theme': profile.theme,
                'ai_provider': profile.ai_provider,
                'explanation_language': profile.explanation_language,
                'openai_model': profile.openai_model,
                'daily_word_goal': profile.daily_word_goal,
            }

        })
    return JsonResponse({'authenticated': False})



# ─── Settings Views ────────────────────────────────────────

@login_required
@require_http_methods(["GET", "PUT"])
def settings_view(request):
    """Get or update user settings."""
    profile = request.user.profile

    if request.method == 'GET':
        # API keys are NEVER stored or returned by the server. They live only on
        # the user's device (browser local storage).
        return JsonResponse({
            'theme': profile.theme,
            'ai_provider': profile.ai_provider,
            'explanation_language': profile.explanation_language,
            'openai_model': profile.openai_model,
            'daily_word_goal': profile.daily_word_goal,
        })


    data = json_body(request)
    if 'theme' in data:
        profile.theme = data['theme']
    if 'ai_provider' in data:
        profile.ai_provider = data['ai_provider']
    if 'explanation_language' in data:
        valid_langs = {choice[0] for choice in UserProfile.EXPLANATION_LANGUAGE_CHOICES}
        if data['explanation_language'] in valid_langs:
            profile.explanation_language = data['explanation_language']
    # API keys are NEVER stored server-side. Any api_key fields present in the
    # request body are intentionally ignored — keys live only on the device.
    if 'openai_model' in data:
        profile.openai_model = data['openai_model']


    if 'daily_word_goal' in data:

        new_goal = int(data['daily_word_goal'])
        if profile.daily_word_goal != new_goal:
            # Lock in today's goal to the OLD goal so the new goal only takes effect tomorrow
            now_local = timezone.localtime(timezone.now())
            DailyProgress.objects.get_or_create(
                user=request.user,
                date=now_local.date(),
                defaults={'goal_target': profile.daily_word_goal}
            )
            profile.daily_word_goal = new_goal
    profile.save()

    return JsonResponse({'success': True})


# ─── Conversation Views ────────────────────────────────────

# Cap conversation creation per user. Only POST is throttled, so listing (GET)
# is never affected. Generous for real use; blocks automated churn.
@rate_limit(limit=20, window=60, prefix="convo_create", by="user")
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
    # Validate the title before saving: must be text and within the column
    # width. An empty/blank title falls back to the default rather than erroring,
    # matching how the SPA creates untitled conversations.
    if not isinstance(title, str):
        return JsonResponse({'error': 'Title must be text.'}, status=400)
    title = title.strip() or 'New Conversation'
    if len(title) > MAX_TITLE_LENGTH:
        return JsonResponse(
            {'error': f'Title is too long (max {MAX_TITLE_LENGTH} characters).'},
            status=400,
        )
    convo = Conversation.objects.create(user=request.user, title=title)

    return JsonResponse({
        'id': convo.id,
        'title': convo.title,
        'created_at': convo.created_at.isoformat(),
        'updated_at': convo.updated_at.isoformat(),
    })


@login_required
@require_http_methods(["DELETE", "PUT"])
def conversation_delete_view(request, convo_id):
    """Delete or rename a conversation."""
    try:
        convo = Conversation.objects.get(id=convo_id, user=request.user)
    except Conversation.DoesNotExist:
        return JsonResponse({'error': 'Conversation not found.'}, status=404)

    if request.method == 'PUT':
        data = json_body(request)
        title = data.get('title', '')
        if not isinstance(title, str):
            return JsonResponse({'error': 'Title must be text.'}, status=400)
        title = title.strip()

        if not title:
            return JsonResponse({'error': 'Title is required.'}, status=400)

        # Enforce the column width so an oversized title can't reach the database.
        if len(title) > MAX_TITLE_LENGTH:
            return JsonResponse(
                {'error': f'Title is too long (max {MAX_TITLE_LENGTH} characters).'},
                status=400,
            )

        convo.title = title
        convo.save()

        return JsonResponse({
            'id': convo.id,
            'title': convo.title,
            'created_at': convo.created_at.isoformat(),
            'updated_at': convo.updated_at.isoformat(),
        })

    convo.delete()
    return JsonResponse({'success': True})


# ─── Helpers ────────────────────────────────────────────────

# Regex for tokens that look like English words (Latin alphabet only)
_ENGLISH_WORD_RE = re.compile(r"^[a-zA-Z][a-zA-Z''-]*$")


def _count_english_words(text):
    """Count words that appear to be English (Latin-alphabet tokens).

    This filters out non-Latin scripts (e.g. Bengali, Arabic, Chinese)
    while keeping English words in mixed-language input. Single-letter
    tokens are only counted if they are common English words ('I', 'a').
    """
    count = 0
    for token in text.split():
        # Strip surrounding punctuation
        word = token.strip('.,!?;:()[]{}"\'-–—…')
        if not word:
            continue
        if _ENGLISH_WORD_RE.match(word):
            # Single-letter: only count common English single-letter words
            if len(word) == 1 and word.upper() not in ('I', 'A'):
                continue
            count += 1
    return count


# ─── Message Views ──────────────────────────────────────────

# AI-usage / cost protection. Each message POST drives an AI request, so this is
# the most cost-sensitive endpoint. Two stacked per-user limits — only POST is
# throttled, so loading existing messages (GET) is never affected:
#   • burst: 30/minute — comfortably above natural back-and-forth chat pace.
#   • sustained: 600/hour — blocks scripted floods and runaway cost while still
#     allowing a very heavy legitimate practice session.
@rate_limit(limit=30, window=60, prefix="msg_create", by="user")
@rate_limit(limit=600, window=3600, prefix="msg_create_hourly", by="user")
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
                        'expression': m.score_expression,
                        'mechanics': m.score_mechanics,
                        'overall': m.score_overall,
                    },
                    'ai_provider_name': m.ai_provider_name,
                    'ai_model_name': m.ai_model_name,
                    'created_at': m.created_at.isoformat(),
                }
                for m in msgs
            ]
        })

    # Reject oversized raw request bodies before doing any parsing/work. This is
    # a cheap first line of defense against a huge payload exhausting memory.
    if len(request.body) > MAX_MESSAGE_REQUEST_BYTES:
        return JsonResponse(
            {'error': 'Request too large. Please shorten your message.'},
            status=413,
        )

    data = json_body(request)
    user_text = data.get('user_text', '')
    ai_response = data.get('ai_response', {})
    scores = data.get('scores', {})
    ai_provider_name = data.get('ai_provider_name', '')
    ai_model_name = data.get('ai_model_name', '')

    if not user_text:
        return JsonResponse({'error': 'User text is required.'}, status=400)

    # ── Per-field size validation (server-side; client is untrusted) ─────
    # Enforced before saving so oversized data never reaches the database.
    if not isinstance(user_text, str):
        return JsonResponse({'error': 'User text must be text.'}, status=400)
    if len(user_text) > MAX_USER_TEXT_LENGTH:
        return JsonResponse(
            {'error': f'Message is too long (max {MAX_USER_TEXT_LENGTH} characters).'},
            status=400,
        )

    # The AI response is stored as JSON; bound its serialized size and ensure
    # it's an object so downstream code that calls .get() on it stays safe.
    if not isinstance(ai_response, dict):
        return JsonResponse({'error': 'Invalid AI response format.'}, status=400)
    ai_response_size = _json_byte_size(ai_response)
    if ai_response_size is None:
        return JsonResponse({'error': 'Invalid AI response format.'}, status=400)
    if ai_response_size > MAX_AI_RESPONSE_BYTES:
        return JsonResponse({'error': 'AI response payload is too large.'}, status=400)

    # Provider/model attribution strings are bounded to their column widths.
    if not isinstance(ai_provider_name, str) or len(ai_provider_name) > MAX_PROVIDER_NAME_LENGTH:
        return JsonResponse({'error': 'Invalid AI provider name.'}, status=400)
    if not isinstance(ai_model_name, str) or len(ai_model_name) > MAX_MODEL_NAME_LENGTH:
        return JsonResponse({'error': 'Invalid AI model name.'}, status=400)


    # ── Input status classification ──────────────────────────
    # The AI classifies each message; backend uses this to gate stats.
    input_status = ai_response.get('input_status', 'valid')
    eligible_statuses = {'valid', 'mixed_language'}
    counts_for_stats = input_status in eligible_statuses

    # For non-eligible input, nullify scores so they don't pollute averages
    if not counts_for_stats:
        scores = {}

    msg = Message.objects.create(
        conversation=convo,
        user_text=user_text,
        ai_response=ai_response,
        score_grammar=scores.get('grammar'),
        score_vocabulary=scores.get('vocabulary'),
        score_naturalness=scores.get('naturalness'),
        score_expression=scores.get('expression'),
        score_mechanics=scores.get('mechanics'),
        score_overall=scores.get('overall'),
        ai_provider_name=ai_provider_name,
        ai_model_name=ai_model_name,
        counts_for_stats=counts_for_stats,
    )

    # ── Track daily word progress (only for valid English input) ─
    if counts_for_stats:
        if input_status == 'mixed_language':
            # Count only English words: alphabetic tokens that look like English
            english_word_count = _count_english_words(user_text)
            word_count = max(english_word_count, 1)  # at least 1 if deemed mixed
        else:
            word_count = len(user_text.split())

        now_local = timezone.localtime(timezone.now())
        today_date = now_local.date()

        dp, created = DailyProgress.objects.get_or_create(
            user=request.user,
            date=today_date,
            defaults={'goal_target': request.user.profile.daily_word_goal}
        )
        dp.word_count += word_count
        dp.is_completed = dp.word_count >= dp.goal_target
        dp.save()

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
            'expression': msg.score_expression,
            'mechanics': msg.score_mechanics,
            'overall': msg.score_overall,
        },
        'ai_provider_name': msg.ai_provider_name,
        'ai_model_name': msg.ai_model_name,
        'counts_for_stats': msg.counts_for_stats,
        'created_at': msg.created_at.isoformat(),
    })


# ─── Stats Views ────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def stats_view(request):
    """Get user's performance statistics with optional time-range filtering."""
    range_param = request.GET.get('range', 'all')  # daily, weekly, monthly, all

    model_param = request.GET.get('model', 'all')

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

    # Get all unique models used by this user (unfiltered by time or model)
    all_used_models_qs = Message.objects.filter(
        conversation__user=request.user,
        counts_for_stats=True
    ).exclude(ai_model_name='').values_list('ai_model_name', flat=True).distinct()
    all_used_models = list(all_used_models_qs)

    # For total messages/conversations, only count messages with valid English input
    base_all_msgs = Message.objects.filter(
        conversation__user=request.user,
        counts_for_stats=True,
    )
    if start_date:
        base_all_msgs = base_all_msgs.filter(created_at__gte=start_date)
    if model_param != 'all':
        base_all_msgs = base_all_msgs.filter(ai_model_name=model_param)
        
    total_messages = base_all_msgs.count()
    total_conversations = base_all_msgs.values('conversation').distinct().count()

    # For scores, only look at rated messages
    base_qs = Message.objects.filter(
        conversation__user=request.user,
        score_grammar__isnull=False
    )
    if start_date:
        base_qs = base_qs.filter(created_at__gte=start_date)
    if model_param != 'all':
        base_qs = base_qs.filter(ai_model_name=model_param)
        
    filtered_qs = base_qs.order_by('created_at')

    if not filtered_qs.exists():
        return JsonResponse({
            'available_models': all_used_models,
            'total_messages': total_messages,
            'total_conversations': total_conversations,
            'scores': [],
            'daily_scores': [],
            'averages': {
                'grammar': 0,
                'vocabulary': 0,
                'naturalness': 0,
                'expression': 0,
                'mechanics': 0,
                'overall': 0,
            },
            'best_scores': {
                'grammar': 0,
                'vocabulary': 0,
                'naturalness': 0,
                'expression': 0,
                'mechanics': 0,
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
            overall = round((m.score_grammar * 0.30) + (m.score_vocabulary * 0.20) + (m.score_naturalness * 0.15) + ((m.score_expression or 0) * 0.30) + ((m.score_mechanics or 0) * 0.05), 1)

        scores_list.append({
            'grammar': m.score_grammar,
            'vocabulary': m.score_vocabulary,
            'naturalness': m.score_naturalness,
            'expression': m.score_expression,
            'mechanics': m.score_mechanics,
            'overall': overall,
            'local_date': local_dt.date().isoformat(),  # Grouping by local date
            'created_at': m.created_at.isoformat(),
        })

    count = len(scores_list)
    averages = {
        'grammar': round(sum(s['grammar'] or 0 for s in scores_list) / count, 1),
        'vocabulary': round(sum(s['vocabulary'] or 0 for s in scores_list) / count, 1),
        'naturalness': round(sum(s['naturalness'] or 0 for s in scores_list) / count, 1),
        'expression': round(sum(s['expression'] or 0 for s in scores_list) / count, 1),
        'mechanics': round(sum(s['mechanics'] or 0 for s in scores_list) / count, 1),
        'overall': round(sum(s['overall'] or 0 for s in scores_list) / count, 1),
    }

    # Group scores by day (or hour) for charting
    from collections import defaultdict
    daily_map = defaultdict(lambda: {'grammar': [], 'vocabulary': [], 'naturalness': [], 'expression': [], 'mechanics': [], 'overall': []})
    
    if range_param == 'daily':
        for i in range(24):
            bucket = f"{i:02d}:00"
            daily_map[bucket] # pre-populate 24 hours
            
    for s in scores_list:
        if range_param == 'daily':
            dt = timezone.localtime(timezone.datetime.fromisoformat(s['created_at']))
            bucket = dt.strftime('%H:00')
        else:
            bucket = s['local_date']
            
        for key in ('grammar', 'vocabulary', 'naturalness', 'expression', 'mechanics', 'overall'):
            if s[key] is not None:
                daily_map[bucket][key].append(s[key])

    daily_scores = []
    for bucket in sorted(daily_map.keys()):
        entry = {'date': bucket}
        for key in ('grammar', 'vocabulary', 'naturalness', 'expression', 'mechanics', 'overall'):
            vals = daily_map[bucket][key]
            entry[key] = round(sum(vals) / len(vals), 1) if vals else None
        daily_scores.append(entry)

    # Best scores (all-time, not filtered)
    all_scores = base_qs.order_by('created_at')
    best_scores = {
        'grammar': 0, 'vocabulary': 0, 'naturalness': 0, 'expression': 0, 'mechanics': 0, 'overall': 0,
    }
    for m in all_scores:
        # Calculate overall dynamically if missing
        overall = m.score_overall
        if overall is None and m.score_grammar is not None:
            overall = round((m.score_grammar * 0.30) + (m.score_vocabulary * 0.20) + (m.score_naturalness * 0.15) + ((m.score_expression or 0) * 0.30) + ((m.score_mechanics or 0) * 0.05), 1)

        scores_dict = {
            'grammar': m.score_grammar or 0,
            'vocabulary': m.score_vocabulary or 0,
            'naturalness': m.score_naturalness or 0,
            'expression': m.score_expression or 0,
            'mechanics': m.score_mechanics or 0,
            'overall': overall or 0,
        }
        
        for key, val in scores_dict.items():
            if val > best_scores[key]:
                best_scores[key] = val

    # Calculate goal-based streaks using DailyProgress
    all_progress = DailyProgress.objects.filter(user=request.user).order_by('-date')
    
    today_date = now_local.date()
    today_words = 0
    today_goal = request.user.profile.daily_word_goal
    completed_days = set()

    for dp in all_progress:
        if dp.date == today_date:
            today_words = dp.word_count
            today_goal = dp.goal_target
        if dp.is_completed:
            completed_days.add(dp.date)

    # Calculate max streak
    max_streak = 0
    sorted_completed = sorted(list(completed_days), reverse=True)
    if sorted_completed:
        current_run = 1
        max_streak = 1
        for i in range(len(sorted_completed) - 1):
            if (sorted_completed[i] - sorted_completed[i+1]).days == 1:
                current_run += 1
                max_streak = max(max_streak, current_run)
            else:
                current_run = 1

    # Calculate current streak
    streak = 0
    check_date = today_date
    if check_date not in completed_days:
        check_date -= timedelta(days=1)
    
    while check_date in completed_days:
        streak += 1
        check_date -= timedelta(days=1)

    return JsonResponse({
        'available_models': all_used_models,
        'total_messages': total_messages,
        'total_conversations': total_conversations,
        'scores': scores_list,
        'daily_scores': daily_scores,
        'averages': averages,
        'best_scores': best_scores,
        'streak': streak,
        'max_streak': max_streak,
        'today_words': today_words,
        'today_goal': today_goal,
    })


@login_required
@require_http_methods(["GET"])
def learning_history_view(request):
    """Get user's learning history across all conversations."""
    msgs = Message.objects.filter(
        conversation__user=request.user,
        counts_for_stats=True,
    ).order_by('-created_at')

    history_items = []
    
    for m in msgs:
        ai_resp = m.ai_response
        if not isinstance(ai_resp, dict):
            continue

        try:
            local_date = timezone.localtime(m.created_at).isoformat()
            
            for gc in (ai_resp.get('grammar_corrections') or []):
                if not isinstance(gc, dict):
                    continue
                history_items.append({
                    'type': 'grammar',
                    'date': local_date,
                    'original': gc.get('original', ''),
                    'suggestion': gc.get('corrected', ''),
                    'explanation': gc.get('explanation', ''),
                })
                
            for mc in (ai_resp.get('mechanics_corrections') or []):
                if not isinstance(mc, dict):
                    continue
                history_items.append({
                    'type': 'mechanics',
                    'date': local_date,
                    'original': mc.get('original', ''),
                    'suggestion': mc.get('corrected', ''),
                    'explanation': mc.get('tip', '') or mc.get('explanation', ''),
                })

            for si in (ai_resp.get('sentence_improvements') or []):
                if not isinstance(si, dict):
                    continue
                history_items.append({
                    'type': 'sentence',

                    'date': local_date,
                    'original': si.get('original', ''),
                    'suggestion': si.get('improved', ''),
                    'explanation': si.get('explanation', ''),
                })
                
            for vi in (ai_resp.get('vocabulary_improvements') or []):
                if not isinstance(vi, dict):
                    continue
                history_items.append({
                    'type': 'vocabulary',
                    'date': local_date,
                    'original': vi.get('original', ''),
                    'suggestion': vi.get('suggestion', ''),
                    'explanation': vi.get('context', ''),
                    'synonyms': vi.get('synonyms', [])
                })
                
            for pg in (ai_resp.get('pronunciation_guidance') or []):
                if not isinstance(pg, dict):
                    continue
                history_items.append({
                    'type': 'pronunciation',
                    'date': local_date,
                    'original': pg.get('word', ''),
                    'suggestion': pg.get('phonetic', '') or pg.get('spelling', ''),
                    'explanation': pg.get('tip', ''),
                })
        except Exception:
            continue

    return JsonResponse({'items': history_items})


# ─── Page View ───────────────────────────────────────────────

def home_view(request):
    """Serve the public marketing homepage / landing page.

    If the visitor is already authenticated (e.g. returning after a previous
    session), skip the marketing page and take them straight to the app.
    """
    from django.shortcuts import redirect, render
    if request.user.is_authenticated:
        return redirect('/app/')
    return render(request, 'coach/home.html')


def privacy_view(request):
    """Serve the public Privacy Policy page.

    A standalone marketing-style page (same shell as the homepage) that is
    always accessible, whether or not the visitor is signed in.
    """
    from django.shortcuts import render
    return render(request, 'coach/privacy.html')


def about_view(request):
    """Serve the public About page.

    A standalone marketing-style page (same shell as the homepage) that tells
    the story, mission, philosophy and vision behind Uccharon. Always
    accessible, whether or not the visitor is signed in.
    """
    from django.shortcuts import render
    return render(request, 'coach/about.html')


def guide_view(request):
    """Serve the public Guide / how-to-use page.

    A standalone marketing-style page (same shell as the homepage) that walks
    new users through setting up Uccharon, connecting their own AI provider,
    and getting the most out of the learning features. Always accessible,
    whether or not the visitor is signed in.

    When opened with ``?embedded=true`` (e.g. from the in-app Settings drawer),
    the page renders in an embedded mode: the public navbar, mobile menu and
    footer are hidden and a close button is shown, so only the guide content
    appears. The template reuses the same markup and styling — the layout is
    just switched conditionally.
    """
    from django.shortcuts import render
    embedded = request.GET.get('embedded') == 'true'
    return render(request, 'coach/guide.html', {'embedded': embedded})







@ensure_csrf_cookie
def index_view(request):
    """Serve the main SPA page (login, signup, and the logged-in app).

    @ensure_csrf_cookie guarantees the browser receives the ``csrftoken`` cookie
    so CSRF-protected endpoints (e.g. account deletion) can validate the
    X-CSRFToken header sent by the SPA.
    """
    from django.shortcuts import render
    return render(request, 'coach/index.html')



