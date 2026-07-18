/**
 * Uccharon - AI English Speaking Coach
 * escapeHtml, init() wiring, and DOMContentLoaded bootstrap
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // ESCAPE HTML
    // ═══════════════════════════════════════════════════════

    // Escape a string for safe interpolation into BOTH HTML text nodes AND
    // double/single-quoted HTML attribute values.
    //
    // The previous implementation used `div.textContent = text; return
    // div.innerHTML;`. That escapes `&`, `<`, and `>` but NOT quotes — which is
    // unsafe because the value is frequently interpolated into quoted attributes
    // (e.g. `data-word="${escapeHtml(...)}"`). A payload containing a `"` could
    // break out of the attribute and inject new attributes/handlers.
    //
    // This version explicitly escapes all five HTML-significant characters via a
    // pure string replacement, so it is safe in every context (text + single- or
    // double-quoted attributes) and does not depend on the DOM (making it
    // unit-testable and immune to any DOM-based quirks).
    const _HTML_ESCAPE_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    function escapeHtml(text) {
        if (text === null || text === undefined || text === '') return '';
        return String(text).replace(/[&<>"']/g, (ch) => _HTML_ESCAPE_MAP[ch]);
    }

    // ═══════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════

    function init() {
        initAuth();
        initChatInput();
        initConversationRename();
        initVoice();
        initSettings();
        initSidebar();
        initDashboard();
        initLearningHistory();

        updateScrollToBottomButton();

        // Init Speech Synthesis for Vocabulary and Pronunciation
        document.body.addEventListener('click', (e) => {
            const speakBtn = e.target.closest('.vocab-speak-btn');
            if (speakBtn) {
                const word = speakBtn.getAttribute('data-word');
                if (word && 'speechSynthesis' in window) {
                    const speakerIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
                    const stopIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>`;
                    
                    const resetAllButtons = () => {
                        document.querySelectorAll('.vocab-speak-btn.playing').forEach(b => {
                            b.classList.remove('playing');
                            b.innerHTML = speakerIcon;
                        });
                    };

                    if (speakBtn.classList.contains('playing') && window.speechSynthesis.speaking) {
                        window.speechSynthesis.cancel();
                        resetAllButtons();
                        return;
                    }

                    window.speechSynthesis.cancel();
                    resetAllButtons();
                    
                    const utterance = new SpeechSynthesisUtterance(word);
                    utterance.lang = 'en-US';
                    
                    const voices = window.speechSynthesis.getVoices();
                    const preferredVoice = voices.find(v => v.lang.startsWith('en-US')) || voices.find(v => v.lang.startsWith('en-GB'));
                    if (preferredVoice) {
                        utterance.voice = preferredVoice;
                    }
                    
                    window.speechSynthesis.speak(utterance);
                    
                    speakBtn.classList.add('playing');
                    speakBtn.innerHTML = stopIcon;
                    
                    utterance.onend = () => {
                        speakBtn.classList.remove('playing');
                        speakBtn.innerHTML = speakerIcon;
                    };
                    utterance.onerror = () => {
                        speakBtn.classList.remove('playing');
                        speakBtn.innerHTML = speakerIcon;
                    };
                }
            }
        });

        // Theme toggle (in-app)
        DOM.themeToggleBtn.addEventListener('click', toggleTheme);

        // Auth-screen theme toggle + shared theme sync with the homepage
        initAuthTheme();

        // Logout
        DOM.logoutBtn.addEventListener('click', handleLogout);

        // If arriving from the homepage's "Get Started" link (/app/?auth=signup),
        // open the signup form once the auth screen is shown.
        handleAuthIntent();

        // Check existing auth
        checkAuth();
    }

    // Open the signup flow directly when ?auth=signup is present in the URL.
    function handleAuthIntent() {
        let intent = null;
        try {
            intent = new URLSearchParams(window.location.search).get('auth');
        } catch (e) { /* ignore */ }
        if (intent !== 'signup') return;

        // Defer until after checkAuth decides whether to show the auth screen.
        // Only open signup for logged-out visitors.
        setTimeout(() => {
            if (state.user) return;
            if (DOM.authScreen && DOM.showSignup) {
                DOM.authScreen.style.display = 'flex';
                DOM.showSignup.click();
            }
        }, 400);
    }


    // Start the app
    document.addEventListener('DOMContentLoaded', init);
