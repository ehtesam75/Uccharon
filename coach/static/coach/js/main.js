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

        // Theme toggle
        DOM.themeToggleBtn.addEventListener('click', toggleTheme);

        // Logout
        DOM.logoutBtn.addEventListener('click', handleLogout);

        // Check existing auth
        checkAuth();
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);
