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

        // Theme continuity: the shared localStorage value reflects the most
        // recent choice made anywhere (public homepage, auth screen, or app).
        // Prefer it over the server value so a theme picked on the homepage
        // carries into the logged-in app. If it differs from the server, sync
        // it back so the choice persists across sessions and devices.
        const storedTheme = getStoredTheme();
        const effectiveTheme = storedTheme || state.settings.theme;
        if (storedTheme && state.user && storedTheme !== state.settings.theme) {
            api('/api/settings/', 'PUT', { theme: storedTheme }).catch(() => { });
        }
        applyTheme(effectiveTheme);
        applySettingsToUI();
        updateScrollToBottomButton();
    }


    function hideGlobalSplash() {
        const splash = document.getElementById('global-splash');
        if (splash && !splash.classList.contains('hidden')) {
            splash.classList.add('hidden');
        }
        // Keep the element in the DOM (hidden) so it can be reused to cover the
        // screen instantly during logout, avoiding a flash of the logged-in UI.
    }

    // Instantly cover the whole screen with the branded splash. Used on logout
    // so the logged-in UI is never visible while auth requests are in flight or
    // during navigation to the public homepage.
    function showGlobalSplash() {
        const splash = document.getElementById('global-splash');
        if (splash) {
            splash.classList.remove('hidden');
        }
    }


    async function loadUserData(skipAutoSelect = false) {
        try {
            const settingsData = await api('/api/settings/');
            state.settings = { ...state.settings, ...settingsData };
            // API keys live ONLY on the device — load them from local storage.
            loadLocalApiKeys(state.user?.id);

            state.settings.gemini_model = localStorage.getItem('uccharon_gemini_model') || 'gemini-2.0-flash';
            state.settings.groq_model = localStorage.getItem('uccharon_groq_model') || 'llama-3.3-70b-versatile';
            state.settings.openrouter_model = localStorage.getItem('uccharon_openrouter_model') || 'meta-llama/llama-3.3-70b-instruct';

            state.settings.voice_provider = localStorage.getItem('uccharon_voice_provider') || 'groq-whisper';
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

    // Read the shared theme from localStorage (the single source of truth that
    // the public homepage, auth screen, and app all write to). Returns 'light',
    // 'dark', or null if nothing valid is stored.
    function getStoredTheme() {
        try {
            const stored = localStorage.getItem('uccharon_theme');
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (e) { /* ignore */ }
        return null;
    }

    function applyTheme(theme) {

        document.documentElement.setAttribute('data-theme', theme);
        state.settings.theme = theme;

        // Persist so the public homepage and the auth screen stay in sync.
        try { localStorage.setItem('uccharon_theme', theme); } catch (e) { /* ignore */ }

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'dark' ? '#12122A' : '#d9b97aff');
        }

        const darkIcon = $('.theme-icon-dark');
        const lightIcon = $('.theme-icon-light');
        if (darkIcon && lightIcon) {
            if (theme === 'dark') {
                darkIcon.style.display = 'block';
                lightIcon.style.display = 'none';
            } else {
                darkIcon.style.display = 'none';
                lightIcon.style.display = 'block';
            }
        }

        syncAuthThemeIcons(theme);
    }

    // Reflect the current theme on the auth-screen toggle icons.
    function syncAuthThemeIcons(theme) {
        if (!DOM.authThemeIconDark || !DOM.authThemeIconLight) return;
        if (theme === 'dark') {
            DOM.authThemeIconDark.style.display = 'block';
            DOM.authThemeIconLight.style.display = 'none';
        } else {
            DOM.authThemeIconDark.style.display = 'none';
            DOM.authThemeIconLight.style.display = 'block';
        }
    }

    // Read the shared theme (localStorage) and apply it before login so the
    // auth screen matches the homepage. Also wires the auth theme toggle.
    function initAuthTheme() {
        let theme = 'dark';
        try {
            const stored = localStorage.getItem('uccharon_theme');
            if (stored === 'light' || stored === 'dark') theme = stored;
        } catch (e) { /* ignore */ }

        applyTheme(theme);

        if (DOM.authThemeToggle) {
            DOM.authThemeToggle.addEventListener('click', () => {
                const newTheme = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
                applyTheme(newTheme);
                // Persist to the server too, if the user is already authenticated.
                if (state.user) {
                    api('/api/settings/', 'PUT', { theme: newTheme }).catch(() => { });
                }
            });
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

