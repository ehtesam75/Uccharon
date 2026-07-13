/**
 * Uccharon - AI English Speaking Coach
 * Authentication: login, multi-step signup, logout
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // AUTH
    // ═══════════════════════════════════════════════════════

    function initAuth() {
        DOM.showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.loginForm.style.display = 'none';
            DOM.signupForm.style.display = 'block';
            DOM.authBrand.style.display = 'none';
            resetSignupFlow();
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
        DOM.signupStep2NextBtn.addEventListener('click', handleSignupStep2Next);
        DOM.signupBtn.addEventListener('click', handleSignup);
        DOM.signupBackBtn.addEventListener('click', () => {
            setSignupStep(1);
        });
        DOM.signupStep3BackBtn.addEventListener('click', () => {
            setSignupStep(2);
        });

        DOM.signupUsername.addEventListener('input', updateSignupStep1State);
        DOM.signupEmail.addEventListener('input', updateSignupStep1State);
        DOM.signupPassword.addEventListener('input', updateSignupStep1State);
        DOM.signupConfirmPassword.addEventListener('input', updateSignupStep1State);
        DOM.signupAiProvider.addEventListener('change', () => {
            // Provider changed -> previous validation no longer applies
            state.signupValidatedKey = null;
            state.signupValidatedProvider = null;
            setKeyValidationStatus(DOM.signupValidateStatus, null);
            updateSignupStep2State();
        });
        DOM.signupApiKey.addEventListener('input', () => {
            // Key edited -> previous validation no longer applies
            if (!isSignupKeyValidated()) {
                setKeyValidationStatus(DOM.signupValidateStatus, null);
            }
            updateSignupStep2State();
        });
        if (DOM.signupValidateBtn) {

            DOM.signupValidateBtn.addEventListener('click', handleSignupValidate);
        }


        // Goal cards selection
        const goalCards = $$('.goal-card');
        goalCards.forEach(card => {
            card.addEventListener('click', () => {
                goalCards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                window.selectedDailyGoal = card.dataset.goal;
                DOM.signupBtn.disabled = false;
                updateSignupStep3State();
            });
        });

        // Enter key support
        DOM.loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        DOM.signupConfirmPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignupNext();
        });
        DOM.signupApiKey.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSignupStep2Next();
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
            resetChatState();
            state.user = data.user;
            migrateLegacyConversationId(state.user.id);
            clearOtherUsersConversationIds(state.user.id);
            loadCollapsedSections();
            await loadUserData(true);
            // A fresh login is a new session — start a new chat, don't restore.
            clearPersistedView();
            clearPersistedConversationId();
            await startNewSession();
            showApp();
        } catch (err) {
            showAuthError('login', err.message);
        } finally {
            DOM.loginBtn.classList.remove('btn-loading');
            DOM.loginBtn.disabled = false;
        }
    }

    async function handleSignupNext() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;
        const confirmPassword = DOM.signupConfirmPassword.value;

        if (!username || !email || !password || !confirmPassword) {
            showAuthError('signup1', 'Please fill in all fields.');
            return;
        }
        if (!DOM.signupEmail.checkValidity()) {
            showAuthError('signup1', 'Please enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            showAuthError('signup1', 'Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            showAuthError('signup1', 'Passwords do not match.');
            return;
        }

        DOM.signupNextBtn.classList.add('btn-loading');
        DOM.signupNextBtn.disabled = true;

        try {
            await api('/api/auth/validate-signup-step1/', 'POST', { username, email });
            setSignupStep(2);
        } catch (err) {
            showAuthError('signup1', err.message);
        } finally {
            DOM.signupNextBtn.classList.remove('btn-loading');
            DOM.signupNextBtn.disabled = false;
        }
    }

    function handleSignupStep2Next() {
        const provider = DOM.signupAiProvider.value;
        const apiKey = DOM.signupApiKey.value.trim();

        if (!provider) {
            showAuthError('signup2', 'Please select an AI provider.');
            return;
        }

        if (!isValidSignupApiKey(apiKey)) {
            showAuthError('signup2', 'Please enter a valid API key.');
            return;
        }

        if (!isSignupKeyValidated()) {
            showAuthError('signup2', 'Please validate your API key before continuing.');
            return;
        }

        setSignupStep(3);
    }

    // Returns true if the current provider+key combination has been successfully validated
    function isSignupKeyValidated() {
        const provider = DOM.signupAiProvider.value;
        const apiKey = DOM.signupApiKey.value.trim();
        return Boolean(
            provider &&
            apiKey &&
            state.signupValidatedProvider === provider &&
            state.signupValidatedKey === apiKey
        );
    }

    async function handleSignupValidate() {
        const provider = DOM.signupAiProvider.value;
        const apiKey = DOM.signupApiKey.value.trim();

        if (!provider) {
            showAuthError('signup2', 'Please select an AI provider.');
            return;
        }
        if (!isValidSignupApiKey(apiKey)) {
            showAuthError('signup2', 'Please enter a valid API key.');
            return;
        }

        DOM.signupValidateBtn.classList.add('is-validating');
        DOM.signupValidateBtn.disabled = true;
        setKeyValidationStatus(DOM.signupValidateStatus, 'checking', 'Checking API key…');

        try {
            const result = await ProviderFactory.validateApiKey(provider, apiKey);
            if (result.valid) {
                state.signupValidatedProvider = provider;
                state.signupValidatedKey = apiKey;
                setKeyValidationStatus(DOM.signupValidateStatus, 'success', '✓ API key verified');
            } else {
                state.signupValidatedProvider = null;
                state.signupValidatedKey = null;
                setKeyValidationStatus(DOM.signupValidateStatus, 'error', `✗ ${result.error || 'Invalid API key'}`);
            }
        } catch (e) {
            state.signupValidatedProvider = null;
            state.signupValidatedKey = null;
            setKeyValidationStatus(DOM.signupValidateStatus, 'error', '✗ Invalid API key');
        } finally {
            DOM.signupValidateBtn.classList.remove('is-validating');
            DOM.signupValidateBtn.disabled = false;
            updateSignupStep2State();
        }
    }


    async function handleSignup() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;
        const confirmPassword = DOM.signupConfirmPassword.value;
        const ai_provider = DOM.signupAiProvider.value;
        const apiKey = DOM.signupApiKey.value.trim();
        const daily_word_goal = window.selectedDailyGoal;

        if (password !== confirmPassword) {
            showAuthError('signup1', 'Passwords do not match.');
            setSignupStep(1);
            return;
        }
        if (!ai_provider || !isValidSignupApiKey(apiKey)) {
            showAuthError('signup2', 'Please complete the AI key step before continuing.');
            setSignupStep(2);
            return;
        }
        if (!daily_word_goal) {
            showAuthError('signup3', 'Please select a daily goal.');
            return;
        }

        DOM.signupBtn.classList.add('btn-loading');
        DOM.signupBtn.disabled = true;

        try {
            const data = await api('/api/auth/signup/', 'POST', {
                username,
                email,
                password,
                ai_provider,
                gemini_api_key: ai_provider === 'gemini' ? apiKey : '',
                groq_api_key: ai_provider === 'groq' ? apiKey : '',
                openrouter_api_key: ai_provider === 'openrouter' ? apiKey : '',

                daily_word_goal
            });
            clearAllPersistedConversationIds();
            resetChatState();
            state.user = data.user;
            loadCollapsedSections();

            // Explicitly force defaults for local settings on new signup
            // so they don't inherit a previous user's settings on the same machine
            localStorage.setItem('uccharon_voice_provider', 'browser');
            localStorage.removeItem('uccharon_openai_api_key');

            await loadUserData(true);
            showWelcomeScreen();
            DOM.authScreen.style.display = 'none';
            showApp();
        } catch (err) {
            showAuthError('signup3', err.message);
        } finally {
            DOM.signupBtn.classList.remove('btn-loading');
            DOM.signupBtn.disabled = false;
        }
    }

    function setSignupStep(step) {
        DOM.signupStep1.style.display = step === 1 ? 'block' : 'none';
        DOM.signupStep2.style.display = step === 2 ? 'block' : 'none';
        DOM.signupStep3.style.display = step === 3 ? 'block' : 'none';
        if (DOM.signupForm) {
            DOM.signupForm.scrollTo({ top: 0, behavior: 'smooth' });
        }

        DOM.signupProgressSteps.forEach(stepEl => {
            const stepNumber = Number(stepEl.dataset.step);
            stepEl.classList.toggle('active', stepNumber === step);
            stepEl.classList.toggle('completed', stepNumber < step);
            if (stepNumber === step) stepEl.setAttribute('aria-current', 'step');
            else stepEl.removeAttribute('aria-current');
        });

        clearSignupError('signup1');
        clearSignupError('signup2');
        clearSignupError('signup3');

        if (step === 1) {
            updateSignupStep1State();
        } else if (step === 2) {
            updateSignupStep2State();
        } else {
            updateSignupStep3State();
        }
    }

    function resetSignupFlow() {
        DOM.signupUsername.value = '';
        DOM.signupEmail.value = '';
        DOM.signupPassword.value = '';
        DOM.signupConfirmPassword.value = '';
        DOM.signupAiProvider.value = '';
        DOM.signupApiKey.value = '';
        DOM.signupApiKeySection.style.display = 'none';
        if (DOM.signupKeyGuide) DOM.signupKeyGuide.style.display = 'none';
        window.selectedDailyGoal = null;
        $$('.goal-card').forEach(card => card.classList.remove('selected'));
        DOM.signupNextBtn.disabled = true;
        DOM.signupStep2NextBtn.disabled = true;
        DOM.signupBtn.disabled = true;
        setSignupStep(1);
    }

    function clearSignupError(form) {
        let el;
        if (form === 'signup1') el = DOM.signupError1;
        else if (form === 'signup2') el = DOM.signupError2;
        else if (form === 'signup3') el = DOM.signupError3;
        else return;
        el.textContent = '';
        el.classList.remove('show');
    }

    function isValidSignupApiKey(apiKey) {
        return Boolean(apiKey) && apiKey.length >= 20 && !/\s/.test(apiKey);
    }

    function updateSignupStep1State() {
        const username = DOM.signupUsername.value.trim();
        const email = DOM.signupEmail.value.trim();
        const password = DOM.signupPassword.value;
        const confirmPassword = DOM.signupConfirmPassword.value;
        const isValid = Boolean(username && email && DOM.signupEmail.checkValidity() && password.length >= 6 && confirmPassword && password === confirmPassword);
        DOM.signupNextBtn.disabled = !isValid;
    }

    function updateSignupStep2State() {
        const provider = DOM.signupAiProvider.value;
        const apiKey = DOM.signupApiKey.value.trim();
        DOM.signupApiKeySection.style.display = provider ? 'block' : 'none';
        if (DOM.signupKeyGuide) {
            DOM.signupKeyGuide.style.display = (provider === 'groq') ? 'block' : 'none';
        }
        // Validate button is enabled only when a provider + a well-formed key is present
        if (DOM.signupValidateBtn) {
            DOM.signupValidateBtn.disabled = !(provider && isValidSignupApiKey(apiKey));
        }
        // Next Step is enabled only after the key has been successfully validated
        DOM.signupStep2NextBtn.disabled = !(provider && isValidSignupApiKey(apiKey) && isSignupKeyValidated());
    }


    function updateSignupStep3State() {
        DOM.signupBtn.disabled = !window.selectedDailyGoal;
    }

    function showAuthError(form, message) {
        let el;
        if (form === 'login') el = DOM.loginError;
        else if (form === 'signup1') el = DOM.signupError1;
        else if (form === 'signup2') el = DOM.signupError2;
        else if (form === 'signup3') el = DOM.signupError3;
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
                state.settings.groq_whisper_model = localStorage.getItem('uccharon_groq_whisper_model') || 'whisper-large-v3-turbo';
                resetChatState();

                migrateLegacyConversationId(state.user.id);
                loadCollapsedSections();
                clearOtherUsersConversationIds(state.user.id);
                await loadConversations(true);
                await restoreSession();
                showApp();
            } else {
                clearAllPersistedConversationIds();
                resetChatState();
                DOM.authScreen.style.display = 'flex';
                hideGlobalSplash();
            }
        } catch (e) {
            // Not logged in, show auth screen
            clearAllPersistedConversationIds();
            resetChatState();
            DOM.authScreen.style.display = 'flex';
            hideGlobalSplash();
        }
    }

    async function handleLogout() {
        try {
            // Delete the current conversation if it has no messages
            if (state.currentConversation && state.currentMessages.length === 0) {
                await deleteConversationById(state.currentConversation.id);
            }

            await api('/api/auth/logout/', 'POST');
            clearAllPersistedConversationIds();
            clearAllPersistedViews();
            resetChatState();
            state.user = null;
            DOM.app.style.display = 'none';
            DOM.dashboardScreen.style.display = 'none';
            DOM.learningHistoryScreen.style.display = 'none';
            DOM.authScreen.style.display = 'flex';
        } catch (err) {
            showToast('Logout failed', 'error');
        }
    }

