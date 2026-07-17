/**
 * Uccharon - AI English Speaking Coach
 * Voice input: browser speech + Whisper/Gemini/Groq STT
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

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

        // Disable interim results on mobile to prevent Android Chrome duplication bugs
        const isMobile = window.matchMedia('(max-width: 768px)').matches || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        state.recognition = new SpeechRecognition();
        state.recognition.continuous = true;
        state.recognition.interimResults = !isMobile;
        state.recognition.lang = 'en-US';

        state.recognition.onstart = () => {
            state.initialInputText = DOM.chatInput.value;
            state.finalTranscript = ''; // Track final parts separately
        };

        state.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    state.finalTranscript += text;
                } else {
                    interimTranscript += text;
                }
            }

            let transcript = state.finalTranscript + interimTranscript;
            let prefix = state.initialInputText || '';

            if (prefix && !prefix.endsWith(' ') && transcript && !transcript.startsWith(' ')) {
                prefix += ' ';
            }

            DOM.chatInput.value = prefix + transcript;
            resizeChatInput();
        };

        // 'no-speech' and 'aborted' are transient/expected during continuous
        // recognition — don't tear the session down or nag the user for them.
        // For genuine failures, stop and show an accurate, actionable message.
        state.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            if (event.error === 'no-speech' || event.error === 'aborted') {
                return; // onend will restart the session if still recording
            }

            stopRecording();

            switch (event.error) {
                case 'not-allowed':
                case 'service-not-allowed':
                    showToast('Microphone access denied. Please allow access in browser settings.', 'error');
                    break;
                case 'audio-capture':
                    showToast('No microphone was found. Please connect a microphone and try again.', 'error');
                    break;
                case 'network':
                    // Browser STT relies on an online recognition service. Point the
                    // user to the API-based providers, which have their own fallback.
                    showToast('Browser speech recognition lost its connection. Try Whisper, Groq, or Gemini voice in Settings for more reliable transcription.', 'error');
                    break;
                default:
                    showToast('Speech recognition error. Please try again or switch voice provider in Settings.', 'error');
            }
        };

        // Auto-restart keeps continuous recognition alive across the browser's
        // periodic session cutoffs. If restart throws (e.g. the service is
        // unavailable), stop cleanly rather than leaving the UI stuck recording.
        state.recognition.onend = () => {
            if (state.isRecording && state.settings.voice_provider === 'browser') {
                try {
                    state.recognition.start();
                } catch (e) {
                    console.error('Browser speech recognition failed to restart:', e);
                    stopRecording();
                    showToast('Browser voice input stopped unexpectedly. You can switch to Whisper, Groq, or Gemini voice in Settings.', 'error');
                }
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

    // Stop the microphone recording only when one is currently active, then
    // release the microphone. Safe to call unconditionally (e.g. when sending a
    // message or switching chats).
    function stopRecordingIfActive() {
        if (state.isRecording) {
            stopRecording();
        }
    }


    // Returns the current mic permission state: 'granted' | 'denied' | 'prompt' | 'unknown'
    async function _getMicPermissionState() {
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({ name: 'microphone' });
                return status.state;
            } catch (e) {
                // Some browsers (e.g. Firefox) throw for 'microphone' — fall through
                return 'unknown';
            }
        }
        return 'unknown';
    }

    // Explicitly prompts the user for mic access. Returns true if granted.
    async function _requestMicPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Microphone is not supported in this browser.', 'error');
            return false;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Release immediately — we only wanted to confirm/obtain permission
            stream.getTracks().forEach(t => t.stop());
            return true;
        } catch (err) {
            if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
                showToast('Microphone access is blocked. Please allow microphone access in your browser settings, then try again.', 'error');
            } else if (err && err.name === 'NotFoundError') {
                showToast('No microphone was found. Please connect a microphone and try again.', 'error');
            } else {
                showToast('Could not access the microphone: ' + (err?.message || 'Unknown error'), 'error');
            }
            return false;
        }
    }

    async function startRecording() {
        const provider = state.settings.voice_provider || 'browser';

        // Proactively verify microphone permission before attempting to record.
        const permissionState = await _getMicPermissionState();
        if (permissionState === 'denied') {
            showToast('Microphone access is blocked. Please allow microphone access in your browser settings to use voice input.', 'error');
            return;
        }
        if (permissionState !== 'granted') {
            // 'prompt' or 'unknown' — ask the user for access up-front so they get a clear prompt
            const granted = await _requestMicPermission();
            if (!granted) return;
        }

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
            if (_getProviderKeys('openai').length === 0) {
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

        } else if (provider === 'groq-whisper') {
            if (_getProviderKeys('groq').length === 0) {
                showToast('Please set your Groq API key in Settings to use Groq Whisper.', 'error');
                openSettings();
                return;
            }
            _startMediaRecorder('groq-whisper');
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

    // Reset the status label back to its idle "Listening..." text
    function _resetMicStatusText() {
        const statusSpan = DOM.micStatus.querySelector('.mic-status-text');
        if (statusSpan) statusSpan.textContent = 'Listening...';
    }

    // Fully tear down any lingering recorder/stream so a new recording starts clean
    function _cleanupMediaRecorder() {
        try {
            if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
                state.mediaRecorder.stop();
            }
        } catch (e) { /* ignore */ }
        try {
            if (state.activeStream) {
                state.activeStream.getTracks().forEach(t => t.stop());
            }
        } catch (e) { /* ignore */ }
        state.mediaRecorder = null;
        state.activeStream = null;
        state.audioChunks = [];
    }

    function _startMediaRecorder(targetProvider) {
        // Ensure no previous recorder/stream is still holding the microphone
        _cleanupMediaRecorder();

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                state.initialInputText = DOM.chatInput.value;

                // Use a recording-local chunks array to prevent any cross-recording contamination
                const chunks = [];
                state.activeStream = stream;

                // Prefer webm/opus; fall back to whatever the browser offers
                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

                const options = mimeType ? { mimeType } : {};
                const recorder = new MediaRecorder(stream, options);
                state.mediaRecorder = recorder;

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = async () => {
                    // Release the microphone immediately and drop stale references
                    try { stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ }
                    if (state.activeStream === stream) state.activeStream = null;
                    if (state.mediaRecorder === recorder) state.mediaRecorder = null;

                    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
                    chunks.length = 0;

                    // Guard against empty / too-short recordings that cause hallucinated output
                    if (blob.size < 1200) {
                        DOM.micStatus.style.display = 'none';
                        _resetMicStatusText();
                        DOM.micBtn.disabled = false;
                        if (blob.size > 0) {
                            showToast('No speech detected. Please try again.', 'error');
                        }
                        return;
                    }

                    // Show "Transcribing..." indicator (target the dedicated text span, not the pulse dot)
                    DOM.micStatus.style.display = 'flex';
                    const statusSpan = DOM.micStatus.querySelector('.mic-status-text');
                    if (statusSpan) statusSpan.textContent = 'Transcribing...';
                    DOM.micBtn.disabled = true;

                    try {
                        const transcript = await _transcribeWithSttFallback(blob, targetProvider, statusSpan);

                        if (transcript && transcript.trim()) {
                            let prefix = state.initialInputText || '';
                            if (prefix && !prefix.endsWith(' ') && !transcript.startsWith(' ')) {
                                prefix += ' ';
                            }
                            DOM.chatInput.value = prefix + transcript.trim();
                            resizeChatInput();
                            DOM.chatInput.focus();
                        } else {
                            // Empty/silent recording (or a discarded hallucinated
                            // filler phrase) — don't inject meaningless text.
                            showToast('No speech detected. Please try again.', 'error');
                        }
                    } catch (err) {

                        showToast('Transcription failed: ' + err.message, 'error');
                    } finally {
                        DOM.micStatus.style.display = 'none';
                        _resetMicStatusText();
                        DOM.micBtn.disabled = false;
                    }
                };

                recorder.start();
                const STT_LABELS = { openai: 'Whisper', 'gemini-stt': 'Gemini', 'groq-whisper': 'Groq' };
                const label = STT_LABELS[targetProvider] || 'Voice';
                _setRecordingUI(true, label);
            })
            .catch(err => {
                _cleanupMediaRecorder();
                _setRecordingUI(false);
                if (err.name === 'NotAllowedError') {
                    showToast('Microphone access denied. Please allow access in browser settings.', 'error');
                } else {
                    showToast('Could not access microphone: ' + err.message, 'error');
                }
            });
    }

    // ─── OpenAI Whisper transcription ────────────────────

    async function _transcribeWithWhisper(audioBlob, apiKey) {
        apiKey = apiKey || state.settings.openai_api_key;
        const formData = new FormData();
        // Whisper requires a filename with a supported extension
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
        formData.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');

        const res = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        }, STT_TIMEOUT_MS, 'Whisper');

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new ProviderError(
                err.error?.message || `Whisper API error: ${res.status}`,
                { status: res.status, provider: 'Whisper', type: classifyStatus(res.status) }
            );
        }

        const data = await res.json();
        return data.text || '';
    }


    // ─── Gemini audio understanding transcription ─────────

    async function _transcribeWithGemini(audioBlob, apiKey, model) {
        apiKey = apiKey || state.settings.gemini_api_key;
        model = model || state.settings.gemini_model || 'gemini-2.0-flash';
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

        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, STT_TIMEOUT_MS, 'Gemini');

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new ProviderError(
                err.error?.message || `Gemini STT error: ${res.status}`,
                { status: res.status, provider: 'Gemini', type: classifyStatus(res.status) }
            );
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Gemini STT can also hallucinate short filler phrases on silent audio.
        // Apply the same guard used for Whisper/Groq so we never inject junk.
        if (_isLikelyEmptyTranscript(text)) {
            return '';
        }
        return text;
    }


    // ─── Groq Whisper transcription ──────────────────

    // Whisper-family models (including Groq Whisper) hallucinate short filler
    // phrases such as "you" or "thank you" when the
    // recording is silent or contains no real speech. When the ENTIRE transcript
    // is nothing but one of these filler phrases, treat it as an empty recording
    // so we don't inject meaningless text into the chat input.
    const WHISPER_HALLUCINATION_PHRASES = new Set([
        'you',
        'you.',
        'You.',
        'thank you',
        'thank you.',
        'Thank you.'
    ]);

    function _isLikelyEmptyTranscript(text) {
        if (!text) return true;
        // Normalize: lowercase, trim, strip surrounding punctuation/whitespace.
        const normalized = text
            .trim()
            .toLowerCase()
            .replace(/[\s]+/g, ' ')
            .replace(/^[\s.,!?…-]+|[\s.,!?…-]+$/g, '')
            .trim();
        if (!normalized) return true;
        return WHISPER_HALLUCINATION_PHRASES.has(normalized);
    }

    async function _transcribeWithGroq(audioBlob, apiKey, model) {
        const formData = new FormData();
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
        formData.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
        formData.append('model', model || 'whisper-large-v3-turbo');
        formData.append('language', 'en');
        formData.append('response_format', 'json');
        formData.append('temperature', '0');

        const res = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        }, STT_TIMEOUT_MS, 'Groq');

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new ProviderError(
                err.error?.message || `Groq Whisper error: ${res.status}`,
                { status: res.status, provider: 'Groq', type: classifyStatus(res.status) }
            );
        }


        const data = await res.json();
        const text = data.text || '';

        // Silent/empty recording produced a hallucinated filler phrase — discard it.
        if (_isLikelyEmptyTranscript(text)) {
            return '';
        }
        return text;
    }


    // ─── Speech-to-Text fallback + last-success tracking ───

    // Transcription can take a while for longer clips, so allow more time than a
    // plain chat request before we give up and fall back to the next attempt.
    const STT_TIMEOUT_MS = 60000;

    function _getSttLastSuccess() {

        try {
            const raw = localStorage.getItem('uccharon_stt_last_success');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function _saveSttLastSuccess(provider, model, keyIndex) {
        localStorage.setItem('uccharon_stt_last_success', JSON.stringify({ provider, model, keyIndex }));
    }

    const GROQ_WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'];

    /**
     * Build an ordered STT attempt list.
     * Priority: chosen provider first (last successful model/key prioritized),
     * then remaining providers as fallback. Each key is tried before moving on.
     * Attempt shape: { provider, model, key, keyIndex, label }
     */
    function _buildSttAttemptList(primaryProvider) {
        const last = _getSttLastSuccess();
        const groqKeys = _getProviderKeys('groq');
        const geminiKeys = _getProviderKeys('gemini');
        const openaiKeys = _getProviderKeys('openai');
        const groqModel = state.settings.groq_whisper_model || 'whisper-large-v3-turbo';
        const geminiModel = state.settings.gemini_model || 'gemini-2.0-flash';


        const builders = {
            'groq-whisper': () => {
                const list = [];
                const models = [groqModel, ...GROQ_WHISPER_MODELS.filter(m => m !== groqModel)];
                for (const model of models) {
                    const order = [];
                    if (last && last.provider === 'groq-whisper' && last.model === model &&
                        typeof last.keyIndex === 'number' && last.keyIndex < groqKeys.length) {
                        order.push(last.keyIndex);
                    }
                    for (let i = 0; i < groqKeys.length; i++) if (!order.includes(i)) order.push(i);
                    for (const i of order) {
                        list.push({ provider: 'groq-whisper', model, key: groqKeys[i], keyIndex: i, label: 'Groq' });
                    }
                }
                return list;
            },
            'openai': () => {
                const list = [];
                const order = [];
                if (last && last.provider === 'openai' &&
                    typeof last.keyIndex === 'number' && last.keyIndex < openaiKeys.length) {
                    order.push(last.keyIndex);
                }
                for (let i = 0; i < openaiKeys.length; i++) if (!order.includes(i)) order.push(i);
                for (const i of order) {
                    list.push({ provider: 'openai', model: 'whisper-1', key: openaiKeys[i], keyIndex: i, label: 'Whisper' });
                }
                return list;
            },

            'gemini-stt': () => {
                const list = [];
                const order = [];
                if (last && last.provider === 'gemini-stt' &&
                    typeof last.keyIndex === 'number' && last.keyIndex < geminiKeys.length) {
                    order.push(last.keyIndex);
                }
                for (let i = 0; i < geminiKeys.length; i++) if (!order.includes(i)) order.push(i);
                for (const i of order) {
                    list.push({ provider: 'gemini-stt', model: geminiModel, key: geminiKeys[i], keyIndex: i, label: 'Gemini' });
                }
                return list;
            }
        };

        const providerOrder = [primaryProvider, ...Object.keys(builders).filter(p => p !== primaryProvider)];
        const attempts = [];
        for (const prov of providerOrder) {
            if (builders[prov]) attempts.push(...builders[prov]());
        }
        return attempts;
    }

    async function _transcribeAttempt(attempt, blob) {
        if (attempt.provider === 'groq-whisper') {
            return _transcribeWithGroq(blob, attempt.key, attempt.model);
        } else if (attempt.provider === 'openai') {
            return _transcribeWithWhisper(blob, attempt.key);
        } else if (attempt.provider === 'gemini-stt') {
            return _transcribeWithGemini(blob, attempt.key, attempt.model);
        }
        throw new Error('Unknown STT provider: ' + attempt.provider);
    }

    /**
     * Transcribe with automatic fallback across keys and providers.
     * Remembers the last successful provider/model/key for future prioritization.
     */
    // Accurate STT status message based on WHY the previous attempt failed and
    // whether we're switching to a different STT provider next.
    function _sttReasonMessage(prevErrorType, providerChanged, nextLabel) {
        switch (prevErrorType) {
            case 'auth':
                return providerChanged
                    ? `API key unauthorized. Switching to ${nextLabel}...`
                    : 'API key unauthorized. Trying another key...';
            case 'rate_limit':
                return providerChanged
                    ? `Rate limit reached. Switching to ${nextLabel}...`
                    : 'Rate limit reached. Trying another key...';
            case 'model_unavailable':
                return providerChanged
                    ? `Model unavailable. Switching to ${nextLabel}...`
                    : 'Model unavailable. Trying another model...';
            case 'timeout':
                return providerChanged
                    ? `Timed out. Switching to ${nextLabel}...`
                    : 'Timed out. Trying another key...';
            default:
                return providerChanged
                    ? `Switching to ${nextLabel}...`
                    : 'Trying another key...';
        }
    }

    async function _transcribeWithSttFallback(blob, primaryProvider, statusSpan) {
        const attempts = _buildSttAttemptList(primaryProvider);
        if (attempts.length === 0) {
            throw new Error('No available speech-to-text provider is configured.');
        }

        // Per-request cooldown — same idea as the chat fallback. Skip attempts we
        // already know can't succeed right now instead of blindly retrying them.
        const deadKeys = new Set();          // "provider|keyIndex" (401/403)
        const rateLimitedKeys = new Set();   // "provider|keyIndex" (429)
        const deadModels = new Set();        // "provider|model" (404 / unavailable)

        let lastError = null;
        let prevLabel = null;
        let prevErrorType = null;
        let started = false;

        for (let i = 0; i < attempts.length; i++) {
            const attempt = attempts[i];
            const keySig = `${attempt.provider}|${attempt.keyIndex}`;
            const modelSig = `${attempt.provider}|${attempt.model}`;

            if (deadKeys.has(keySig)) continue;
            if (rateLimitedKeys.has(keySig)) continue;
            if (deadModels.has(modelSig)) continue;

            if (statusSpan) {
                if (!started) {
                    statusSpan.textContent = 'Transcribing...';
                } else {
                    statusSpan.textContent = _sttReasonMessage(prevErrorType, attempt.label !== prevLabel, attempt.label);
                }
            }
            started = true;

            try {
                const transcript = await _transcribeAttempt(attempt, blob);
                _saveSttLastSuccess(attempt.provider, attempt.model, attempt.keyIndex);
                return transcript;
            } catch (err) {
                lastError = err;
                prevErrorType = (err && err.type) ? err.type : 'unknown';
                console.error(`[STT Fallback] ${attempt.label} (${attempt.model}, key ${attempt.keyIndex + 1}) failed [${prevErrorType}]:`, err.message);
                prevLabel = attempt.label;

                // Smart classification — record cooldowns to skip doomed retries.
                switch (prevErrorType) {
                    case 'auth':
                        deadKeys.add(keySig);            // bad key everywhere
                        break;
                    case 'rate_limit':
                        rateLimitedKeys.add(keySig);     // throttled key
                        break;
                    case 'model_unavailable':
                        deadModels.add(modelSig);        // model gone for all keys
                        break;
                    case 'validation':
                        // Request itself rejected — retrying won't help. Stop.
                        throw err;
                    default:
                        // server / network / timeout / parse — allow normal fallback.
                        break;
                }
            }
        }
        throw lastError || new Error('All speech-to-text providers failed.');
    }


