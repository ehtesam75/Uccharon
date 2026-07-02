/**
 * Uccharon – AI English Speaking Coach
 * Main Application Logic
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════

    const state = {
        user: null,
        settings: {
            theme: 'dark',
            ai_provider: 'gemini',
            gemini_api_key: '',
            groq_api_key: '',
            gemini_model: 'gemini-2.0-flash',
            groq_model: 'llama-3.3-70b-versatile',
            voice_provider: 'browser',    // 'browser' | 'openai' | 'gemini-stt'
            openai_api_key: ''             // used for Whisper STT
        },
        conversations: [],
        currentConversation: null,
        currentMessages: [],
        isRecording: false,
        isSending: false,
        recognition: null,       // Web Speech API instance
        mediaRecorder: null,     // MediaRecorder for Whisper / Gemini audio
        audioChunks: [],         // accumulated audio blobs
        previousScores: null,
        dashboardRange: 'all',
        radarChart: null,
        lineChart: null
    };

    // ═══════════════════════════════════════════════════════
    // DOM REFERENCES
    // ═══════════════════════════════════════════════════════

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

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
        signupNextBtn: $('#signup-next-btn'),
        signupBackBtn: $('#signup-back-btn'),
        signupError1: $('#signup-error-1'),
        signupError2: $('#signup-error-2'),
        signupUsername: $('#signup-username'),
        signupEmail: $('#signup-email'),
        signupPassword: $('#signup-password'),
        signupBtn: $('#signup-btn'),
        showSignup: $('#show-signup'),
        showLogin: $('#show-login'),

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
        chatInput: $('#chat-input'),
        sendBtn: $('#send-btn'),
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
        openaiApiKey: $('#openai-api-key'),
        geminiModelSelect: $('#gemini-model-select'),
        groqModelSelect: $('#groq-model-select'),
        saveSettingsBtn: $('#save-settings-btn'),
        openaiKeyGroup: $('#openai-key-group'),
        voiceBrowserNotice: $('#voice-browser-notice'),
        geminiSttNotice: $('#gemini-stt-notice'),

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

        // Onboarding Goal Modal
        goalModalOverlay: $('#goal-modal-overlay'),
        saveOnboardingGoalBtn: $('#save-onboarding-goal-btn'),
        dailyWordGoalSelect: $('#daily-word-goal'),

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

    // ═══════════════════════════════════════════════════════
    // AUTH
    // ═══════════════════════════════════════════════════════

    function initAuth() {
        DOM.showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.loginForm.style.display = 'none';
            DOM.signupForm.style.display = 'block';
            DOM.authBrand.style.display = '';
            DOM.signupStep2.style.display = 'none';
            DOM.signupStep1.style.display = 'block';
            DOM.signupForm.style.animation = 'cardSlideUp 0.4s ease-out';
        });

        DOM.showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.signupForm.style.display = 'none';
            DOM.loginForm.style.display = 'block';
            DOM.authBrand.style.display = '';
            DOM.loginForm.style.animation = 'cardSlideUp 0.4s ease-out';
        });

        DOM.loginBtn.addEventListener('click', handleLogin);
        DOM.signupNextBtn.addEventListener('click', handleSignupNext);
        DOM.signupBtn.addEventListener('click', handleSignup);
        DOM.signupBackBtn.addEventListener('click', () => {
            DOM.signupStep2.style.display = 'none';
            DOM.signupStep1.style.display = 'block';
            DOM.authBrand.style.display = '';
        });

        // Goal cards selection
        const goalCards = $$('.goal-card');
        goalCards.forEach(card => {
            card.addEventListener('click', () => {
                goalCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                window.selectedDailyGoal = card.dataset.goal;
                DOM.signupBtn.disabled = false;
            });
        });

        // Enter key support
        DOM.loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        DOM.signupPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignupNext();
        });

        // Onboarding Goal Selection
        DOM.saveOnboardingGoalBtn.addEventListener('click', async () => {
            const selectedGoal = document.querySelector('input[name="onboarding-goal"]:checked').value;
            DOM.saveOnboardingGoalBtn.classList.add('btn-loading');
            DOM.saveOnboardingGoalBtn.disabled = true;
            try {
                await api('/api/settings/', 'PUT', { daily_word_goal: selectedGoal });
                state.settings.daily_word_goal = parseInt(selectedGoal);
                DOM.goalModalOverlay.style.display = 'none';
                showApp();
                await createConversation(); // Auto-start a chat for new users
            } catch (err) {
                showToast('Failed to save goal', 'error');
            } finally {
                DOM.saveOnboardingGoalBtn.classList.remove('btn-loading');
                DOM.saveOnboardingGoalBtn.disabled = false;
            }
        });
    }

    async function handleLogin() {
        const username = DOM.loginUsername.value.trim();
        const password = DOM.loginPassword.value;

        if (!username || !password) {
            showAuthError('login', 'Please fill in all fields.');
            return;
        }

        DOM.loginBtn.classList.add('btn-loading');
        DOM.loginBtn.disabled = true;

        try {
            const data = await api('/api/auth/login/', 'POST', { username, password });
            state.user = data.user;
            await loadUserData();
            showApp();

            // Automatically create a new chat session on login if they aren't a new user
            if (state.conversations.length > 0) {
                await createConversation();
            }
        } catch (err) {
            showAuthError('login', err.message);
        } finally {
            DOM.loginBtn.classList.remove('btn-loading');
            DOM.loginBtn.disabled = false;
        }
    }

    function handleSignupNext() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;

        if (!username || !email || !password) {
            showAuthError('signup1', 'Please fill in all fields.');
            return;
        }
        if (password.length < 6) {
            showAuthError('signup1', 'Password must be at least 6 characters.');
            return;
        }

        DOM.signupStep1.style.display = 'none';
        DOM.signupStep2.style.display = 'block';
        DOM.authBrand.style.display = 'none';
    }

    async function handleSignup() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;
        const daily_word_goal = window.selectedDailyGoal;

        if (!daily_word_goal) {
            showAuthError('signup2', 'Please select a daily goal.');
            return;
        }

        DOM.signupBtn.classList.add('btn-loading');
        DOM.signupBtn.disabled = true;

        try {
            const data = await api('/api/auth/signup/', 'POST', { username, email, password, daily_word_goal });
            state.user = data.user;

            // Explicitly force defaults for local settings on new signup
            // so they don't inherit a previous user's settings on the same machine
            localStorage.setItem('uccharon_voice_provider', 'browser');
            localStorage.removeItem('uccharon_openai_api_key');

            await loadUserData();
            DOM.authScreen.style.display = 'none';
            showApp();
        } catch (err) {
            showAuthError('signup2', err.message);
        } finally {
            DOM.signupBtn.classList.remove('btn-loading');
            DOM.signupBtn.disabled = false;
        }
    }

    function showAuthError(form, message) {
        let el;
        if (form === 'login') el = DOM.loginError;
        else if (form === 'signup1') el = DOM.signupError1;
        else if (form === 'signup2') el = DOM.signupError2;
        else el = DOM.signupError1;

        el.textContent = message;
        el.classList.add('show');
        el.style.animation = 'none';
        el.offsetHeight; // Trigger reflow
        el.style.animation = 'shake 0.4s ease';
        setTimeout(() => el.classList.remove('show'), 5000);
    }

    async function checkAuth() {
        try {
            const data = await api('/api/auth/user/');
            if (data.authenticated) {
                state.user = data.user;
                state.settings = { ...state.settings, ...data.settings };
                // Restore local-only settings from localStorage
                state.settings.gemini_model = localStorage.getItem('uccharon_gemini_model') || 'gemini-2.0-flash';
                state.settings.groq_model = localStorage.getItem('uccharon_groq_model') || 'llama-3.3-70b-versatile';
                state.settings.voice_provider = localStorage.getItem('uccharon_voice_provider') || 'browser';
                state.settings.openai_api_key = localStorage.getItem('uccharon_openai_api_key') || '';
                await loadConversations();
                showApp();
            } else {
                DOM.authScreen.style.display = 'flex';
            }
        } catch (e) {
            // Not logged in, show auth screen
            DOM.authScreen.style.display = 'flex';
        }
    }

    async function handleLogout() {
        try {
            await api('/api/auth/logout/', 'POST');
            state.user = null;
            state.conversations = [];
            state.currentConversation = null;
            state.currentMessages = [];
            DOM.app.style.display = 'none';
            DOM.dashboardScreen.style.display = 'none';
            DOM.authScreen.style.display = 'flex';
        } catch (err) {
            showToast('Logout failed', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════
    // APP INITIALIZATION
    // ═══════════════════════════════════════════════════════

    function showApp() {
        DOM.authScreen.style.display = 'none';
        DOM.app.style.display = 'flex';
        updateUserInfo();
        applyTheme(state.settings.theme);
        applySettingsToUI();
    }

    async function loadUserData() {
        try {
            const settingsData = await api('/api/settings/');
            state.settings = { ...state.settings, ...settingsData };
            state.settings.gemini_model = localStorage.getItem('uccharon_gemini_model') || 'gemini-2.0-flash';
            state.settings.groq_model = localStorage.getItem('uccharon_groq_model') || 'llama-3.3-70b-versatile';
            state.settings.voice_provider = localStorage.getItem('uccharon_voice_provider') || 'browser';
            state.settings.openai_api_key = localStorage.getItem('uccharon_openai_api_key') || '';
        } catch (e) { /* ignore */ }
        await loadConversations();
    }

    function updateUserInfo() {
        if (state.user) {
            DOM.userName.textContent = state.user.username;
            DOM.userEmail.textContent = state.user.email;
            DOM.userAvatar.textContent = state.user.username.charAt(0).toUpperCase();
        }
    }

    // ═══════════════════════════════════════════════════════
    // THEME
    // ═══════════════════════════════════════════════════════

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        state.settings.theme = theme;

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#12122A' : '#d9b97aff');
        }

        const darkIcon = $('.theme-icon-dark');
        const lightIcon = $('.theme-icon-light');
        if (theme === 'dark') {
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        }
    }

    function toggleTheme() {
        const newTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        // Save to server
        api('/api/settings/', 'PUT', { theme: newTheme }).catch(() => { });
        // Update charts if they exist
        if (state.radarChart && state.lineChart) {
            updateChartColors();
        }
    }

    // ═══════════════════════════════════════════════════════
    // CONVERSATIONS
    // ═══════════════════════════════════════════════════════

    async function loadConversations() {
        try {
            const data = await api('/api/conversations/');
            state.conversations = data.conversations;
            renderConversationList();

            // Auto-select the first conversation if we don't have one selected and we have conversations
            if (!state.currentConversation && state.conversations.length > 0) {
                await selectConversation(state.conversations[0]);
            }
        } catch (e) {
            console.error('Failed to load conversations:', e);
        }
    }

    function renderConversationList() {
        DOM.conversationList.innerHTML = '';
        if (state.conversations.length === 0) {
            DOM.conversationList.innerHTML = `
                <div style="padding: 20px 14px; text-align: center; color: var(--text-tertiary); font-size: 0.8rem;">
                    No conversations yet.<br>Start one to begin practicing!
                </div>
            `;
            return;
        }

        state.conversations.forEach(convo => {
            const item = document.createElement('div');
            item.className = `convo-item${state.currentConversation?.id === convo.id ? ' active' : ''}`;
            item.innerHTML = `<span class="convo-item-title">${escapeHtml(convo.title)}</span>`;
            item.addEventListener('click', () => selectConversation(convo));
            DOM.conversationList.appendChild(item);
        });
    }

    async function createConversation() {
        try {
            const data = await api('/api/conversations/', 'POST', { title: 'New Conversation' });
            state.conversations.unshift(data);
            renderConversationList();
            await selectConversation(data);

            // Close mobile sidebar
            DOM.sidebar.classList.remove('mobile-open');
            DOM.sidebarOverlay.classList.remove('active');
        } catch (err) {
            showToast('Failed to create conversation', 'error');
        }
    }

    async function selectConversation(convo) {
        // Delete the previous conversation if it has no messages before switching
        if (state.currentConversation && state.currentConversation.id !== convo.id) {
            if (state.currentMessages.length === 0) {
                try {
                    await api(`/api/conversations/${state.currentConversation.id}/`, 'DELETE');
                    state.conversations = state.conversations.filter(c => c.id !== state.currentConversation.id);
                } catch (e) {
                    console.error('Failed to delete empty conversation', e);
                }
            }
        }

        state.currentConversation = convo;
        state.previousScores = null;

        // Load messages
        try {
            const data = await api(`/api/conversations/${convo.id}/messages/`);
            state.currentMessages = data.messages;

            // Find previous scores from last message
            if (state.currentMessages.length > 0) {
                const lastMsg = state.currentMessages[state.currentMessages.length - 1];
                if (lastMsg.scores && lastMsg.scores.grammar !== null) {
                    state.previousScores = lastMsg.scores;
                }
            }
        } catch (e) {
            state.currentMessages = [];
        }

        DOM.welcomeScreen.style.display = 'none';
        DOM.dashboardScreen.style.display = 'none';
        DOM.chatArea.style.display = 'flex';
        DOM.chatTitle.textContent = convo.title;
        renderMessages();
        renderConversationList();

        // Close mobile sidebar
        DOM.sidebar.classList.remove('mobile-open');
        DOM.sidebarOverlay.classList.remove('active');
    }

    async function deleteConversation() {
        if (!state.currentConversation) return;
        if (!confirm('Delete this conversation?')) return;

        try {
            await api(`/api/conversations/${state.currentConversation.id}/`, 'DELETE');
            state.conversations = state.conversations.filter(c => c.id !== state.currentConversation.id);
            state.currentConversation = null;
            state.currentMessages = [];

            if (state.conversations.length > 0) {
                await selectConversation(state.conversations[0]);
            } else {
                DOM.chatArea.style.display = 'none';
                DOM.dashboardScreen.style.display = 'none';
                DOM.welcomeScreen.style.display = 'flex';
                renderConversationList();
            }
            showToast('Conversation deleted', 'success');
        } catch (err) {
            showToast('Failed to delete conversation', 'error');
        }
    }

    // ═══════════════════════════════════════════════════════
    // MESSAGES & CHAT
    // ═══════════════════════════════════════════════════════

    function renderMessages() {
        DOM.chatMessages.innerHTML = '';

        if (state.currentMessages.length === 0) {
            DOM.chatMessages.innerHTML = `
                <div style="flex:1; display:flex; align-items:center; justify-content:center; color: var(--text-tertiary); font-size: 0.9rem; text-align: center; padding: 40px;">
                    <div>
                        <div style="font-size: 2rem; margin-bottom: 12px;">💬</div>
                        <p>Start the conversation by typing or speaking in English.</p>
                        <p style="font-size: 0.8rem; margin-top: 8px;">I'll evaluate your message and help you improve!</p>
                    </div>
                </div>
            `;
            return;
        }

        state.currentMessages.forEach((msg, idx) => {
            const prevMsg = idx > 0 ? state.currentMessages[idx - 1] : null;
            const prevScores = prevMsg?.scores || null;
            renderMessagePair(msg, prevScores);
        });

        scrollToBottom();
    }

    function renderMessagePair(msg, prevScores) {
        const group = document.createElement('div');
        group.className = 'message-group';

        // User message
        const userMsg = document.createElement('div');
        userMsg.className = 'user-message';
        userMsg.innerHTML = `
            <div class="user-bubble">${escapeHtml(msg.user_text)}</div>
            <div class="user-message-time">${timeAgo(msg.created_at)}</div>
        `;
        group.appendChild(userMsg);

        // AI feedback
        if (msg.ai_response && Object.keys(msg.ai_response).length > 0) {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'ai-message';
            aiMsg.appendChild(buildFeedbackCard(msg.ai_response, msg.scores, prevScores));
            group.appendChild(aiMsg);
        }

        DOM.chatMessages.appendChild(group);
    }

    function buildFeedbackCard(response, currentScores, prevScores) {
        const card = document.createElement('div');
        card.className = 'ai-feedback-card';

        // 0. Conversational Reply
        if (response.conversational_reply) {
            card.appendChild(createFeedbackSection(
                '💬', 'Coach\'s Reply',
                `<div class="conversational-reply">${escapeHtml(response.conversational_reply)}</div>`,
                false
            ));
        }

        // 1. Grammar Corrections
        if (response.grammar_corrections && response.grammar_corrections.length > 0) {
            let grammarHtml = '';
            response.grammar_corrections.forEach(gc => {
                grammarHtml += `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(gc.original)}</div>
                        <div class="grammar-corrected">${escapeHtml(gc.corrected)}</div>
                        <div class="grammar-explanation">${escapeHtml(gc.explanation)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('🔍', 'Grammar Corrections', grammarHtml));
        } else {
            card.appendChild(createFeedbackSection(
                '🔍', 'Grammar Corrections',
                '<div style="color: var(--accent-success); font-size: 0.875rem;">✓ No grammar issues found. Great job!</div>'
            ));
        }

        // 1.5 Sentence Improvements
        if (response.sentence_improvements && response.sentence_improvements.length > 0) {
            let improvementHtml = '';
            response.sentence_improvements.forEach(si => {
                improvementHtml += `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(si.original)}</div>
                        <div class="grammar-corrected" style="color: var(--accent-secondary);">${escapeHtml(si.improved)}</div>
                        <div class="grammar-explanation">${escapeHtml(si.explanation)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('✨', 'Sentence Improvement', improvementHtml));
        }

        // 2. Native Speaker Versions
        if (response.native_versions && response.native_versions.length > 0) {
            let versionsHtml = '';
            response.native_versions.forEach((nv, idx) => {
                versionsHtml += `
                    <div class="native-version-item" style="${idx > 0 ? 'margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color);' : ''}">
                        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Version ${idx + 1}</div>
                        <div class="native-version-text">${escapeHtml(nv)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('🗣️', 'Native Speaker Versions', versionsHtml));
        } else if (response.native_version) {
            // Fallback for older conversation history
            card.appendChild(createFeedbackSection(
                '🗣️', 'Native Speaker Version',
                `<div class="native-version-text">${escapeHtml(response.native_version)}</div>`
            ));
        }

        // 3. Pronunciation Guidance
        if (response.pronunciation_guidance && response.pronunciation_guidance.length > 0) {
            let pronHtml = '';
            response.pronunciation_guidance.forEach(pg => {
                let spellingHtml = '';
                if (pg.spelling) {
                    spellingHtml = `<span class="pronunciation-spelling" style="font-family: 'Inter', sans-serif; font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-glass); padding: 2px 8px; border-radius: 4px;">${escapeHtml(pg.spelling)}</span>`;
                }
                pronHtml += `
                    <div class="pronunciation-item">
                        <span class="pronunciation-word">${escapeHtml(pg.word)}</span>
                        <span class="pronunciation-phonetic">${escapeHtml(pg.phonetic)}</span>
                        ${spellingHtml}
                        <div class="pronunciation-tip">${escapeHtml(pg.tip)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('🎯', 'Pronunciation Guidance', pronHtml));
        }

        // 4. Vocabulary Improvement
        if (response.vocabulary_improvements && response.vocabulary_improvements.length > 0) {
            let vocabHtml = '';
            response.vocabulary_improvements.forEach(vi => {
                let synonymsHtml = '';
                if (vi.synonyms && vi.synonyms.length > 0) {
                    synonymsHtml = `<div class="vocab-synonyms" style="width: 100%; font-size: 0.8rem; color: var(--accent-secondary); margin-top: 4px;">Synonyms: ${escapeHtml(vi.synonyms.join(', '))}</div>`;
                }
                vocabHtml += `
                    <div class="vocab-item">
                        <span class="vocab-original">${escapeHtml(vi.original)}</span>
                        <span class="vocab-arrow">→</span>
                        <span class="vocab-suggestion">${escapeHtml(vi.suggestion)}</span>
                        <button class="vocab-speak-btn" data-word="${escapeHtml(vi.suggestion)}" title="Listen to pronunciation">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                        </button>
                        ${synonymsHtml}
                        <div class="vocab-context">${escapeHtml(vi.context)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('📚', 'Vocabulary Improvement', vocabHtml));
        }

        // 5. Performance Rating
        if (response.performance_rating) {
            const pr = response.performance_rating;
            // Calculate overall score
            const overall = (pr.grammar * 0.40) + (pr.naturalness * 0.30) + (pr.vocabulary * 0.20) + (pr.confidence * 0.10);
            const overallRounded = Number(overall.toFixed(1));

            // Add to currentScores so backend saves it
            currentScores.overall = overallRounded;

            const scores = [
                { label: 'Overall', value: overallRounded, key: 'overall' },
                { label: 'Grammar', value: pr.grammar, key: 'grammar' },
                { label: 'Vocabulary', value: pr.vocabulary, key: 'vocabulary' },
                { label: 'Naturalness', value: pr.naturalness, key: 'naturalness' },
                { label: 'Confidence', value: pr.confidence, key: 'confidence' },
            ];

            let scoresHtml = '<div class="scores-grid">';
            scores.forEach(s => {
                const prev = prevScores ? prevScores[s.key] : null;
                let trendHtml = '';
                if (prev !== null && prev !== undefined) {
                    const diff = (s.value - prev).toFixed(1);
                    if (diff > 0) {
                        trendHtml = `<span class="score-trend up">+${diff}</span>`;
                    } else if (diff < 0) {
                        trendHtml = `<span class="score-trend down">${diff}</span>`;
                    } else {
                        trendHtml = `<span class="score-trend same">=</span>`;
                    }
                }
                const rowClass = s.key === 'overall' ? 'score-row overall-score' : 'score-row';
                scoresHtml += `
                    <div class="${rowClass}">
                        <span class="score-label">${s.label}</span>
                        <div class="score-bar-container">
                            <div class="score-bar" data-width="${(s.value / 10) * 100}%"></div>
                        </div>
                        <span class="score-value">${s.value}/10</span>
                        ${trendHtml}
                    </div>
                `;
            });
            scoresHtml += '</div>';
            card.appendChild(createFeedbackSection('📊', 'Performance Rating', scoresHtml));
        }

        // 6. Follow-up Question
        if (response.follow_up_question) {
            card.appendChild(createFeedbackSection(
                '💬', 'Let\'s Continue',
                `<div class="follow-up-text">${escapeHtml(response.follow_up_question)}</div>`,
                false
            ));
        }

        // Animate score bars after a short delay
        setTimeout(() => {
            card.querySelectorAll('.score-bar').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 200);

        return card;
    }

    function createFeedbackSection(icon, title, bodyHtml, collapsible = true) {
        const section = document.createElement('div');
        section.className = 'feedback-section';

        const toggleSvg = collapsible
            ? `<div class="feedback-toggle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
               </div>`
            : '';

        section.innerHTML = `
            <div class="feedback-header">
                <div class="feedback-icon">${icon}</div>
                <div class="feedback-title">${title}</div>
                ${toggleSvg}
            </div>
            <div class="feedback-body">${bodyHtml}</div>
        `;

        if (collapsible) {
            const header = section.querySelector('.feedback-header');
            const body = section.querySelector('.feedback-body');
            const toggle = section.querySelector('.feedback-toggle');

            header.addEventListener('click', () => {
                body.classList.toggle('collapsed');
                toggle.classList.toggle('collapsed');
            });
        }

        return section;
    }

    // ─── Send Message ───────────────────────────────────

    async function sendMessage() {
        const text = DOM.chatInput.value.trim();
        if (!text || state.isSending) return;

        // Check for API key
        const provider = state.settings.ai_provider;
        const apiKeyField = provider === 'gemini' ? 'gemini_api_key' : 'groq_api_key';
        const apiKey = state.settings[apiKeyField];

        if (!apiKey) {
            showToast(`Please set your ${provider === 'gemini' ? 'Gemini' : 'Groq'} API key in Settings.`, 'error');
            openSettings();
            return;
        }

        // Create conversation if needed
        if (!state.currentConversation) {
            await createConversation();
        }

        state.isSending = true;
        DOM.chatInput.value = '';
        DOM.chatInput.style.height = 'auto';
        DOM.sendBtn.disabled = true;

        // Show user message immediately
        const userMsgEl = document.createElement('div');
        userMsgEl.className = 'message-group';
        userMsgEl.style.animation = 'messageSlideIn 0.35s ease-out';
        userMsgEl.innerHTML = `
            <div class="user-message">
                <div class="user-bubble">${escapeHtml(text)}</div>
                <div class="user-message-time">just now</div>
            </div>
        `;
        DOM.chatMessages.appendChild(userMsgEl);

        // Show thinking indicator
        const thinkingEl = document.createElement('div');
        thinkingEl.className = 'ai-thinking';
        thinkingEl.innerHTML = `
            <div class="thinking-dots">
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
            </div>
            <span class="thinking-text">Analyzing your English...</span>
        `;
        DOM.chatMessages.appendChild(thinkingEl);
        scrollToBottom();

        try {
            // Get AI response
            const model = provider === 'gemini' ? state.settings.gemini_model : state.settings.groq_model;
            const aiProvider = ProviderFactory.create(provider, apiKey, model);
            const aiResponse = await aiProvider.sendMessage(text, state.currentMessages);

            // Extract scores
            const scores = aiResponse.performance_rating || {};
            if (scores.grammar !== undefined) {
                scores.overall = Number(((scores.grammar * 0.40) + (scores.naturalness * 0.30) + (scores.vocabulary * 0.20) + (scores.confidence * 0.10)).toFixed(1));
            }

            // Save to server
            const savedMsg = await api(
                `/api/conversations/${state.currentConversation.id}/messages/`,
                'POST',
                {
                    user_text: text,
                    ai_response: aiResponse,
                    scores: scores
                }
            );

            // Remove thinking indicator
            thinkingEl.remove();

            // Build and show AI feedback
            const aiMsgEl = document.createElement('div');
            aiMsgEl.className = 'ai-message';
            aiMsgEl.style.animation = 'messageSlideIn 0.35s ease-out';
            aiMsgEl.appendChild(buildFeedbackCard(aiResponse, scores, state.previousScores));
            userMsgEl.appendChild(aiMsgEl);

            // Update state
            state.currentMessages.push(savedMsg);
            state.previousScores = scores;

            // Update conversation title if first message
            if (state.currentMessages.length === 1) {
                const title = text.substring(0, 60) + (text.length > 60 ? '...' : '');
                state.currentConversation.title = title;
                DOM.chatTitle.textContent = title;

                const convo = state.conversations.find(c => c.id === state.currentConversation.id);
                if (convo) convo.title = title;
                renderConversationList();
            }

            scrollToBottom();

        } catch (err) {
            thinkingEl.remove();
            const errEl = document.createElement('div');
            errEl.className = 'ai-thinking';
            errEl.style.borderLeft = '3px solid var(--accent-error)';
            errEl.innerHTML = `<span style="color: var(--accent-error); font-size: 0.85rem;">⚠️ ${escapeHtml(err.message)}</span>`;
            DOM.chatMessages.appendChild(errEl);
            scrollToBottom();
        } finally {
            state.isSending = false;
            DOM.sendBtn.disabled = false;
        }
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
        });
    }

    // ─── Auto-resize textarea ────────────────────────────

    function initChatInput() {
        // Handle placeholder based on screen size
        const updatePlaceholder = () => {
            if (window.innerWidth <= 768) {
                DOM.chatInput.placeholder = "Type your message";
            } else {
                DOM.chatInput.placeholder = "Type your message in English...";
            }
        };
        window.addEventListener('resize', updatePlaceholder);
        updatePlaceholder(); // Call once on init

        DOM.chatInput.addEventListener('input', () => {
            DOM.chatInput.style.height = 'auto';
            DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + 'px';
        });

        DOM.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
                if (!isMobile) {
                    e.preventDefault();
                    sendMessage();
                }
            }
        });

        DOM.sendBtn.addEventListener('click', sendMessage);
    }

    // ═══════════════════════════════════════════════════════
    // VOICE INPUT
    // ═══════════════════════════════════════════════════════

    // ─── Voice provider routing ──────────────────────────

    function initVoice() {
        DOM.micBtn.addEventListener('click', toggleRecording);
        // Build browser STT once (reused when provider = browser)
        _initBrowserSpeechRecognition();
    }

    function _initBrowserSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        // Disable interim results on mobile to prevent Android Chrome duplication bugs
        const isMobile = window.matchMedia('(max-width: 768px)').matches || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = !isMobile;
        state.recognition.lang = 'en-US';

        state.recognition.onstart = () => {
            state.initialInputText = DOM.chatInput.value;
            state.finalTranscript = ''; // Track final parts separately
        };

        state.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    state.finalTranscript += text;
                } else {
                    interimTranscript += text;
                }
            }

            let transcript = state.finalTranscript + interimTranscript;
            let prefix = state.initialInputText || '';

            if (prefix && !prefix.endsWith(' ') && transcript && !transcript.startsWith(' ')) {
                prefix += ' ';
            }

            DOM.chatInput.value = prefix + transcript;
            DOM.chatInput.style.height = 'auto';
            DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + 'px';
        };

        state.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopRecording();
            if (event.error === 'not-allowed') {
                showToast('Microphone access denied. Please allow access in browser settings.', 'error');
            }
        };

        state.recognition.onend = () => {
            if (state.isRecording && state.settings.voice_provider === 'browser') {
                try { state.recognition.start(); } catch (e) { stopRecording(); }
            }
        };
    }

    function toggleRecording() {
        if (state.isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    function startRecording() {
        const provider = state.settings.voice_provider || 'browser';

        if (provider === 'browser') {
            if (!state.recognition) {
                showToast('Browser speech recognition is not supported. Switch to another provider in Settings.', 'error');
                return;
            }
            try {
                state.recognition.start();
            } catch (e) {
                showToast('Failed to start browser speech recognition.', 'error');
                return;
            }
            _setRecordingUI(true, 'Browser');

        } else if (provider === 'openai') {
            const apiKey = state.settings.openai_api_key;
            if (!apiKey) {
                showToast('Please set your OpenAI API key in Settings to use Whisper.', 'error');
                openSettings();
                return;
            }
            _startMediaRecorder('openai');

        } else if (provider === 'gemini-stt') {
            const apiKey = state.settings.gemini_api_key;
            if (!apiKey) {
                showToast('Please set your Gemini API key in Settings to use Gemini voice.', 'error');
                openSettings();
                return;
            }
            _startMediaRecorder('gemini-stt');
        }
    }

    function stopRecording() {
        const provider = state.settings.voice_provider || 'browser';

        if (provider === 'browser') {
            try { if (state.recognition) state.recognition.stop(); } catch (e) { /* ignore */ }
        } else {
            // Stop MediaRecorder — the onstop handler will fire and send audio to API
            if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
                state.mediaRecorder.stop();
            }
        }
        _setRecordingUI(false);
    }

    function _setRecordingUI(isRecording, providerLabel) {
        state.isRecording = isRecording;
        if (isRecording) {
            DOM.micBtn.classList.add('recording');
            DOM.micStatus.style.display = 'flex';
            DOM.micBtn.querySelector('.mic-icon-off').style.display = 'none';
            DOM.micBtn.querySelector('.mic-icon-on').style.display = 'block';
            // Show which provider is active
            let badge = DOM.micStatus.querySelector('.mic-provider-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'mic-provider-badge';
                DOM.micStatus.appendChild(badge);
            }
            badge.textContent = providerLabel || '';
        } else {
            DOM.micBtn.classList.remove('recording');
            DOM.micStatus.style.display = 'none';
            DOM.micBtn.querySelector('.mic-icon-off').style.display = 'block';
            DOM.micBtn.querySelector('.mic-icon-on').style.display = 'none';
        }
    }

    // ─── MediaRecorder-based recording (Whisper / Gemini) ──

    function _startMediaRecorder(targetProvider) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                state.initialInputText = DOM.chatInput.value;
                state.audioChunks = [];
                // Prefer webm/opus; fall back to whatever the browser offers
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

                const options = mimeType ? { mimeType } : {};
                state.mediaRecorder = new MediaRecorder(stream, options);

                state.mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) state.audioChunks.push(e.data);
                };

                state.mediaRecorder.onstop = async () => {
                    // Stop all tracks to release the microphone
                    stream.getTracks().forEach(t => t.stop());
                    const blob = new Blob(state.audioChunks, { type: mimeType || 'audio/webm' });
                    state.audioChunks = [];

                    if (blob.size === 0) return;

                    // Show "Transcribing..." indicator
                    DOM.micStatus.style.display = 'flex';
                    const statusSpan = DOM.micStatus.querySelector('span:not(.mic-provider-badge)');
                    if (statusSpan) statusSpan.textContent = 'Transcribing...';
                    DOM.micBtn.disabled = true;

                    try {
                        let transcript = '';
                        if (targetProvider === 'openai') {
                            transcript = await _transcribeWithWhisper(blob);
                        } else if (targetProvider === 'gemini-stt') {
                            transcript = await _transcribeWithGemini(blob);
                        }

                        if (transcript) {
                            let prefix = state.initialInputText || '';
                            if (prefix && !prefix.endsWith(' ') && transcript && !transcript.startsWith(' ')) {
                                prefix += ' ';
                            }
                            DOM.chatInput.value = prefix + transcript.trim();
                            DOM.chatInput.style.height = 'auto';
                            DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + 'px';
                            DOM.chatInput.focus();
                        }
                    } catch (err) {
                        showToast('Transcription failed: ' + err.message, 'error');
                    } finally {
                        DOM.micStatus.style.display = 'none';
                        if (statusSpan) statusSpan.textContent = 'Listening...';
                        DOM.micBtn.disabled = false;
                    }
                };

                state.mediaRecorder.start();
                const label = targetProvider === 'openai' ? 'Whisper' : 'Gemini';
                _setRecordingUI(true, label);
            })
            .catch(err => {
                if (err.name === 'NotAllowedError') {
                    showToast('Microphone access denied. Please allow access in browser settings.', 'error');
                } else {
                    showToast('Could not access microphone: ' + err.message, 'error');
                }
            });
    }

    // ─── OpenAI Whisper transcription ────────────────────

    async function _transcribeWithWhisper(audioBlob) {
        const formData = new FormData();
        // Whisper requires a filename with a supported extension
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
        formData.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.settings.openai_api_key}` },
            body: formData
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Whisper API error: ${res.status}`);
        }

        const data = await res.json();
        return data.text || '';
    }

    // ─── Gemini audio understanding transcription ─────────

    async function _transcribeWithGemini(audioBlob) {
        const apiKey = state.settings.gemini_api_key;
        const model = state.settings.gemini_model || 'gemini-2.0-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Convert blob to base64
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = '';
        uint8.forEach(b => binary += String.fromCharCode(b));
        const base64Data = btoa(binary);
        const mimeType = audioBlob.type || 'audio/webm';

        const body = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    },
                    {
                        text: 'Please transcribe this audio recording exactly as spoken. Return ONLY the spoken text, nothing else.'
                    }
                ]
            }],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 1024
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini STT error: ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // ═══════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════

    function openSettings() {
        DOM.settingsOverlay.style.display = 'block';
        DOM.settingsDrawer.classList.add('open');
    }

    function closeSettings() {
        DOM.settingsOverlay.style.display = 'none';
        DOM.settingsDrawer.classList.remove('open');
    }

    function applySettingsToUI() {
        DOM.geminiApiKey.value = state.settings.gemini_api_key || '';
        DOM.groqApiKey.value = state.settings.groq_api_key || '';
        DOM.openaiApiKey.value = state.settings.openai_api_key || '';

        // AI Provider radios
        const aiProvider = state.settings.ai_provider || 'gemini';
        const providerRadio = document.querySelector(`input[name="ai-provider"][value="${aiProvider}"]`);
        if (providerRadio) providerRadio.checked = true;
        _updateAiProviderUI(aiProvider);

        DOM.dailyWordGoalSelect.value = state.settings.daily_word_goal || '50';

        // Model selects
        DOM.geminiModelSelect.value = state.settings.gemini_model || 'gemini-2.0-flash';
        DOM.groqModelSelect.value = state.settings.groq_model || 'llama-3.3-70b-versatile';

        // Voice Provider radios
        const vp = state.settings.voice_provider || 'browser';
        const voiceRadio = document.querySelector(`input[name="voice-provider"][value="${vp}"]`);
        if (voiceRadio) voiceRadio.checked = true;
        _updateVoiceProviderUI(vp);
    }

    /** Show/hide the OpenAI key field and notice based on selected voice provider */
    function _updateVoiceProviderUI(provider) {
        DOM.openaiKeyGroup.style.display = provider === 'openai' ? 'block' : 'none';
        DOM.geminiSttNotice.style.display = provider === 'gemini-stt' ? 'flex' : 'none';
        DOM.voiceBrowserNotice.style.display = provider === 'browser' ? 'flex' : 'none';
    }

    /** Show/hide the AI Provider settings based on selected AI provider */
    function _updateAiProviderUI(provider) {
        const geminiContainer = document.getElementById('gemini-settings-container');
        const groqContainer = document.getElementById('groq-settings-container');
        if (geminiContainer) geminiContainer.style.display = provider === 'gemini' ? 'block' : 'none';
        if (groqContainer) groqContainer.style.display = provider === 'groq' ? 'block' : 'none';
    }

    async function saveSettings() {
        const provider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';
        const geminiKey = DOM.geminiApiKey.value.trim();
        const groqKey = DOM.groqApiKey.value.trim();
        const openaiKey = DOM.openaiApiKey.value.trim();
        const geminiModel = DOM.geminiModelSelect.value;
        const groqModel = DOM.groqModelSelect.value;
        const voiceProvider = document.querySelector('input[name="voice-provider"]:checked')?.value || 'browser';
        const dailyWordGoal = DOM.dailyWordGoalSelect.value;

        if (voiceProvider === 'openai' && !openaiKey) {
            showToast('OpenAI API key is required for Whisper voice input.', 'error');
            return;
        }
        if (voiceProvider === 'gemini-stt' && !geminiKey) {
            showToast('Gemini API key is required for Gemini voice input.', 'error');
            return;
        }

        state.settings.ai_provider = provider;
        state.settings.gemini_api_key = geminiKey;
        state.settings.groq_api_key = groqKey;
        state.settings.openai_api_key = openaiKey;
        state.settings.gemini_model = geminiModel;
        state.settings.groq_model = groqModel;
        state.settings.voice_provider = voiceProvider;

        // Save model selections to localStorage
        localStorage.setItem('uccharon_gemini_model', geminiModel);
        localStorage.setItem('uccharon_groq_model', groqModel);
        localStorage.setItem('uccharon_voice_provider', state.settings.voice_provider);
        localStorage.setItem('uccharon_openai_api_key', openaiKey);

        DOM.saveSettingsBtn.classList.add('btn-loading');
        DOM.saveSettingsBtn.disabled = true;

        try {
            await api('/api/settings/', 'PUT', {
                ai_provider: provider,
                gemini_api_key: geminiKey,
                groq_api_key: groqKey,
                daily_word_goal: dailyWordGoal
            });
            state.settings.daily_word_goal = parseInt(dailyWordGoal);
            showToast('Settings saved successfully!', 'success');
            closeSettings();
        } catch (err) {
            showToast('Failed to save settings', 'error');
        } finally {
            DOM.saveSettingsBtn.classList.remove('btn-loading');
            DOM.saveSettingsBtn.disabled = false;
        }
    }

    function initSettings() {
        DOM.settingsBtn.addEventListener('click', openSettings);
        DOM.closeSettings.addEventListener('click', closeSettings);
        DOM.settingsOverlay.addEventListener('click', closeSettings);
        DOM.saveSettingsBtn.addEventListener('click', saveSettings);

        // Toggle API key visibility (handles all .toggle-key-vis buttons incl. OpenAI)
        document.querySelectorAll('.toggle-key-vis').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById(btn.dataset.target);
                if (input) input.type = input.type === 'password' ? 'text' : 'password';
            });
        });

        // Show/hide OpenAI key field when voice provider changes
        document.querySelectorAll('input[name="voice-provider"]').forEach(radio => {
            radio.addEventListener('change', () => {
                _updateVoiceProviderUI(radio.value);
            });
        });

        // Show/hide AI Provider settings when AI provider changes
        document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
            radio.addEventListener('change', () => {
                _updateAiProviderUI(radio.value);
            });
        });
    }

    // ═══════════════════════════════════════════════════════
    // DASHBOARD & STATS
    // ═══════════════════════════════════════════════════════

    async function showDashboard() {
        DOM.welcomeScreen.style.display = 'none';
        DOM.chatArea.style.display = 'none';
        DOM.dashboardScreen.style.display = 'flex';

        // Close mobile sidebar
        DOM.sidebar.classList.remove('mobile-open');
        DOM.sidebarOverlay.classList.remove('active');

        // Clear active conversation selection
        state.currentConversation = null;
        document.querySelectorAll('.convo-item').forEach(el => el.classList.remove('active'));

        await loadDashboardData(state.dashboardRange);
    }

    async function loadDashboardData(range) {
        state.dashboardRange = range;

        // Update tabs UI
        document.querySelectorAll('.time-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.range === range);
        });

        DOM.dashLoading.style.display = 'flex';
        DOM.dashEmpty.style.display = 'none';
        DOM.dashData.style.display = 'none';

        try {
            const data = await api(`/api/stats/?range=${range}`);

            if (data.total_messages === 0) {
                DOM.dashLoading.style.display = 'none';
                DOM.dashEmpty.style.display = 'block';
                return;
            }

            renderDashboard(data);
            DOM.dashLoading.style.display = 'none';
            DOM.dashData.style.display = 'block';

        } catch (err) {
            console.error(err);
            DOM.dashLoading.style.display = 'none';
            showToast('Failed to load analytics', 'error');
        }
    }

    function renderDashboard(data) {
        // Summary Cards
        DOM.dashTodayProgress.textContent = `${data.today_words}/${data.today_goal}`;
        animateCounter(DOM.dashStreak, data.streak);
        animateCounter(DOM.dashMaxStreak, data.max_streak);
        animateCounter(DOM.dashTotalMessages, data.total_messages);
        animateCounter(DOM.dashTotalConvos, data.total_conversations);
        animateCounter(DOM.dashOverallScore, data.averages.overall, true);

        // Score Breakdowns (Averages)
        renderScoreGrid(DOM.dashAvgScores, [
            { label: 'Grammar', value: data.averages.grammar },
            { label: 'Vocabulary', value: data.averages.vocabulary },
            { label: 'Naturalness', value: data.averages.naturalness },
            { label: 'Confidence', value: data.averages.confidence }
        ]);

        // Score Breakdowns (Bests)
        renderScoreGrid(DOM.dashBestScores, [
            { label: 'Grammar', value: data.best_scores.grammar },
            { label: 'Vocabulary', value: data.best_scores.vocabulary },
            { label: 'Naturalness', value: data.best_scores.naturalness },
            { label: 'Confidence', value: data.best_scores.confidence }
        ]);

        // Charts
        renderCharts(data);
    }

    function animateCounter(element, target, isDecimal = false) {
        const start = 0;
        const duration = 1000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing (easeOutExpo)
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            const current = start + (target - start) * easeProgress;

            element.textContent = isDecimal ? current.toFixed(1) : Math.round(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    }

    function renderScoreGrid(container, scores) {
        container.innerHTML = '';
        scores.forEach(s => {
            container.innerHTML += `
                <div class="score-row">
                    <span class="score-label">${s.label}</span>
                    <div class="score-bar-container">
                        <div class="score-bar" data-width="${(s.value / 10) * 100}%" style="width:0"></div>
                    </div>
                    <span class="score-value">${s.value}${s.value % 1 === 0 ? '.0' : ''}</span>
                </div>
            `;
        });

        setTimeout(() => {
            container.querySelectorAll('.score-bar').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 100);
    }

    // Charting Configuration and Rendering
    const chartTheme = {
        get colors() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            return {
                text: isDark ? '#f0f0f8' : '#1a1a2e',
                grid: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                accent: isDark ? 'rgba(108, 92, 231, 0.8)' : 'rgba(95, 61, 196, 0.8)',
                accentBg: isDark ? 'rgba(108, 92, 231, 0.2)' : 'rgba(95, 61, 196, 0.2)',
                secondary: isDark ? 'rgba(0, 206, 201, 0.8)' : 'rgba(12, 166, 161, 0.8)',
            };
        }
    };

    function updateChartColors() {
        if (!state.radarChart || !state.lineChart) return;

        const colors = chartTheme.colors;

        // Update Radar Chart
        state.radarChart.options.scales.r.grid.color = colors.grid;
        state.radarChart.options.scales.r.angleLines.color = colors.grid;
        state.radarChart.options.scales.r.pointLabels.color = colors.text;
        state.radarChart.options.scales.r.ticks.backdropColor = 'transparent';
        state.radarChart.options.scales.r.ticks.color = colors.text;

        // Update Line Chart
        state.lineChart.options.scales.x.grid.color = colors.grid;
        state.lineChart.options.scales.y.grid.color = colors.grid;
        state.lineChart.options.scales.x.ticks.color = colors.text;
        state.lineChart.options.scales.y.ticks.color = colors.text;

        state.radarChart.update();
        state.lineChart.update();
    }

    function renderCharts(data) {
        if (!window.Chart) return;
        const colors = chartTheme.colors;

        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = colors.text;

        // Destroy existing charts
        if (state.radarChart) state.radarChart.destroy();
        if (state.lineChart) state.lineChart.destroy();

        // Radar Chart
        const radarCtx = document.getElementById('radar-chart');
        if (radarCtx) {
            state.radarChart = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: ['Grammar', 'Vocabulary', 'Naturalness', 'Confidence'],
                    datasets: [{
                        label: 'Average Score',
                        data: [
                            data.averages.grammar,
                            data.averages.vocabulary,
                            data.averages.naturalness,
                            data.averages.confidence
                        ],
                        backgroundColor: colors.accentBg,
                        borderColor: colors.accent,
                        pointBackgroundColor: colors.accent,
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: colors.accent,
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        r: {
                            min: 0,
                            max: 10,
                            ticks: { stepSize: 2, display: false, backdropColor: 'transparent' },
                            grid: { color: colors.grid },
                            angleLines: { color: colors.grid },
                            pointLabels: { font: { size: 12, weight: 600 }, color: colors.text }
                        }
                    }
                }
            });
        }

        // Line Chart
        const lineCtx = document.getElementById('line-chart');
        if (lineCtx && data.daily_scores) {
            const labels = data.daily_scores.map(d => {
                const date = new Date(d.date);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            });
            const overallData = data.daily_scores.map(d => d.overall);

            state.lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Overall Score',
                        data: overallData,
                        borderColor: colors.secondary,
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                            gradient.addColorStop(0, isDark() ? 'rgba(0, 206, 201, 0.4)' : 'rgba(12, 166, 161, 0.4)');
                            gradient.addColorStop(1, isDark() ? 'rgba(0, 206, 201, 0.0)' : 'rgba(12, 166, 161, 0.0)');
                            return gradient;
                        },
                        borderWidth: 3,
                        pointBackgroundColor: colors.secondary,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: isDark() ? 'rgba(18, 18, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                            titleColor: isDark() ? '#fff' : '#000',
                            bodyColor: isDark() ? '#fff' : '#000',
                            borderColor: isDark() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            borderWidth: 1,
                            padding: 10
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 10,
                            grid: { color: colors.grid, drawBorder: false },
                            ticks: { color: colors.text, padding: 10 }
                        },
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: colors.text, maxTicksLimit: 7 }
                        }
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                }
            });
        }
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function initDashboard() {
        DOM.statsBtn.addEventListener('click', showDashboard);

        DOM.timeRangeTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('time-tab')) {
                loadDashboardData(e.target.dataset.range);
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    // SIDEBAR
    // ═══════════════════════════════════════════════════════

    function initSidebar() {
        DOM.sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.matchMedia('(max-width: 768px)').matches) {
                DOM.sidebar.classList.remove('mobile-open');
                DOM.sidebarOverlay.classList.remove('active');
            } else {
                DOM.sidebar.classList.toggle('collapsed');
            }
        });

        DOM.mobileSidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent document click from immediately closing it
            if (window.matchMedia('(max-width: 768px)').matches) {
                DOM.sidebar.classList.toggle('mobile-open');
                DOM.sidebarOverlay.classList.toggle('active');
                DOM.sidebar.classList.remove('collapsed'); // ensure no conflict
            } else {
                DOM.sidebar.classList.toggle('collapsed');
            }
        });

        // Close mobile sidebar on overlay click or outside click
        document.addEventListener('click', (e) => {
            if (DOM.sidebar.classList.contains('mobile-open') &&
                !DOM.sidebar.contains(e.target) &&
                e.target !== DOM.mobileSidebarToggle &&
                !DOM.mobileSidebarToggle.contains(e.target) &&
                !DOM.settingsDrawer.contains(e.target) &&
                e.target !== DOM.settingsOverlay) {
                DOM.sidebar.classList.remove('mobile-open');
                DOM.sidebarOverlay.classList.remove('active');
            }
        });

        DOM.newChatBtn.addEventListener('click', createConversation);
        DOM.welcomeNewChat.addEventListener('click', createConversation);
        DOM.deleteConvoBtn.addEventListener('click', deleteConversation);
    }

    // ═══════════════════════════════════════════════════════
    // ESCAPE HTML
    // ═══════════════════════════════════════════════════════

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════

    function init() {
        initAuth();
        initChatInput();
        initVoice();
        initSettings();
        initSidebar();
        initDashboard();

        // Init Speech Synthesis for Vocabulary
        document.getElementById('chat-messages').addEventListener('click', (e) => {
            const speakBtn = e.target.closest('.vocab-speak-btn');
            if (speakBtn) {
                const word = speakBtn.getAttribute('data-word');
                if (word && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(word);
                    utterance.lang = 'en-US';
                    
                    const voices = window.speechSynthesis.getVoices();
                    const preferredVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en-GB'));
                    if (preferredVoice) {
                        utterance.voice = preferredVoice;
                    }
                    
                    window.speechSynthesis.speak(utterance);
                    
                    speakBtn.classList.add('playing');
                    utterance.onend = () => speakBtn.classList.remove('playing');
                    utterance.onerror = () => speakBtn.classList.remove('playing');
                }
            }
        });

        // Theme toggle
        DOM.themeToggleBtn.addEventListener('click', toggleTheme);

        // Logout
        DOM.logoutBtn.addEventListener('click', handleLogout);

        // Check existing auth
        checkAuth();
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);

})();
