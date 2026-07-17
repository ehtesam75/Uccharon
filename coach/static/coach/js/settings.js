    /**
 * Uccharon - AI English Speaking Coach
 * Settings drawer, API-key validation, save settings
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════════

    function openSettings() {
        DOM.settingsOverlay.style.display = 'block';
        DOM.settingsDrawer.classList.add('open');
        // Treat pre-filled keys as validated and refresh the Save button gating
        seedSettingsKeyValidation();
    }


    function closeSettings() {
        DOM.settingsOverlay.style.display = 'none';
        DOM.settingsDrawer.classList.remove('open');
    }

    function applySettingsToUI() {
        DOM.geminiApiKey.value = state.settings.gemini_api_key || '';
        const geminiKey2El = document.getElementById('gemini-api-key-2');
        const geminiKey3El = document.getElementById('gemini-api-key-3');
        if (geminiKey2El) geminiKey2El.value = state.settings.gemini_api_key_2 || '';
        if (geminiKey3El) geminiKey3El.value = state.settings.gemini_api_key_3 || '';

        DOM.groqApiKey.value = state.settings.groq_api_key || '';
        const groqKey2El = document.getElementById('groq-api-key-2');
        const groqKey3El = document.getElementById('groq-api-key-3');
        if (groqKey2El) groqKey2El.value = state.settings.groq_api_key_2 || '';
        if (groqKey3El) groqKey3El.value = state.settings.groq_api_key_3 || '';

        DOM.openrouterApiKey.value = state.settings.openrouter_api_key || '';
        const openrouterKey2El = document.getElementById('openrouter-api-key-2');
        const openrouterKey3El = document.getElementById('openrouter-api-key-3');
        if (openrouterKey2El) openrouterKey2El.value = state.settings.openrouter_api_key_2 || '';
        if (openrouterKey3El) openrouterKey3El.value = state.settings.openrouter_api_key_3 || '';

        DOM.openaiApiKey.value = state.settings.openai_api_key || '';
        const openaiKey2El = document.getElementById('openai-api-key-2');
        const openaiKey3El = document.getElementById('openai-api-key-3');
        if (openaiKey2El) openaiKey2El.value = state.settings.openai_api_key_2 || '';
        if (openaiKey3El) openaiKey3El.value = state.settings.openai_api_key_3 || '';

        // AI Provider radios

        const aiProvider = state.settings.ai_provider || 'gemini';
        const providerRadio = document.querySelector(`input[name="ai-provider"][value="${aiProvider}"]`);
        if (providerRadio) providerRadio.checked = true;
        _updateAiProviderUI(aiProvider);

        DOM.dailyWordGoalSelect.value = state.settings.daily_word_goal || '250';

        if (DOM.explanationLanguageSelect) {
            DOM.explanationLanguageSelect.value = state.settings.explanation_language || 'en';
        }

        // Bengali explanations are unreliable on Groq — reflect that in the UI.
        _updateGroqBengaliState();


        // Model selects
        DOM.geminiModelSelect.value = state.settings.gemini_model || 'gemini-2.5-flash';
        DOM.groqModelSelect.value = state.settings.groq_model || 'llama-3.3-70b-versatile';
        DOM.openrouterModelSelect.value = state.settings.openrouter_model || 'meta-llama/llama-3.3-70b-instruct';
        if (DOM.openaiModelSelect) DOM.openaiModelSelect.value = state.settings.openai_model || 'gpt-4o';
        if (DOM.groqWhisperModelSelect) DOM.groqWhisperModelSelect.value = state.settings.groq_whisper_model || 'whisper-large-v3-turbo';



        // Voice Provider radios
        const vp = state.settings.voice_provider || 'browser';
        const voiceRadio = document.querySelector(`input[name="voice-provider"][value="${vp}"]`);
        if (voiceRadio) voiceRadio.checked = true;
        _updateVoiceProviderUI(vp);
    }

    /** Show/hide the per-provider voice notices based on selected voice provider */
    function _updateVoiceProviderUI(provider) {
        if (DOM.openaiSttNotice) DOM.openaiSttNotice.style.display = provider === 'openai' ? 'flex' : 'none';
        DOM.geminiSttNotice.style.display = provider === 'gemini-stt' ? 'flex' : 'none';
        DOM.voiceBrowserNotice.style.display = provider === 'browser' ? 'flex' : 'none';
        if (DOM.groqWhisperGroup) DOM.groqWhisperGroup.style.display = provider === 'groq-whisper' ? 'block' : 'none';
    }

    /** Show/hide the AI Provider settings based on selected AI provider */
    function _updateAiProviderUI(provider) {
        ['openai', 'gemini', 'groq', 'openrouter'].forEach(p => {
            const container = document.getElementById(`${p}-settings-container`);
            if (container) container.style.display = provider === p ? 'block' : 'none';
        });
    }

    /**
     * Groq produces corrupted output for Bengali explanations, so it is disabled
     * whenever বাংলা (Bengali) is selected as the Explanation Language.
     * This greys out / disables the Groq provider card, shows an explanatory
     * notice, and — if Groq was the active provider — falls back to Gemini.
     */
    function _updateGroqBengaliState() {
        const isBengali = (DOM.explanationLanguageSelect?.value || 'en') === 'bn';
        const groqCard = document.getElementById('provider-groq-card');
        const groqRadio = document.querySelector('input[name="ai-provider"][value="groq"]');
        const notice = document.getElementById('groq-bengali-notice');

        if (notice) notice.style.display = isBengali ? 'flex' : 'none';

        if (groqRadio) groqRadio.disabled = isBengali;
        if (groqCard) {
            groqCard.classList.toggle('disabled', isBengali);
            groqCard.setAttribute('aria-disabled', isBengali ? 'true' : 'false');
        }

        // If Groq is currently selected while Bengali is active, fall back to Gemini.
        if (isBengali && groqRadio && groqRadio.checked) {
            const geminiRadio = document.querySelector('input[name="ai-provider"][value="gemini"]');
            if (geminiRadio) {
                geminiRadio.checked = true;
                _updateAiProviderUI('gemini');
            }
        }
    }



    // ─── Settings API Key Validation ─────────────────────

    // Returns the list of settings key-validation controls
    function getSettingsKeyControls() {
        return Array.from(document.querySelectorAll('#settings-drawer .validate-key-btn'))
            .map(btn => {
                const inputId = btn.dataset.keyInput;
                const input = document.getElementById(inputId);
                const statusEl = document.getElementById(`${inputId}-status`);
                return { btn, input, statusEl, inputId, provider: btn.dataset.provider };
            })
            .filter(c => c.input);
    }

    // Enable Save only when every entered key has been successfully validated
    function updateSaveSettingsState() {
        const controls = getSettingsKeyControls();
        let allEnteredValid = true;
        controls.forEach(({ btn, input, inputId }) => {
            const val = (input.value || '').trim();
            if (val && state.settingsKeyValidation[inputId] !== 'valid') {
                allEnteredValid = false;
            }
            // Toggle each Validate button: enabled only if a value is present
            if (btn) btn.disabled = !val;
        });
        DOM.saveSettingsBtn.disabled = !allEnteredValid;

    }

    async function handleSettingsKeyValidate(control) {
        const { btn, input, statusEl, inputId, provider } = control;
        const key = (input.value || '').trim();
        if (!key) {
            setKeyValidationStatus(statusEl, 'error', '✗ Please enter an API key first');
            return;
        }

        btn.classList.add('is-validating');
        btn.disabled = true;
        setKeyValidationStatus(statusEl, 'checking', 'Checking API key…');

        try {
            const result = await ProviderFactory.validateApiKey(provider, key);
            if (result.valid) {
                state.settingsKeyValidation[inputId] = 'valid';
                setKeyValidationStatus(statusEl, 'success', '✓ API key verified');
            } else {
                state.settingsKeyValidation[inputId] = 'invalid';
                setKeyValidationStatus(statusEl, 'error', `✗ ${result.error || 'Invalid API key'}`);
            }
        } catch (e) {
            state.settingsKeyValidation[inputId] = 'invalid';
            setKeyValidationStatus(statusEl, 'error', '✗ Invalid API key');
        } finally {
            btn.classList.remove('is-validating');
            updateSaveSettingsState();
        }
    }

    function initSettingsKeyValidation() {
        getSettingsKeyControls().forEach(control => {
            control.btn.addEventListener('click', () => handleSettingsKeyValidate(control));
            control.input.addEventListener('input', () => {
                // Editing a key invalidates its previous validation result
                delete state.settingsKeyValidation[control.inputId];
                setKeyValidationStatus(control.statusEl, null);
                updateSaveSettingsState();
            });
        });
    }

    // Treat already-saved (pre-filled, unchanged) keys as validated so the user
    // isn't forced to re-validate existing keys just to change other settings.
    function seedSettingsKeyValidation() {
        state.settingsKeyValidation = {};
        getSettingsKeyControls().forEach(({ input, statusEl, inputId }) => {
            const val = (input.value || '').trim();
            if (val) {
                state.settingsKeyValidation[inputId] = 'valid';
            }
            setKeyValidationStatus(statusEl, null);
        });
        updateSaveSettingsState();
    }

    async function saveSettings() {
        const provider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';

        const geminiKey = DOM.geminiApiKey.value.trim();
        const geminiKey2 = (document.getElementById('gemini-api-key-2')?.value || '').trim();
        const geminiKey3 = (document.getElementById('gemini-api-key-3')?.value || '').trim();
        const groqKey = DOM.groqApiKey.value.trim();
        const groqKey2 = (document.getElementById('groq-api-key-2')?.value || '').trim();
        const groqKey3 = (document.getElementById('groq-api-key-3')?.value || '').trim();
        const openrouterKey = DOM.openrouterApiKey.value.trim();
        const openrouterKey2 = (document.getElementById('openrouter-api-key-2')?.value || '').trim();
        const openrouterKey3 = (document.getElementById('openrouter-api-key-3')?.value || '').trim();

        const openaiKey = DOM.openaiApiKey.value.trim();
        const openaiKey2 = (document.getElementById('openai-api-key-2')?.value || '').trim();
        const openaiKey3 = (document.getElementById('openai-api-key-3')?.value || '').trim();
        const geminiModel = DOM.geminiModelSelect.value;
        const groqModel = DOM.groqModelSelect.value;
        const openrouterModel = DOM.openrouterModelSelect.value;
        const openaiModel = DOM.openaiModelSelect?.value || 'gpt-4o';
        const groqWhisperModel = DOM.groqWhisperModelSelect?.value || 'whisper-large-v3-turbo';


        const voiceProvider = document.querySelector('input[name="voice-provider"]:checked')?.value || 'browser';
        const dailyWordGoal = DOM.dailyWordGoalSelect.value;
        const explanationLanguage = DOM.explanationLanguageSelect?.value || 'en';

        if (voiceProvider === 'openai' && !openaiKey) {
            showToast('OpenAI API key is required for Whisper voice input.', 'error');
            return;
        }
        if (voiceProvider === 'gemini-stt' && !geminiKey) {
            showToast('Gemini API key is required for Gemini voice input.', 'error');
            return;
        }
        if (voiceProvider === 'groq-whisper' && !groqKey) {
            showToast('Groq API key is required for Groq Whisper voice input.', 'error');
            return;
        }

        state.settings.ai_provider = provider;
        state.settings.gemini_api_key = geminiKey;
        state.settings.gemini_api_key_2 = geminiKey2;
        state.settings.gemini_api_key_3 = geminiKey3;
        state.settings.groq_api_key = groqKey;
        state.settings.groq_api_key_2 = groqKey2;
        state.settings.groq_api_key_3 = groqKey3;
        state.settings.openrouter_api_key = openrouterKey;
        state.settings.openrouter_api_key_2 = openrouterKey2;
        state.settings.openrouter_api_key_3 = openrouterKey3;

        state.settings.openai_api_key = openaiKey;
        state.settings.openai_api_key_2 = openaiKey2;
        state.settings.openai_api_key_3 = openaiKey3;
        state.settings.openai_model = openaiModel;
        state.settings.gemini_model = geminiModel;
        state.settings.groq_model = groqModel;
        state.settings.openrouter_model = openrouterModel;


        state.settings.voice_provider = voiceProvider;
        state.settings.groq_whisper_model = groqWhisperModel;
        state.settings.explanation_language = explanationLanguage;

        // Persist all API keys to THIS DEVICE only — never sent to the server.
        saveLocalApiKeys(state.user?.id);

        // Save model selections to localStorage
        localStorage.setItem('uccharon_gemini_model', geminiModel);
        localStorage.setItem('uccharon_groq_model', groqModel);
        localStorage.setItem('uccharon_openrouter_model', openrouterModel);

        localStorage.setItem('uccharon_voice_provider', state.settings.voice_provider);
        localStorage.setItem('uccharon_groq_whisper_model', groqWhisperModel);

        DOM.saveSettingsBtn.classList.add('btn-loading');
        DOM.saveSettingsBtn.disabled = true;

        try {
            // Only non-sensitive preferences are synced to the server. API keys
            // are intentionally excluded — they live on the device only.
            await api('/api/settings/', 'PUT', {
                ai_provider: provider,
                openai_model: openaiModel,

                explanation_language: explanationLanguage,
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

    // ─── Account Deletion ────────────────────────────────

    function openDeleteAccountModal() {
        if (!DOM.deleteAccountOverlay) return;
        DOM.deleteAccountOverlay.style.display = 'flex';
    }

    function closeDeleteAccountModal() {
        if (!DOM.deleteAccountOverlay) return;
        DOM.deleteAccountOverlay.style.display = 'none';
    }

    async function handleDeleteAccount() {
        const btn = DOM.confirmDeleteAccountBtn;
        const userId = state.user?.id;

        if (btn) {
            btn.classList.add('btn-loading');
            btn.disabled = true;
        }
        if (DOM.cancelDeleteAccountBtn) DOM.cancelDeleteAccountBtn.disabled = true;

        try {
            await api('/api/auth/delete-account/', 'POST');

            // Wipe ALL locally-stored data for this device (device-only API keys,
            // theme, model/provider memory, collapsed sections, cached settings).
            clearAllUccharonLocalData(userId);
            clearAllPersistedConversationIds();
            clearAllPersistedViews();
            resetChatState();
            state.user = null;

            showToast('Your account has been deleted.', 'success');

            // Send the user back to the public homepage.
            window.location.href = '/';
        } catch (err) {
            if (btn) {
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }
            if (DOM.cancelDeleteAccountBtn) DOM.cancelDeleteAccountBtn.disabled = false;
            showToast(err.message || 'Failed to delete account', 'error');
        }
    }

    function initSettings() {
        DOM.settingsBtn.addEventListener('click', openSettings);
        DOM.closeSettings.addEventListener('click', closeSettings);
        DOM.settingsOverlay.addEventListener('click', closeSettings);
        DOM.saveSettingsBtn.addEventListener('click', saveSettings);

        // Account deletion: open confirmation modal, then delete on confirm.
        if (DOM.deleteAccountBtn) {
            DOM.deleteAccountBtn.addEventListener('click', openDeleteAccountModal);
        }
        if (DOM.cancelDeleteAccountBtn) {
            DOM.cancelDeleteAccountBtn.addEventListener('click', closeDeleteAccountModal);
        }
        if (DOM.deleteAccountOverlay) {
            // Clicking the dimmed backdrop (outside the dialog) cancels.
            DOM.deleteAccountOverlay.addEventListener('click', (e) => {
                if (e.target === DOM.deleteAccountOverlay) closeDeleteAccountModal();
            });
        }
        if (DOM.confirmDeleteAccountBtn) {
            DOM.confirmDeleteAccountBtn.addEventListener('click', handleDeleteAccount);
        }


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

        // Groq is unavailable for Bengali explanations — update UI on language change
        if (DOM.explanationLanguageSelect) {
            DOM.explanationLanguageSelect.addEventListener('change', () => {
                _updateGroqBengaliState();
            });
        }


        // Wire up per-key "Validate" buttons and Save-gating
        // (openSettings() re-seeds validation state each time the drawer opens)
        initSettingsKeyValidation();

        DOM.chatMessages.addEventListener('scroll', updateScrollToBottomButton, { passive: true });


        window.addEventListener('resize', updateScrollToBottomButton);
        DOM.scrollToBottomBtn.addEventListener('click', () => {
            scrollToBottom();
        });
    }

