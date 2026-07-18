/**
 * Uccharon - AI English Speaking Coach
 * Learning history view
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // LEARNING HISTORY
    // ═══════════════════════════════════════════════════════

    async function showLearningHistory() {
        // Navigating to Learning History cancels any in-flight AI generation and
        // restores the Send button immediately so it never lingers as a Stop button.
        cancelActiveGeneration();

        // Delete empty conversation before navigating away
        if (state.currentConversation && state.currentMessages.length === 0) {
            void deleteConversationById(state.currentConversation.id);
        }


        DOM.welcomeScreen.style.display = 'none';
        DOM.chatArea.style.display = 'none';
        DOM.dashboardScreen.style.display = 'none';
        DOM.learningHistoryScreen.style.display = 'flex';
        updateScrollToBottomButton();

        // Remember that the user is on Learning History so a refresh reopens it
        setPersistedView('history');
        clearPersistedConversationId();

        // Close mobile sidebar
        closeMobileSidebar();

        // Clear active conversation selection
        state.currentConversation = null;
        document.querySelectorAll('.convo-item').forEach(el => el.classList.remove('active'));

        // Reset filter to 'All' on every page entry
        state.learningHistoryFilter = 'all';
        document.querySelectorAll('#history-filter-tabs .time-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.filter === 'all');
        });

        await loadLearningHistoryData();
    }

    async function loadLearningHistoryData() {
        DOM.historyLoading.style.display = 'flex';
        DOM.historyEmpty.style.display = 'none';
        DOM.learningHistoryData.style.display = 'none';

        try {
            const data = await api('/api/learning-history/');
            state.learningHistory = data.items || [];
            
            if (state.learningHistory.length === 0) {
                DOM.historyLoading.style.display = 'none';
                DOM.historyEmpty.style.display = 'block';
                return;
            }

            renderLearningHistory();
            DOM.historyLoading.style.display = 'none';
            DOM.learningHistoryData.style.display = 'block';
        } catch (err) {
            console.error(err);
            DOM.historyLoading.style.display = 'none';
            showToast('Failed to load learning history', 'error');
        }
    }

    function renderLearningHistory() {
        const filter = state.learningHistoryFilter;
        let items = state.learningHistory;
        
        if (filter !== 'all') {
            items = items.filter(item => item.type === filter);
        }
        
        DOM.learningHistoryList.innerHTML = '';
        
        if (items.length === 0) {
            DOM.learningHistoryList.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-tertiary); padding: 40px;">No ${filter} history found.</div>`;
            return;
        }
        
        function timeAgo(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const seconds = Math.floor((now - date) / 1000);
            if (seconds < 60) return 'Just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            return `${days}d ago`;
        }
        
        items.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.style.animationDelay = `${index * 0.05}s`;
            
            let icon = '';
            let title = '';
            let bodyHtml = '';
            
            if (item.type === 'grammar') {
                icon = '🔍'; title = 'Grammar Correction';
                bodyHtml = `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(item.original)}</div>
                        <div class="grammar-corrected">${escapeHtml(item.suggestion)}</div>
                        ${item.explanation ? `<div class="grammar-explanation">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>`;
            } else if (item.type === 'mechanics') {
                icon = '✏️'; title = 'Mechanics Correction';
                bodyHtml = `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(item.original)}</div>
                        <div class="grammar-corrected">${escapeHtml(item.suggestion)}</div>
                        ${item.explanation ? `<div class="grammar-explanation">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>`;
            } else if (item.type === 'sentence') {
                icon = '✨'; title = 'Sentence Improvement';

                bodyHtml = `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(item.original)}</div>
                        <div class="grammar-corrected" style="color: var(--accent-secondary);">${escapeHtml(item.suggestion)}</div>
                        ${item.explanation ? `<div class="grammar-explanation">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>`;
            } else if (item.type === 'vocabulary') {
                icon = '📚'; title = 'Vocabulary Improvement';
                let synonymsHtml = '';
                if (item.synonyms && item.synonyms.length > 0) {
                    synonymsHtml = `<div class="vocab-synonyms" style="width: 100%; font-size: 0.8rem; color: var(--accent-secondary); margin-top: 4px;">Synonyms: ${escapeHtml(item.synonyms.join(', '))}</div>`;
                }
                bodyHtml = `
                    <div class="vocab-item">
                        <span class="vocab-original">${escapeHtml(item.original)}</span>
                        <span class="vocab-arrow">→</span>
                        <span class="vocab-suggestion">${escapeHtml(item.suggestion)}</span>
                        ${synonymsHtml}
                        ${item.explanation ? `<div class="vocab-context">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>`;
            } else if (item.type === 'pronunciation') {
                icon = '🎯'; title = 'Pronunciation Guidance';
                bodyHtml = `
                    <div class="pronunciation-item">
                        <span class="pronunciation-word">${escapeHtml(item.original)}</span>
                        <button class="vocab-speak-btn" data-word="${escapeHtml(item.original)}" title="Listen to pronunciation">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                        </button>
                        <span class="pronunciation-phonetic">${escapeHtml(item.suggestion)}</span>
                        ${item.explanation ? `<div class="pronunciation-tip">${escapeHtml(item.explanation)}</div>` : ''}
                    </div>`;
            }
            
            card.innerHTML = `
                <div class="feedback-section" style="border-bottom: none;">
                    <div class="feedback-header" style="cursor: default;">
                        <div class="feedback-icon">${icon}</div><div class="feedback-title">${title}</div>
                        <div class="history-date">${timeAgo(item.date)}</div>
                    </div>
                    <div class="feedback-body">${bodyHtml}</div>
                </div>`;
            DOM.learningHistoryList.appendChild(card);
        });
    }

    function initLearningHistory() {
        if (DOM.learningHistoryBtn) {
            DOM.learningHistoryBtn.addEventListener('click', showLearningHistory);
        }
        
        if (DOM.historyFilterTabs) {
            DOM.historyFilterTabs.addEventListener('click', (e) => {
                if (e.target.classList.contains('time-tab')) {
                    document.querySelectorAll('#history-filter-tabs .time-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    state.learningHistoryFilter = e.target.dataset.filter;
                    renderLearningHistory();
                    // Scroll to top so user sees filtered results from the beginning
                    DOM.learningHistoryScreen.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }
    }

