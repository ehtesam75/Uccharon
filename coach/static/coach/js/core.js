/**
 * Uccharon - AI English Speaking Coach
 * Core: shared state, DOM references, and helpers
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════

    const state = {
        user: null,
        settings: {
            theme: 'dark',
            ai_provider: 'gemini',
            explanation_language: 'en',   // 'en' | 'bn' — language for explanations/tips only
            gemini_api_key: '',

            gemini_api_key_2: '',
            gemini_api_key_3: '',
            groq_api_key: '',
            groq_api_key_2: '',
            groq_api_key_3: '',
            openrouter_api_key: '',
            openrouter_api_key_2: '',
            openrouter_api_key_3: '',
            openai_api_key: '',            // shared by OpenAI response provider + Whisper STT
            openai_api_key_2: '',
            openai_api_key_3: '',

            gemini_model: 'gemini-2.5-flash',
            groq_model: 'llama-3.3-70b-versatile',
            openrouter_model: 'meta-llama/llama-3.3-70b-instruct',
            openai_model: 'gpt-4o',

            voice_provider: 'groq-whisper',    // 'browser' | 'openai' | 'gemini-stt' | 'groq-whisper'
            groq_whisper_model: 'whisper-large-v3-turbo'   // Groq Whisper STT model


        },
        conversations: [],
        currentConversation: null,
        currentMessages: [],
        chatDrafts: {},          // per-conversation unsent input text, keyed by conversation id
        isRecording: false,

        isSending: false,
        abortController: null,   // AbortController for the in-flight AI generation
        generationCancelled: false,
        recognition: null,       // Web Speech API instance
        mediaRecorder: null,     // MediaRecorder for Whisper / Gemini audio
        activeStream: null,      // active microphone MediaStream
        audioChunks: [],         // accumulated audio blobs
        previousScores: null,
        conversationLoadToken: 0,
        pendingConversationLoads: new Set(),
        emptyConversationDeletionQueue: new Set(),
        conversationRename: {
            active: false,
            cancelled: false,
            originalTitle: ''
        },
        dashboardRange: 'all',
        dashboardModel: 'all',
        radarChart: null,
        lineChart: null,
        learningHistory: null,
        learningHistoryFilter: 'all',
        collapsedSections: {},

        // API key validation tracking
        signupValidatedKey: null,
        signupValidatedProvider: null,
        settingsKeyValidation: {}   // inputId -> 'valid' | 'invalid' | 'unvalidated'
    };

    // Set a validation status message ('success' | 'error' | 'checking') on a status element
    function setKeyValidationStatus(statusEl, type, message) {
        if (!statusEl) return;
        statusEl.classList.remove('status-success', 'status-error', 'status-checking', 'show');
        if (!type) {
            statusEl.textContent = '';
            return;
        }
        statusEl.classList.add('show', `status-${type}`);
        statusEl.textContent = message;
    }


    const MODEL_DISPLAY_NAMES = {
        'gemini-2.5-pro': 'Gemini 2.5 Pro',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'gemini-2.0-pro': 'Gemini 2.0 Pro',
        'gemini-2.0-flash': 'Gemini 2.0 Flash',
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'gemini-1.5-flash': 'Gemini 1.5 Flash',
        'gemini-1.5-flash-8b': 'Gemini 1.5 Flash 8B',
        'llama-3.3-70b-versatile': 'Llama 3.3 70B',
        'llama-3.1-8b-instant': 'Llama 3.1 8B',
        'deepseek-r1-distill-llama-70b': 'DeepSeek R1 Llama 70B',
        'gemma2-9b-it': 'Gemma 2 9B',
        'deepseek/deepseek-chat': 'DeepSeek V3',
        'deepseek/deepseek-r1': 'DeepSeek R1',
        'openai/gpt-oss-120b': 'GPT OSS 120B',
        'qwen/qwen3-235b-a22b-2507': 'Qwen3 235B',
        'qwen/qwen3-30b-a3b-instruct-2507': 'Qwen3 30B',
        'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B',
        'google/gemma-3-27b-it': 'Gemma 3 27B',
        'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
        'nvidia/llama-3.3-nemotron-super-49b-v1': 'NVIDIA Nemotron Super 49B',
        'openrouter/auto': 'Auto (OpenRouter Choice)',
        'gpt-4o': 'GPT-4o',
        'gpt-4o-mini': 'GPT-4o mini',
        'gpt-4.1': 'GPT-4.1',
        'gpt-4.1-mini': 'GPT-4.1 mini'
    };



    // ═══════════════════════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════════════════════

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const ACTIVE_CONVERSATION_STORAGE_KEY = 'uccharon_active_conversation_id';
    const ACTIVE_VIEW_STORAGE_KEY = 'uccharon_active_view';

    const DOM = {
        authScreen: $('#auth-screen'),
        app: $('#app'),

        // Auth
        authBrand: $('#auth-brand'),
        loginForm: $('#login-form'),
        signupForm: $('#signup-form'),
        loginUsername: $('#login-username'),
        loginPassword: $('#login-password'),
        loginBtn: $('#login-btn'),
        loginError: $('#login-error'),
        signupStep1: $('#signup-step-1'),
        signupStep2: $('#signup-step-2'),
        signupStep3: $('#signup-step-3'),
        signupProgressSteps: $$('.signup-progress-step'),
        signupNextBtn: $('#signup-next-btn'),
        signupStep2NextBtn: $('#signup-step-2-next-btn'),
        signupBackBtn: $('#signup-back-btn'),
        signupStep3BackBtn: $('#signup-step-3-back-btn'),
        signupError1: $('#signup-error-1'),
        signupError2: $('#signup-error-2'),
        signupError3: $('#signup-error-3'),
        signupUsername: $('#signup-username'),
        signupEmail: $('#signup-email'),
        signupPassword: $('#signup-password'),
        signupConfirmPassword: $('#signup-confirm-password'),
        signupAiProvider: $('#signup-ai-provider'),
        signupApiKeySection: $('#signup-api-key-section'),
        signupApiKey: $('#signup-api-key'),
        signupValidateBtn: $('#signup-validate-btn'),
        signupValidateStatus: $('#signup-validate-status'),

        signupKeyGuide: $('#signup-key-guide'),
        signupBtn: $('#signup-btn'),
        showSignup: $('#show-signup'),
        showLogin: $('#show-login'),
        authThemeToggle: $('#auth-theme-toggle'),
        authThemeIconDark: $('.auth-theme-icon-dark'),
        authThemeIconLight: $('.auth-theme-icon-light'),


        // Sidebar
        sidebar: $('#sidebar'),
        sidebarOverlay: $('#sidebar-overlay'),
        sidebarToggle: $('#sidebar-toggle'),
        mobileSidebarToggle: $('#mobile-sidebar-toggle'),
        newChatBtn: $('#new-chat-btn'),
        conversationList: $('#conversation-list'),
        userName: $('#user-name'),
        userEmail: $('#user-email'),
        userAvatar: $('#user-avatar'),

        // Chat
        welcomeScreen: $('#welcome-screen'),
        chatArea: $('#chat-area'),
        chatTitle: $('#chat-title'),
        chatMessages: $('#chat-messages'),
        chatLoading: $('#chat-loading'),
        chatInput: $('#chat-input'),
        sendBtn: $('#send-btn'),
        scrollToBottomBtn: $('#scroll-to-bottom-btn'),
        renameConvoBtn: $('#rename-convo-btn'),
        micBtn: $('#mic-btn'),
        micStatus: $('#mic-status'),
        deleteConvoBtn: $('#delete-convo-btn'),
        welcomeNewChat: $('#welcome-new-chat'),

        // Settings
        settingsBtn: $('#settings-btn'),
        settingsOverlay: $('#settings-overlay'),
        settingsDrawer: $('#settings-drawer'),
        closeSettings: $('#close-settings'),
        geminiApiKey: $('#gemini-api-key'),
        groqApiKey: $('#groq-api-key'),
        openrouterApiKey: $('#openrouter-api-key'),

        openaiApiKey: $('#openai-api-key'),
        geminiModelSelect: $('#gemini-model-select'),
        groqModelSelect: $('#groq-model-select'),
        openrouterModelSelect: $('#openrouter-model-select'),
        openaiModelSelect: $('#openai-model-select'),

        saveSettingsBtn: $('#save-settings-btn'),
        groqWhisperGroup: $('#groq-whisper-group'),
        groqWhisperModelSelect: $('#groq-whisper-model-select'),
        voiceBrowserNotice: $('#voice-browser-notice'),
        geminiSttNotice: $('#gemini-stt-notice'),
        openaiSttNotice: $('#openai-stt-notice'),



        // Dashboard
        statsBtn: $('#stats-btn'),
        dashboardScreen: $('#dashboard-screen'),
        timeRangeTabs: $('#time-range-tabs'),

        dashLoading: $('#dashboard-loading'),
        dashEmpty: $('#dashboard-empty'),
        dashData: $('#dashboard-data'),
        dashTotalMessages: $('#dash-total-messages'),
        dashTotalConvos: $('#dash-total-convos'),
        dashStreak: $('#dash-streak'),
        dashMaxStreak: $('#dash-max-streak'),
        dashTodayProgress: $('#dash-today-progress'),
        dashOverallScore: $('#dash-overall-score'),
        radarChartCtx: $('#radar-chart'),
        lineChartCtx: $('#line-chart'),
        dashAvgScores: $('#dash-avg-scores'),
        dashBestScores: $('#dash-best-scores'),

        // Learning History
        learningHistoryBtn: $('#learning-history-btn'),
        learningHistoryScreen: $('#learning-history-screen'),
        historyFilterTabs: $('#history-filter-tabs'),
        historyLoading: $('#history-loading'),
        historyEmpty: $('#history-empty'),
        learningHistoryData: $('#learning-history-data'),
        learningHistoryList: $('#learning-history-list'),

        // Onboarding Goal Modal
        goalModalOverlay: $('#goal-modal-overlay'),
        saveOnboardingGoalBtn: $('#save-onboarding-goal-btn'),
        dailyWordGoalSelect: $('#daily-word-goal'),
        explanationLanguageSelect: $('#explanation-language'),

        // Theme
        themeToggleBtn: $('#theme-toggle-btn'),
        logoutBtn: $('#logout-btn'),
    };

    // ═══════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════

    function getCsrfToken() {
        const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
        return cookie ? cookie.split('=')[1] : '';
    }

    async function api(url, method = 'GET', body = null) {
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            credentials: 'same-origin'
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Stop any active text-to-speech (speaker) playback and reset every
    // "playing" speaker button back to its idle icon. Safe to call anytime.
    function stopSpeaker() {
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        } catch (e) { /* ignore */ }

        const speakerIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
        document.querySelectorAll('.vocab-speak-btn.playing').forEach(b => {
            b.classList.remove('playing');
            b.innerHTML = speakerIcon;
        });
    }

    function timeAgo(dateStr) {

        const now = new Date();
        const date = new Date(dateStr);
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    function getConversationStorageKey(userId) {
        return userId ? `${ACTIVE_CONVERSATION_STORAGE_KEY}_${userId}` : ACTIVE_CONVERSATION_STORAGE_KEY;
    }

    function getPersistedConversationId(userId = state.user?.id) {
        if (userId) {
            return sessionStorage.getItem(getConversationStorageKey(userId));
        }
        return sessionStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }

    function setPersistedConversationId(conversationId) {
        if (conversationId && state.user?.id) {
            sessionStorage.setItem(getConversationStorageKey(state.user.id), String(conversationId));
        }
    }

    function clearPersistedConversationId(userId = state.user?.id) {
        sessionStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        if (userId) {
            sessionStorage.removeItem(getConversationStorageKey(userId));
        }
    }

    function clearAllPersistedConversationIds() {
        sessionStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith(`${ACTIVE_CONVERSATION_STORAGE_KEY}_`)) {
                sessionStorage.removeItem(key);
            }
        });
    }

    function clearOtherUsersConversationIds(currentUserId) {
        sessionStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith(`${ACTIVE_CONVERSATION_STORAGE_KEY}_`) && key !== getConversationStorageKey(currentUserId)) {
                sessionStorage.removeItem(key);
            }
        });
    }

    function migrateLegacyConversationId(userId) {
        const legacyId = sessionStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
        if (legacyId && userId && !getPersistedConversationId(userId)) {
            sessionStorage.setItem(getConversationStorageKey(userId), legacyId);
        }
        sessionStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }

    // ─── Active view persistence (chat | stats | history) ────
    // Persisted per-user in sessionStorage so a page refresh can reopen the
    // exact page the user was on. sessionStorage is per-tab-session, so a fresh
    // browser session / PWA launch starts empty automatically.

    function getViewStorageKey(userId) {
        return userId ? `${ACTIVE_VIEW_STORAGE_KEY}_${userId}` : ACTIVE_VIEW_STORAGE_KEY;
    }

    function getPersistedView(userId = state.user?.id) {
        if (userId) {
            return sessionStorage.getItem(getViewStorageKey(userId));
        }
        return sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    }

    function setPersistedView(view) {
        if (view && state.user?.id) {
            sessionStorage.setItem(getViewStorageKey(state.user.id), view);
        }
    }

    function clearPersistedView(userId = state.user?.id) {
        sessionStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
        if (userId) {
            sessionStorage.removeItem(getViewStorageKey(userId));
        }
    }

    function clearAllPersistedViews() {
        sessionStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith(`${ACTIVE_VIEW_STORAGE_KEY}_`)) {
                sessionStorage.removeItem(key);
            }
        });
    }

    // Returns true only when the current page load is an actual reload/refresh
    // (as opposed to a fresh navigation, PWA launch, or new browser session).
    function isPageRefresh() {
        try {
            const navEntries = performance.getEntriesByType('navigation');
            if (navEntries && navEntries.length > 0) {
                return navEntries[0].type === 'reload';
            }
        } catch (e) { /* ignore */ }
        // Legacy fallback for older browsers
        if (performance.navigation) {
            return performance.navigation.type === 1; // TYPE_RELOAD
        }
        return false;
    }

    function getCollapsedSectionsKey(userId = state.user?.id) {
        return `uccharon_collapsed_sections_${userId ?? 'guest'}`;
    }

    function loadCollapsedSections() {
        state.collapsedSections = {};
        try {
            const raw = localStorage.getItem(getCollapsedSectionsKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    state.collapsedSections = parsed;
                }
            }
        } catch (e) {
            state.collapsedSections = {};
        }
    }

    function saveCollapsedSections() {
        try {
            localStorage.setItem(getCollapsedSectionsKey(), JSON.stringify(state.collapsedSections));
        } catch (e) {
            // ignore storage errors
        }
    }

    // ═══════════════════════════════════════════════════════
    // DEVICE-ONLY API KEY STORE
    // ═══════════════════════════════════════════════════════
    //
    // API keys are stored ONLY on the user's device (browser local storage) and
    // are never sent to, stored by, or returned from Uccharon's servers. Keys are
    // namespaced per user id so multiple accounts on one device stay isolated.
    //
    // The four supported providers each allow up to 3 keys (primary + 2 fallback).
    const API_KEY_PROVIDERS = ['gemini', 'groq', 'openrouter', 'openai'];
    const API_KEY_FIELDS = API_KEY_PROVIDERS.reduce((fields, p) => {
        fields.push(`${p}_api_key`, `${p}_api_key_2`, `${p}_api_key_3`);
        return fields;
    }, []);

    function getApiKeysStorageKey(userId = state.user?.id) {
        return `uccharon_api_keys_${userId ?? 'guest'}`;
    }

    // Populate state.settings API-key fields from device storage. Any key not
    // present on the device resolves to an empty string.
    function loadLocalApiKeys(userId = state.user?.id) {
        let stored = {};
        try {
            const raw = localStorage.getItem(getApiKeysStorageKey(userId));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') stored = parsed;
            }
        } catch (e) {
            stored = {};
        }
        API_KEY_FIELDS.forEach(field => {
            state.settings[field] = stored[field] || '';
        });
        return stored;
    }

    // Persist the current in-memory API keys (state.settings) to device storage.
    // Only non-empty keys are written.
    function saveLocalApiKeys(userId = state.user?.id) {
        const payload = {};
        API_KEY_FIELDS.forEach(field => {
            const val = (state.settings[field] || '').trim();
            if (val) payload[field] = val;
        });
        try {
            localStorage.setItem(getApiKeysStorageKey(userId), JSON.stringify(payload));
        } catch (e) {
            // ignore storage errors
        }
    }



    function showWelcomeScreen() {
        DOM.welcomeScreen.style.display = 'flex';
        DOM.chatArea.style.display = 'none';
        DOM.dashboardScreen.style.display = 'none';
        DOM.learningHistoryScreen.style.display = 'none';
    }

    function resetChatState() {
        state.conversationLoadToken++;
        state.conversations = [];
        state.currentConversation = null;
        state.currentMessages = [];
        state.chatDrafts = {};
        state.previousScores = null;
        state.pendingConversationLoads.clear();

        state.emptyConversationDeletionQueue.clear();
        state.learningHistory = null;

        DOM.chatMessages.innerHTML = '';
        DOM.chatLoading.style.display = 'none';
        DOM.chatMessages.style.visibility = 'visible';
        DOM.chatInput.value = '';
        resizeChatInput();
        if (DOM.chatTitle) {
            DOM.chatTitle.textContent = 'New Conversation';
        }
        renderConversationList();
        showWelcomeScreen();
    }

    // Restore whichever chat the user had open (used on refresh). Falls back to
    // the welcome screen if the persisted conversation no longer exists.
    async function restoreActiveConversation() {
        const persistedConversationId = getPersistedConversationId();
        if (persistedConversationId) {
            const conversation = state.conversations.find(c => String(c.id) === persistedConversationId);
            if (conversation) {
                await selectConversation(conversation);
                return;
            }
            clearPersistedConversationId();
        }

        showWelcomeScreen();
    }

    // Decide what to show on initial page load:
    //  • Page refresh  → reopen the exact page/chat the user was on.
    //  • New session (fresh launch, new tab, PWA open) → start a new chat.
    // sessionStorage is per-tab-session, so a brand-new session has no persisted
    // view/conversation and naturally lands on a fresh chat.
    async function restoreSession() {
        if (!isPageRefresh()) {
            // New browser/PWA session: never auto-restore the previous chat.
            clearPersistedView();
            clearPersistedConversationId();
            await startNewSession();
            return;
        }

        // Page refresh: reopen the same page the user was on.
        const persistedView = getPersistedView();

        if (persistedView === 'stats') {
            await showDashboard();
            return;
        }
        if (persistedView === 'history') {
            await showLearningHistory();
            return;
        }

        // Default: restore the chat they had open.
        await restoreActiveConversation();
    }

    // Fresh-session entry point: reopen a new, empty chat rather than the
    // previous conversation.
    async function startNewSession() {
        setPersistedView('chat');
        if (state.conversations.length > 0 && state.conversations[0].title === 'New Conversation') {
            // Reuse an existing blank conversation instead of piling up new ones.
            await selectConversation(state.conversations[0], { loadMessages: false });
        } else {
            await createConversation();
        }
    }

