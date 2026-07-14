/**
 * Uccharon - AI English Speaking Coach
 * Messages, chat rendering, feedback cards, send/generation
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // MESSAGES & CHAT
    // ═══════════════════════════════════════════════════════

    function renderMessages(options = {}) {
        const showEmptyState = options.showEmptyState !== false;
        DOM.chatMessages.innerHTML = '';

        if (state.currentMessages.length === 0) {
            if (!showEmptyState) {
                return;
            }

            DOM.chatMessages.innerHTML = `
                <div class="empty-chat-state">
                    <div class="empty-chat-content">
                        <div class="empty-chat-icon">
                            <img src="/static/coach/icon/uccharon-circle-icon.png" alt="Uccharon AI">
                        </div>
                        <h3>How can I help you today?</h3>
                        <p>Type a message or use your voice to practice your English. I'll provide real-time pronunciation and grammar feedback.</p>
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

        const instantScroll = options.instantScroll !== false;
        scrollLatestMessageIntoView(null, instantScroll);
    }

    function clearEmptyChatState() {
        const emptyState = DOM.chatMessages.querySelector('.empty-chat-state');
        if (emptyState) {
            emptyState.remove();
        }
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
            aiMsg.appendChild(buildFeedbackCard(msg.ai_response, msg.scores, prevScores, msg.ai_provider_name, msg.ai_model_name));
            group.appendChild(aiMsg);
        }

        DOM.chatMessages.appendChild(group);
    }

    function buildFeedbackCard(response, currentScores, prevScores, providerName, modelName) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ai-feedback-wrapper';
        const card = document.createElement('div');
        card.className = 'ai-feedback-card';

        // 0. Conversational Reply
        if (response.conversational_reply) {
            card.appendChild(createFeedbackSection(
                '💬', 'Coach\'s Reply',
                `<div style="display: flex; align-items: flex-start; justify-content: space-between;">
                    <div class="conversational-reply" style="flex: 1;">${escapeHtml(response.conversational_reply)}</div>
                    <button class="vocab-speak-btn" data-word="${escapeHtml(response.conversational_reply)}" title="Listen to reply" style="background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                    </button>
                </div>`,
                false
            ));
        }

        const showFullFeedback = response.input_status === 'valid' || response.input_status === 'mixed_language';

        // 1. Grammar Corrections
        // Only render this section when the AI actually found grammar errors.
        // When there are none, hide the section entirely (no "Great job!" message).
        if (showFullFeedback && response.grammar_corrections && response.grammar_corrections.length > 0) {
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
        }

        // 1.2 Mechanics Corrections (spelling, capitalization, punctuation)
        // Only render this section when the AI actually found mechanics errors.
        // When there are none, hide the section entirely (no "Great job!" message).
        if (showFullFeedback && response.mechanics_corrections && response.mechanics_corrections.length > 0) {
            let mechanicsHtml = '';
            response.mechanics_corrections.forEach(mc => {
                mechanicsHtml += `
                    <div class="grammar-item">
                        <div class="grammar-original">${escapeHtml(mc.original)}</div>
                        <div class="grammar-corrected">${escapeHtml(mc.corrected)}</div>
                        <div class="grammar-explanation">${escapeHtml(mc.tip || mc.explanation || '')}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('✏️', 'Mechanics Corrections', mechanicsHtml));
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
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Version ${idx + 1}</div>
                            <button class="vocab-speak-btn" data-word="${escapeHtml(nv)}" title="Listen to pronunciation" style="padding: 2px; border-radius: 4px;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="native-version-text">${escapeHtml(nv)}</div>
                    </div>
                `;
            });
            card.appendChild(createFeedbackSection('🗣️', 'Native Speaker Versions', versionsHtml));
        } else if (response.native_version) {
            // Fallback for older conversation history
            card.appendChild(createFeedbackSection(
                '🗣️', 'Native Speaker Version',
                `<div class="native-version-item">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <div style="font-size: 0.75rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Version 1</div>
                        <button class="vocab-speak-btn" data-word="${escapeHtml(response.native_version)}" title="Listen to pronunciation" style="padding: 2px; border-radius: 4px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="native-version-text">${escapeHtml(response.native_version)}</div>
                </div>`
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
                        <button class="vocab-speak-btn" data-word="${escapeHtml(pg.word)}" title="Listen to pronunciation">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                        </button>
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
        if(showFullFeedback && response.performance_rating){
            const pr = response.performance_rating;
            // Calculate overall score
            const overall = (pr.grammar * 0.30) + (pr.vocabulary * 0.20) + (pr.naturalness * 0.15) + ((pr.expression || 0) * 0.30) + ((pr.mechanics || 0) * 0.05);
            const overallRounded = Number(overall.toFixed(1));

            // Add to currentScores so backend saves it
            currentScores.overall = overallRounded;

            const scores = [
                { label: 'Overall', value: overallRounded, key: 'overall' },
                { label: 'Grammar', value: pr.grammar, key: 'grammar' },
                { label: 'Vocabulary', value: pr.vocabulary, key: 'vocabulary' },
                { label: 'Naturalness', value: pr.naturalness, key: 'naturalness' },
                { label: 'Expression', value: pr.expression, key: 'expression' },
                { label: 'Mechanics', value: pr.mechanics, key: 'mechanics' },
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
        if (showFullFeedback && response.follow_up_question) {
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

        wrapper.appendChild(card);

        // Model attribution label
        if (providerName || modelName) {
            const PROVIDER_DISPLAY = {
                openai: 'OpenAI', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter'
            };
            const displayProvider = PROVIDER_DISPLAY[providerName] || providerName;

            const displayModel = MODEL_DISPLAY_NAMES[modelName] || modelName;
            const parts = [displayProvider, displayModel].filter(Boolean);
            if (parts.length) {
                const label = document.createElement('div');
                label.className = 'ai-model-label';
                label.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/></svg> ${escapeHtml(parts.join(' • '))}`;
                wrapper.appendChild(label);
            }
        }

        return wrapper;
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

            if (state.collapsedSections[title]) {
                body.classList.add('collapsed');
                toggle.classList.add('collapsed');
            }

            header.addEventListener('click', () => {
                const nowCollapsed = body.classList.toggle('collapsed');
                toggle.classList.toggle('collapsed');
                if (nowCollapsed) {
                    state.collapsedSections[title] = true;
                } else {
                    delete state.collapsedSections[title];
                }
                saveCollapsedSections();
            });
        }

        return section;
    }

    // ─── Fallback System Constants ──────────────────────

    const PROVIDER_MODELS = {
        openai: [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-4.1-mini'
        ],

        gemini: [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash'
        ],
        groq: [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'deepseek-r1-distill-llama-70b',
            'gemma2-9b-it'
        ],
        openrouter: [
            'meta-llama/llama-3.3-70b-instruct',
            'openai/gpt-oss-120b',
            'qwen/qwen3-235b-a22b-2507',
            'qwen/qwen3-30b-a3b-instruct-2507',
            'deepseek/deepseek-chat',
            'deepseek/deepseek-r1',
            'google/gemma-3-27b-it',
            'openai/gpt-3.5-turbo',
            'nvidia/llama-3.3-nemotron-super-49b-v1',
            'openrouter/auto'
        ]
    };

    const PROVIDER_DISPLAY = { openai: 'OpenAI', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };


    function _getLastSuccess() {
        try {
            const raw = localStorage.getItem('uccharon_last_success');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function _saveLastSuccess(provider, model, keyIndex) {
        localStorage.setItem('uccharon_last_success', JSON.stringify({ provider, model, keyIndex }));
    }

    /**
     * The list of AI providers eligible for use/fallback. Groq is excluded when
     * বাংলা (Bengali) is the selected Explanation Language because it produces
     * corrupted Bengali output.
     */
    function _getAvailableProviders() {
        const all = ['openai', 'gemini', 'groq', 'openrouter'];
        if (state.settings.explanation_language === 'bn') {
            return all.filter(p => p !== 'groq');
        }
        return all;
    }

    function _getProviderKeys(providerName) {

        const keys = [];
        const k1 = state.settings[`${providerName}_api_key`];
        const k2 = state.settings[`${providerName}_api_key_2`];
        const k3 = state.settings[`${providerName}_api_key_3`];
        if (k1) keys.push(k1);
        if (k2) keys.push(k2);
        if (k3) keys.push(k3);
        return keys;
    }

    /**
     * Build the full ordered attempt list following the priority:
     * 1. Current provider + current model + last successful key first, then other keys
     * 2. Current provider + other models + all keys
     * 3. Other providers + their models + their keys
     */
    function _buildAttemptList() {
        const lastSuccess = _getLastSuccess();
        const availableProviders = _getAvailableProviders();
        let startProvider = state.settings.ai_provider;
        // If the current provider is unavailable (e.g. Groq while Bengali is
        // selected), start from the first available provider instead.
        if (!availableProviders.includes(startProvider)) {
            startProvider = availableProviders[0];
        }
        const startModel = state.settings[`${startProvider}_model`];
        const allProviders = availableProviders;


        const attemptList = []; // [{provider, model, key, keyIndex, label}]
        const seen = new Set(); // dedup: "provider|model|keyIndex"

        function addAttempts(provider, model, keys, priorityKeyIndex) {
            // Add priority key first if valid
            if (priorityKeyIndex !== undefined && priorityKeyIndex < keys.length) {
                const sig = `${provider}|${model}|${priorityKeyIndex}`;
                if (!seen.has(sig)) {
                    seen.add(sig);
                    attemptList.push({ provider, model, key: keys[priorityKeyIndex], keyIndex: priorityKeyIndex });
                }
            }
            // Then other keys
            for (let i = 0; i < keys.length; i++) {
                const sig = `${provider}|${model}|${i}`;
                if (!seen.has(sig)) {
                    seen.add(sig);
                    attemptList.push({ provider, model, key: keys[i], keyIndex: i });
                }
            }
        }

        // Phase 1: Current provider + current model + all keys (last successful key first)
        const startKeys = _getProviderKeys(startProvider);
        if (startKeys.length > 0) {
            const priorityKey = (lastSuccess && lastSuccess.provider === startProvider && lastSuccess.model === startModel)
                ? lastSuccess.keyIndex : undefined;
            addAttempts(startProvider, startModel, startKeys, priorityKey);
        }

        // Phase 2: Current provider + other models + all keys
        const otherModels = (PROVIDER_MODELS[startProvider] || []).filter(m => m !== startModel);
        for (const model of otherModels) {
            if (startKeys.length > 0) {
                const priorityKey = (lastSuccess && lastSuccess.provider === startProvider && lastSuccess.model === model)
                    ? lastSuccess.keyIndex : undefined;
                addAttempts(startProvider, model, startKeys, priorityKey);
            }
        }

        // Phase 3: Other providers + their selected model first, then other models
        const otherProviders = allProviders.filter(p => p !== startProvider);
        for (const provider of otherProviders) {
            const keys = _getProviderKeys(provider);
            if (keys.length === 0) continue;

            const selectedModel = state.settings[`${provider}_model`];
            const providerModels = PROVIDER_MODELS[provider] || [];

            // Selected model first
            if (selectedModel) {
                const priorityKey = (lastSuccess && lastSuccess.provider === provider && lastSuccess.model === selectedModel)
                    ? lastSuccess.keyIndex : undefined;
                addAttempts(provider, selectedModel, keys, priorityKey);
            }

            // Then other models for this provider
            for (const model of providerModels) {
                if (model === selectedModel) continue;
                const priorityKey = (lastSuccess && lastSuccess.provider === provider && lastSuccess.model === model)
                    ? lastSuccess.keyIndex : undefined;
                addAttempts(provider, model, keys, priorityKey);
            }
        }

        return attemptList;
    }

    // ─── Send Message ───────────────────────────────────

    // Toggle the send button between its normal (Send) and generating (Stop) states
    function setGeneratingUI(isGenerating) {
        if (!DOM.sendBtn) return;
        DOM.sendBtn.classList.toggle('generating', isGenerating);
        DOM.sendBtn.disabled = false;
        DOM.sendBtn.title = isGenerating ? 'Stop generating' : 'Send message';
        DOM.sendBtn.setAttribute('aria-label', isGenerating ? 'Stop generating' : 'Send message');
    }

    // User-initiated cancellation of an in-flight AI response.
    // Aborts the network request; sendMessage() handles all cleanup so no
    // partial response, feedback, history, or stats are ever saved.
    function stopGeneration() {
        if (!state.isSending) return;
        state.generationCancelled = true;
        if (state.abortController) {
            try { state.abortController.abort(); } catch (e) { /* ignore */ }
        }
    }

    async function sendMessage() {
        // If a generation is in progress, the button acts as a Stop button.
        if (state.isSending) {
            stopGeneration();
            return;
        }

        const text = DOM.chatInput.value.trim();
        if (!text) return;

        // Word count check
        const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
        if (wordCount < 20) {
            showToast("Your message must contain at least 20 words.", 'error');
            return;
        }

        const activeProviders = _getAvailableProviders().filter(p => _getProviderKeys(p).length > 0);


        if (activeProviders.length === 0) {
            showToast(`Please set an AI provider API key in Settings.`, 'error');
            openSettings();
            return;
        }

        // Build the comprehensive attempt list
        const attemptList = _buildAttemptList();
        if (attemptList.length === 0) {
            showToast(`No valid API key/model combinations available.`, 'error');
            openSettings();
            return;
        }

        // Create conversation if needed
        if (!state.currentConversation) {
            await createConversation();
        }

        // Turn off any active speaker/audio playback the moment a message is sent.
        stopSpeaker();

        // Stop any active microphone recording and release the mic on send.
        stopRecordingIfActive();

        state.isSending = true;
        state.generationCancelled = false;
        state.abortController = new AbortController();
        const abortSignal = state.abortController.signal;
        DOM.chatInput.value = '';
        // The message is now sent — clear any saved draft for this conversation.
        if (state.currentConversation) {
            delete state.chatDrafts[state.currentConversation.id];
        }
        resizeChatInput();

        setGeneratingUI(true);   // Turn the Send button into a Stop button
        clearEmptyChatState();

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
        scrollLatestMessageIntoView(userMsgEl);

        const thinkingTextEl = thinkingEl.querySelector('.thinking-text');
        
        let aiResponse = null;
        let finalProvider = null;
        let finalModel = null;
        let finalKeyIndex = 0;
        let lastError = null;

        let prevProvider = null;
        let prevModel = null;
        let allKeysFailedForCurrentModel = false;

        for (let i = 0; i < attemptList.length; i++) {
            const { provider, model, key, keyIndex } = attemptList[i];
            const displayProvider = PROVIDER_DISPLAY[provider] || provider;
            const displayModel = MODEL_DISPLAY_NAMES[model] || model;

            // Determine what changed to show appropriate status message
            const providerChanged = prevProvider !== null && provider !== prevProvider;
            const modelChanged = prevModel !== null && model !== prevModel && !providerChanged;
            const keyChanged = i > 0 && !providerChanged && !modelChanged;

            try {
                if (i === 0) {
                    thinkingTextEl.textContent = `Analyzing your English...`;
                    // Brief pause then show model info
                    await new Promise(r => setTimeout(r, 300));
                    thinkingTextEl.textContent = `Using ${displayProvider} • ${displayModel}...`;
                } else if (providerChanged) {
                    thinkingTextEl.textContent = `Provider unavailable. Switching to another provider...`;
                    await new Promise(r => setTimeout(r, 1000));
                    thinkingTextEl.textContent = `Using ${displayProvider} • ${displayModel}...`;
                } else if (modelChanged) {
                    thinkingTextEl.textContent = `All API keys failed. Trying another model...`;
                    await new Promise(r => setTimeout(r, 800));
                    thinkingTextEl.textContent = `Using ${displayProvider} • ${displayModel}...`;
                } else if (keyChanged) {
                    thinkingTextEl.textContent = `API key limit reached. Trying another API key...`;
                    await new Promise(r => setTimeout(r, 800));
                    thinkingTextEl.textContent = `Using ${displayProvider} • ${displayModel}...`;
                }

                const aiProvider = ProviderFactory.create(provider, key, model, state.settings.explanation_language);
                aiResponse = await aiProvider.sendMessage(text, state.currentMessages, { signal: abortSignal });
                
                finalProvider = provider;
                finalModel = model;
                finalKeyIndex = keyIndex;
                break; // success!
            } catch (err) {
                // User pressed Stop — abort the whole flow immediately, no fallback.
                if (state.generationCancelled || err.name === 'AbortError' || abortSignal.aborted) {
                    lastError = err;
                    break;
                }
                lastError = err;
                console.error(`[Fallback] ${displayProvider} • ${displayModel} (key ${keyIndex + 1}) failed:`, err.message);
                prevProvider = provider;
                prevModel = model;
            }
        }

        // If the user cancelled, discard everything: no partial response, no save,
        // no feedback, no stats/history. Clean the UI back to a normal state.
        if (state.generationCancelled) {
            thinkingEl.remove();
            userMsgEl.remove();
            if (state.currentMessages.length === 0) {
                renderMessages();   // restore empty-chat placeholder
            }
            state.isSending = false;
            state.abortController = null;
            state.generationCancelled = false;
            setGeneratingUI(false);
            DOM.chatInput.focus();
            updateScrollToBottomButton();
            return;
        }

        // Save last successful combination
        if (aiResponse && finalProvider) {
            _saveLastSuccess(finalProvider, finalModel, finalKeyIndex);
        }

        try {
            if (!aiResponse) {
                throw lastError || new Error("All configured providers failed.");
            }

            // If a fallback occurred, update settings and inform user
            if (finalProvider !== state.settings.ai_provider) {
                state.settings.ai_provider = finalProvider;
                
                const displayModel = MODEL_DISPLAY_NAMES[finalModel] || finalModel;
                showToast(`Switched to ${displayModel} due to provider errors.`, 'info');
                
                // Update UI Settings silently
                const providerRadio = document.querySelector(`input[name="ai-provider"][value="${finalProvider}"]`);
                if (providerRadio) providerRadio.checked = true;
                _updateAiProviderUI(finalProvider);
                
                // Persist settings to backend
                api('/api/settings/', 'PUT', { ai_provider: finalProvider }).catch(e => console.error('Failed to sync provider fallback:', e));
            }

            // Extract scores
            const scores = aiResponse.performance_rating || {};
            if (scores.grammar !== undefined) {
                scores.overall = Number(((scores.grammar * 0.30) + (scores.vocabulary * 0.20) + (scores.naturalness * 0.15) + ((scores.expression || 0) * 0.30) + ((scores.mechanics || 0) * 0.05)).toFixed(1));
            }

            // Save to server
            const savedMsg = await api(
                `/api/conversations/${state.currentConversation.id}/messages/`,
                'POST',
                {
                    user_text: text,
                    ai_response: aiResponse,
                    scores: scores,
                    ai_provider_name: finalProvider,
                    ai_model_name: finalModel || ''
                }
            );

            // Remove thinking indicator
            thinkingEl.remove();

            // Build and show AI feedback
            const aiMsgEl = document.createElement('div');
            aiMsgEl.className = 'ai-message';
            aiMsgEl.style.animation = 'messageSlideIn 0.35s ease-out';
            aiMsgEl.appendChild(buildFeedbackCard(aiResponse, scores, state.previousScores, finalProvider, finalModel));
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

            scrollLatestMessageIntoView(userMsgEl);

        } catch (err) {
            thinkingEl.remove();
            const errEl = document.createElement('div');
            errEl.className = 'ai-thinking';
            errEl.style.borderLeft = '3px solid var(--accent-error)';
            
            let displayMsg = err.message;
            if (displayMsg.includes('Failed to fetch') || displayMsg.includes('NetworkError') || displayMsg.includes('fetch failed')) {
                displayMsg = 'Network Error: Unable to reach the API. Please check your internet connection or if an ad blocker/firewall is blocking the request.';
            }

            errEl.innerHTML = `<span style="color: var(--accent-error); font-size: 0.85rem;">⚠️ ${escapeHtml(displayMsg)}</span>`;
            DOM.chatMessages.appendChild(errEl);
            scrollLatestMessageIntoView(errEl);
        } finally {
            state.isSending = false;
            state.abortController = null;
            state.generationCancelled = false;
            setGeneratingUI(false);   // Restore the Send button
        }
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            DOM.chatMessages.scrollTo({
                top: DOM.chatMessages.scrollHeight,
                behavior: 'smooth'
            });
            updateScrollToBottomButton();
        });
    }

    function scrollLatestMessageIntoView(targetElement = null, instant = false) {
        let element = targetElement;
        if (!element) {
            const children = Array.from(DOM.chatMessages.children);
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                if (child.classList.contains('ai-thinking') || child.classList.contains('empty-chat-state')) {
                    element = child;
                    break;
                } else if (child.classList.contains('message-group')) {
                    element = child;
                    break;
                }
            }
        }

        if (!element) {
            updateScrollToBottomButton();
            return;
        }

        requestAnimationFrame(() => {
            const targetTop = Math.max(0, element.offsetTop - 24);
            const maxTop = Math.max(0, DOM.chatMessages.scrollHeight - DOM.chatMessages.clientHeight);
            DOM.chatMessages.scrollTo({
                top: Math.min(targetTop, maxTop),
                behavior: instant ? 'auto' : 'smooth'
            });
            updateScrollToBottomButton();
        });
    }

    function isChatScrolledToBottom() {
        return (DOM.chatMessages.scrollHeight - DOM.chatMessages.scrollTop - DOM.chatMessages.clientHeight) <= 12;
    }

    function updateScrollToBottomButton() {
        if (!DOM.scrollToBottomBtn) return;

        const chatVisible = DOM.chatArea && getComputedStyle(DOM.chatArea).display !== 'none';
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const sidebarOpenOnMobile = isMobile && DOM.sidebar.classList.contains('mobile-open');
        const sidebarExpandedWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 0;
        const horizontalOffset = isMobile || DOM.sidebar.classList.contains('collapsed')
            ? 0
            : Math.max(0, sidebarExpandedWidth / 2);
        const shouldShow = chatVisible && state.currentConversation && DOM.chatMessages && !isChatScrolledToBottom() && !sidebarOpenOnMobile;
        const defaultBottom = isMobile ? 96 : 104;
        const buttonGap = 12;
        const inputContainer = DOM.chatInput?.closest('.chat-input-container');

        DOM.scrollToBottomBtn.style.setProperty('--scroll-to-bottom-offset-x', `${horizontalOffset}px`);

        if (chatVisible && inputContainer) {
            const inputTop = inputContainer.getBoundingClientRect().top;
            const bottomOffset = Math.max(defaultBottom, Math.ceil(window.innerHeight - inputTop + buttonGap));
            DOM.scrollToBottomBtn.style.setProperty('--scroll-to-bottom-offset-y', `${bottomOffset}px`);
        } else {
            DOM.scrollToBottomBtn.style.setProperty('--scroll-to-bottom-offset-y', `${defaultBottom}px`);
        }

        DOM.scrollToBottomBtn.classList.toggle('visible', Boolean(shouldShow));
        DOM.scrollToBottomBtn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    function resizeChatInput() {
        DOM.chatInput.style.height = 'auto';
        DOM.chatInput.style.height = Math.min(DOM.chatInput.scrollHeight, 120) + 'px';
        if (DOM.chatInput.scrollHeight > 120) {
            DOM.chatInput.style.overflowY = 'auto';
        } else {
            DOM.chatInput.style.overflowY = 'hidden';
        }
        updateScrollToBottomButton();
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

        DOM.chatInput.addEventListener('input', resizeChatInput);

        const inputContainer = DOM.chatInput?.closest('.chat-input-container');
        if (inputContainer && typeof ResizeObserver !== 'undefined') {
            const inputResizeObserver = new ResizeObserver(() => {
                updateScrollToBottomButton();
            });
            inputResizeObserver.observe(inputContainer);
        }

        DOM.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 768;
                if (!isMobile) {
                    e.preventDefault();
                    // Enter only sends a new message. While an AI response is
                    // generating it must NOT act as Stop/Cancel — that action is
                    // available only through the dedicated Stop button.
                    if (!state.isSending) {
                        sendMessage();
                    }
                }
            }
        });


        DOM.sendBtn.addEventListener('click', sendMessage);
    }

