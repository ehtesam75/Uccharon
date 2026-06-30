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
        previousScores: null
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
        loginForm: $('#login-form'),
        signupForm: $('#signup-form'),
        loginUsername: $('#login-username'),
        loginPassword: $('#login-password'),
        loginBtn: $('#login-btn'),
        loginError: $('#login-error'),
        signupUsername: $('#signup-username'),
        signupEmail: $('#signup-email'),
        signupPassword: $('#signup-password'),
        signupBtn: $('#signup-btn'),
        signupError: $('#signup-error'),
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

        // Stats
        statsBtn: $('#stats-btn'),
        statsOverlay: $('#stats-overlay'),
        statsModal: $('#stats-modal'),
        closeStats: $('#close-stats'),
        statsContent: $('#stats-content'),

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
            DOM.signupForm.style.animation = 'cardSlideUp 0.4s ease-out';
        });

        DOM.showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.signupForm.style.display = 'none';
            DOM.loginForm.style.display = 'block';
            DOM.loginForm.style.animation = 'cardSlideUp 0.4s ease-out';
        });

        DOM.loginBtn.addEventListener('click', handleLogin);
        DOM.signupBtn.addEventListener('click', handleSignup);

        // Enter key support
        DOM.loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        DOM.signupPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignup();
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

    async function handleSignup() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;

        if (!username || !email || !password) {
            showAuthError('signup', 'Please fill in all fields.');
            return;
        }

        DOM.signupBtn.classList.add('btn-loading');
        DOM.signupBtn.disabled = true;

        try {
            const data = await api('/api/auth/signup/', 'POST', { username, email, password });
            state.user = data.user;
            await loadUserData();
            showApp();
        } catch (err) {
            showAuthError('signup', err.message);
        } finally {
            DOM.signupBtn.classList.remove('btn-loading');
            DOM.signupBtn.disabled = false;
        }
    }

    function showAuthError(form, message) {
        const el = form === 'login' ? DOM.loginError : DOM.signupError;
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
            }
        } catch (e) {
            // Not logged in, show auth screen
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
                pronHtml += `
                    <div class="pronunciation-item">
                        <span class="pronunciation-word">${escapeHtml(pg.word)}</span>
                        <span class="pronunciation-phonetic">${escapeHtml(pg.phonetic)}</span>
                        <span class="pronunciation-tip">${escapeHtml(pg.tip)}</span>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('🎯', 'Pronunciation Guidance', pronHtml));
        }

        // 4. Vocabulary Improvement
        if (response.vocabulary_improvements && response.vocabulary_improvements.length > 0) {
            let vocabHtml = '';
            response.vocabulary_improvements.forEach(vi => {
                vocabHtml += `
                    <div class="vocab-item">
                        <span class="vocab-original">${escapeHtml(vi.original)}</span>
                        <span class="vocab-arrow">→</span>
                        <span class="vocab-suggestion">${escapeHtml(vi.suggestion)}</span>
                        <span class="vocab-context">${escapeHtml(vi.context)}</span>
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
                scoresHtml += `
                    <div class="score-row">
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
        DOM.chatInput.addEventListener('input', () => {
            DOM.chatInput.style.height = 'auto';
            DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + 'px';
        });

        DOM.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
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

        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = true;
        state.recognition.lang = 'en-US';

        state.recognition.onstart = () => {
            state.initialInputText = DOM.chatInput.value;
        };

        state.recognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            
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
            });
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
    // STATS
    // ═══════════════════════════════════════════════════════

    async function openStats() {
        DOM.statsOverlay.style.display = 'block';
        DOM.statsModal.classList.add('open');

        DOM.statsContent.innerHTML = '<div class="stats-empty"><div class="stats-empty-icon">⏳</div>Loading stats...</div>';

        try {
            const data = await api('/api/stats/');

            if (data.total_messages === 0) {
                DOM.statsContent.innerHTML = `
                    <div class="stats-empty">
                        <div class="stats-empty-icon">📊</div>
                        <p>No performance data yet.</p>
                        <p style="font-size: 0.8rem; margin-top: 8px; color: var(--text-tertiary);">Start a conversation to track your progress!</p>
                    </div>
                `;
                return;
            }

            const avgScores = [
                { label: 'Overall', value: data.averages.overall },
                { label: 'Grammar', value: data.averages.grammar },
                { label: 'Vocabulary', value: data.averages.vocabulary },
                { label: 'Naturalness', value: data.averages.naturalness },
                { label: 'Confidence', value: data.averages.confidence },
            ];

            let scoresHtml = '';
            avgScores.forEach(s => {
                scoresHtml += `
                    <div class="score-row">
                        <span class="score-label">${s.label}</span>
                        <div class="score-bar-container">
                            <div class="score-bar" data-width="${(s.value / 10) * 100}%" style="width:0"></div>
                        </div>
                        <span class="score-value">${s.value}/10</span>
                    </div>
                `;
            });

            DOM.statsContent.innerHTML = `
                <div class="stats-summary">
                    <div class="stat-card">
                        <div class="stat-number">${data.total_messages}</div>
                        <div class="stat-label">Messages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${data.total_conversations}</div>
                        <div class="stat-label">Conversations</div>
                    </div>
                </div>
                <div class="stats-averages">
                    <h3>Average Scores</h3>
                    <div class="scores-grid">${scoresHtml}</div>
                </div>
            `;

            // Animate bars
            setTimeout(() => {
                DOM.statsContent.querySelectorAll('.score-bar').forEach(bar => {
                    bar.style.width = bar.dataset.width;
                });
            }, 200);

        } catch (err) {
            DOM.statsContent.innerHTML = `
                <div class="stats-empty">
                    <div class="stats-empty-icon">⚠️</div>
                    <p>Failed to load stats.</p>
                </div>
            `;
        }
    }

    function closeStats() {
        DOM.statsOverlay.style.display = 'none';
        DOM.statsModal.classList.remove('open');
    }

    // ═══════════════════════════════════════════════════════
    // SIDEBAR
    // ═══════════════════════════════════════════════════════

    function initSidebar() {
        DOM.sidebarToggle.addEventListener('click', () => {
            DOM.sidebar.classList.toggle('collapsed');
        });

        DOM.mobileSidebarToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                DOM.sidebar.classList.toggle('mobile-open');
                DOM.sidebarOverlay.classList.toggle('active');
            } else {
                DOM.sidebar.classList.toggle('collapsed');
            }
        });

        // Close mobile sidebar on overlay click or outside click
        document.addEventListener('click', (e) => {
            if (DOM.sidebar.classList.contains('mobile-open') &&
                !DOM.sidebar.contains(e.target) &&
                e.target !== DOM.mobileSidebarToggle &&
                !DOM.mobileSidebarToggle.contains(e.target)) {
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

        // Theme toggle
        DOM.themeToggleBtn.addEventListener('click', toggleTheme);

        // Logout
        DOM.logoutBtn.addEventListener('click', handleLogout);

        // Stats
        DOM.statsBtn.addEventListener('click', openStats);
        DOM.closeStats.addEventListener('click', closeStats);
        DOM.statsOverlay.addEventListener('click', closeStats);

        // Check existing auth
        checkAuth();
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);

})();
