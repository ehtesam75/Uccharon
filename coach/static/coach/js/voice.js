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

        state.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopRecording();
            if (event.error === 'not-allowed') {
                showToast('Microphone access denied. Please allow access in browser settings.', 'error');
            }
        };

        state.recognition.onend = () => {
            if (state.isRecording && state.settings.voice_provider === 'browser') {
                try { state.recognition.start(); } catch (e) { stopRecording(); }
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

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Whisper API error: ${res.status}`);
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

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini STT error: ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // ─── Groq Whisper transcription ──────────────────

    async function _transcribeWithGroq(audioBlob, apiKey, model) {
        const formData = new FormData();
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'mp4';
        formData.append('file', new File([audioBlob], `recording.${ext}`, { type: audioBlob.type }));
        formData.append('model', model || 'whisper-large-v3-turbo');
        formData.append('language', 'en');
        formData.append('response_format', 'json');
        formData.append('temperature', '0');

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Groq Whisper error: ${res.status}`);
        }

        const data = await res.json();
        return data.text || '';
    }

    // ─── Speech-to-Text fallback + last-success tracking ───

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
    async function _transcribeWithSttFallback(blob, primaryProvider, statusSpan) {
        const attempts = _buildSttAttemptList(primaryProvider);
        if (attempts.length === 0) {
            throw new Error('No available speech-to-text provider is configured.');
        }

        let lastError = null;
        let prevLabel = null;
        for (let i = 0; i < attempts.length; i++) {
            const attempt = attempts[i];
            if (statusSpan) {
                if (i === 0) {
                    statusSpan.textContent = 'Transcribing...';
                } else if (attempt.label !== prevLabel) {
                    statusSpan.textContent = `Switching to ${attempt.label}...`;
                } else {
                    statusSpan.textContent = 'Trying another key...';
                }
            }
            try {
                const transcript = await _transcribeAttempt(attempt, blob);
                _saveSttLastSuccess(attempt.provider, attempt.model, attempt.keyIndex);
                return transcript;
            } catch (err) {
                lastError = err;
                console.error(`[STT Fallback] ${attempt.label} (${attempt.model}, key ${attempt.keyIndex + 1}) failed:`, err.message);
                prevLabel = attempt.label;
            }
        }
        throw lastError || new Error('All speech-to-text providers failed.');
    }

