/**
 * Uccharon - AI English Speaking Coach
 * App initialization and theme handling
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // APP INITIALIZATION
    // ═══════════════════════════════════════════════════════

    function showApp() {
        DOM.authScreen.style.display = 'none';
        DOM.app.style.display = 'flex';
        hideGlobalSplash();
        updateUserInfo();
        applyTheme(state.settings.theme);
        applySettingsToUI();
        updateScrollToBottomButton();
    }

    function hideGlobalSplash() {
        const splash = document.getElementById('global-splash');
        if (splash && !splash.classList.contains('hidden')) {
            splash.classList.add('hidden');
            setTimeout(() => splash.remove(), 400); // Remove from DOM after fade out
        }
    }

    async function loadUserData(skipAutoSelect = false) {
        try {
            const settingsData = await api('/api/settings/');
            state.settings = { ...state.settings, ...settingsData };
            state.settings.gemini_model = localStorage.getItem('uccharon_gemini_model') || 'gemini-2.0-flash';
            state.settings.groq_model = localStorage.getItem('uccharon_groq_model') || 'llama-3.3-70b-versatile';
            state.settings.openrouter_model = localStorage.getItem('uccharon_openrouter_model') || 'meta-llama/llama-3.3-70b-instruct';

            state.settings.voice_provider = localStorage.getItem('uccharon_voice_provider') || 'groq-whisper';
            state.settings.openai_api_key = localStorage.getItem('uccharon_openai_api_key') || '';
            state.settings.groq_whisper_model = localStorage.getItem('uccharon_groq_whisper_model') || 'whisper-large-v3-turbo';
        } catch (e) { /* ignore */ }
        await loadConversations(skipAutoSelect);

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

