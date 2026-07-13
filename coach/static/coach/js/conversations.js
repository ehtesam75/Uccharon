/**
 * Uccharon - AI English Speaking Coach
 * Conversation list, create/select/rename/delete
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // CONVERSATIONS
    // ═══════════════════════════════════════════════════════

    async function loadConversations(skipAutoSelect = false) {
        try {
            const data = await api('/api/conversations/');
            state.conversations = data.conversations;
            renderConversationList();

            // Auto-select the first conversation if we don't have one selected and we have conversations
            if (!skipAutoSelect && !state.currentConversation && state.conversations.length > 0) {
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
            if (state.currentConversation && state.currentMessages.length === 0) {
                void deleteConversationById(state.currentConversation.id);
            }

            const data = await api('/api/conversations/', 'POST', { title: 'New Conversation' });
            state.conversations.unshift(data);
            renderConversationList();
            await selectConversation(data, { loadMessages: false });

            // Close mobile sidebar
            closeMobileSidebar();
        } catch (err) {
            showToast('Failed to create conversation', 'error');
        }
    }

    // Expose a global function to start a chat with a specific prompt
    window.startConversationWithPrompt = async function (promptText) {
        if (!state.currentConversation) {
            // No chat selected, let's create a new one
            await createConversation();
        }
        
        // Populate the input
        DOM.chatInput.value = promptText;
        resizeChatInput();
        
        // Auto-send
        sendMessage();
    };

    async function selectConversation(convo, options = {}) {
        const loadMessages = options.loadMessages !== false;
        const loadToken = ++state.conversationLoadToken;

        finishConversationRename(true);

        // Switching chats: turn off any active speaker/audio playback.
        stopSpeaker();

        if (state.currentConversation && state.currentConversation.id !== convo.id) {
            // Preserve whatever the user had typed in the outgoing chat so it can
            // be restored when they come back — but never carry it into the new chat.
            const outgoingDraft = DOM.chatInput.value;
            if (outgoingDraft && outgoingDraft.trim()) {
                state.chatDrafts[state.currentConversation.id] = outgoingDraft;
            } else {
                delete state.chatDrafts[state.currentConversation.id];
            }

            void queueEmptyConversationDeletion(state.currentConversation.id, state.currentMessages);
        }

        state.currentConversation = convo;

        // Restore the incoming chat's saved draft (empty string if none).
        DOM.chatInput.value = state.chatDrafts[convo.id] || '';
        resizeChatInput();

        state.previousScores = null;
        setPersistedConversationId(convo.id);
        setPersistedView('chat');

        DOM.welcomeScreen.style.display = 'none';
        DOM.dashboardScreen.style.display = 'none';
        DOM.learningHistoryScreen.style.display = 'none';
        DOM.chatArea.style.display = 'flex';
        DOM.chatTitle.textContent = convo.title;

        if (loadMessages) {
            state.pendingConversationLoads.add(convo.id);
            state.currentMessages = [];
            DOM.chatLoading.style.display = 'flex';
            DOM.chatMessages.style.visibility = 'hidden';
            renderMessages({ showEmptyState: false });
            renderConversationList();
            updateScrollToBottomButton();
        } else {
            state.currentMessages = [];
            state.pendingConversationLoads.delete(convo.id);
        }

        if (loadMessages) {
            void (async () => {
                try {
                    const data = await api(`/api/conversations/${convo.id}/messages/`);

                    const isStale = loadToken !== state.conversationLoadToken || state.currentConversation?.id !== convo.id;

                    if (isStale) {
                        if (state.emptyConversationDeletionQueue.has(convo.id) && data.messages.length === 0) {
                            await deleteConversationById(convo.id);
                        }
                        return;
                    }

                    state.currentMessages = data.messages;

                    // Find previous scores from last message
                    if (state.currentMessages.length > 0) {
                        const lastMsg = state.currentMessages[state.currentMessages.length - 1];
                        if (lastMsg.scores && lastMsg.scores.grammar !== null) {
                            state.previousScores = lastMsg.scores;
                        }
                    }

                    renderMessages();
                    DOM.chatLoading.style.display = 'none';
                    DOM.chatMessages.style.visibility = 'visible';
                    renderConversationList();
                    updateScrollToBottomButton();

                    if (state.emptyConversationDeletionQueue.has(convo.id) && data.messages.length === 0) {
                        await deleteConversationById(convo.id);
                    } else {
                        state.emptyConversationDeletionQueue.delete(convo.id);
                    }
                } catch (e) {
                    if (loadToken !== state.conversationLoadToken || state.currentConversation?.id !== convo.id) return;
                    state.currentMessages = [];
                    renderMessages();
                    DOM.chatLoading.style.display = 'none';
                    DOM.chatMessages.style.visibility = 'visible';
                    renderConversationList();
                    updateScrollToBottomButton();
                } finally {
                    state.pendingConversationLoads.delete(convo.id);
                }
            })();
        }

        if (!loadMessages) {
            renderMessages();
            renderConversationList();
            updateScrollToBottomButton();
        }

        // Close mobile sidebar
        closeMobileSidebar();
    }

    async function queueEmptyConversationDeletion(convoId, messages = []) {
        if (!convoId) return;

        if (messages && messages.length > 0) {
            state.emptyConversationDeletionQueue.delete(convoId);
            return;
        }

        if (state.pendingConversationLoads.has(convoId)) {
            state.emptyConversationDeletionQueue.add(convoId);
            return;
        }

        await deleteConversationById(convoId);
    }

    async function deleteConversationById(convoId) {
        if (!convoId) return;

        const convo = state.conversations.find(c => c.id === convoId);
        if (!convo) return;

        try {
            await api(`/api/conversations/${convoId}/`, 'DELETE');
            state.conversations = state.conversations.filter(c => c.id !== convoId);
            state.emptyConversationDeletionQueue.delete(convoId);

            if (state.currentConversation?.id === convoId) {
                state.currentConversation = null;
                state.currentMessages = [];
            }

            renderConversationList();
        } catch (e) {
            console.error('Failed to delete empty conversation:', e);
        }
    }

    function beginConversationRename() {
        if (!state.currentConversation || state.conversationRename.active || !DOM.chatTitle) return;

        state.conversationRename.active = true;
        state.conversationRename.cancelled = false;
        state.conversationRename.originalTitle = DOM.chatTitle.textContent.trim();

        DOM.chatTitle.classList.add('editing');
        DOM.chatTitle.contentEditable = 'true';
        DOM.chatTitle.spellcheck = false;
        DOM.chatTitle.focus();
        selectNodeContents(DOM.chatTitle);
    }

    function selectNodeContents(node) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function finishConversationRename(forceCancel = false) {
        if (!state.conversationRename.active || !DOM.chatTitle) return;

        const originalTitle = state.conversationRename.originalTitle || 'New Conversation';
        const currentTitle = DOM.chatTitle.textContent.trim();
        const shouldCancel = forceCancel || state.conversationRename.cancelled;

        DOM.chatTitle.classList.remove('editing');
        DOM.chatTitle.contentEditable = 'false';
        DOM.chatTitle.spellcheck = true;
        state.conversationRename.active = false;

        if (shouldCancel || !currentTitle || currentTitle === originalTitle) {
            DOM.chatTitle.textContent = originalTitle;
            state.conversationRename.cancelled = false;
            return;
        }

        await saveConversationTitle(currentTitle, originalTitle);
        state.conversationRename.cancelled = false;
    }

    async function saveConversationTitle(nextTitle, fallbackTitle) {
        if (!state.currentConversation) return;

        const previousTitle = state.currentConversation.title;
        const updatedTitle = nextTitle.trim();

        if (!updatedTitle) {
            DOM.chatTitle.textContent = fallbackTitle || previousTitle;
            return;
        }

        state.currentConversation.title = updatedTitle;
        DOM.chatTitle.textContent = updatedTitle;
        renderConversationList();

        try {
            const data = await api(`/api/conversations/${state.currentConversation.id}/`, 'PUT', { title: updatedTitle });
            state.currentConversation.title = data.title;
            const convo = state.conversations.find(c => c.id === state.currentConversation.id);
            if (convo) convo.title = data.title;
            DOM.chatTitle.textContent = data.title;
            renderConversationList();
        } catch (err) {
            state.currentConversation.title = previousTitle;
            DOM.chatTitle.textContent = previousTitle;
            const convo = state.conversations.find(c => c.id === state.currentConversation.id);
            if (convo) convo.title = previousTitle;
            renderConversationList();
            showToast('Failed to rename conversation', 'error');
        }
    }

    function initConversationRename() {
        if (!DOM.chatTitle || !DOM.renameConvoBtn) return;

        DOM.renameConvoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            beginConversationRename();
        });

        DOM.chatTitle.addEventListener('dblclick', beginConversationRename);

        DOM.chatTitle.addEventListener('keydown', (e) => {
            if (!state.conversationRename.active && e.key !== 'Enter') return;

            if (e.key === 'Enter') {
                e.preventDefault();
                DOM.chatTitle.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                state.conversationRename.cancelled = true;
                DOM.chatTitle.textContent = state.conversationRename.originalTitle || DOM.chatTitle.textContent;
                DOM.chatTitle.blur();
            }
        });

        DOM.chatTitle.addEventListener('blur', () => {
            if (state.conversationRename.active) {
                finishConversationRename();
            }
        });
    }

    async function deleteConversation() {
        if (!state.currentConversation) return;
        if (!confirm('Delete this conversation?')) return;

        try {
            await api(`/api/conversations/${state.currentConversation.id}/`, 'DELETE');
            state.conversations = state.conversations.filter(c => c.id !== state.currentConversation.id);
            state.currentConversation = null;
            state.currentMessages = [];
            clearPersistedConversationId();

            if (state.conversations.length > 0) {
                await selectConversation(state.conversations[0]);
            } else {
                DOM.chatArea.style.display = 'none';
                DOM.dashboardScreen.style.display = 'none';
                DOM.learningHistoryScreen.style.display = 'none';
                DOM.welcomeScreen.style.display = 'flex';
                renderConversationList();
            }
            showToast('Conversation deleted', 'success');
        } catch (err) {
            showToast('Failed to delete conversation', 'error');
        }
    }

