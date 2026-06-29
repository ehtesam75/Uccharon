#!/usr/bin/env python3
"""Patch voice settings section in index.html"""
import sys

path = r'coach\templates\coach\index.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section by unique marker strings
start_marker = '<!-- Voice Input Provider -->'
end_marker = '<button id="save-settings-btn"'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f'ERROR: markers not found. start={start_idx} end={end_idx}')
    sys.exit(1)

# The leading whitespace before the start marker
line_start = content.rfind('\n', 0, start_idx) + 1
prefix = content[line_start:start_idx]  # indentation

new_section = '''<!-- Voice Input Provider -->
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3>Voice Input</h3>
                        <span class="settings-section-badge">\U0001f3a4 Speech-to-Text</span>
                    </div>
                    <p class="settings-desc">Choose how your microphone input is transcribed to text</p>

                    <div class="voice-option-list">

                        <label class="voice-option" id="voice-option-browser">
                            <input type="radio" name="voice-provider" value="browser" checked>
                            <div class="voice-option-body">
                                <div class="voice-option-icon">\U0001f310</div>
                                <div class="voice-option-info">
                                    <div class="voice-option-name">Browser Default <span class="voice-option-tag free">Free</span></div>
                                    <div class="voice-option-desc">Uses the Web Speech API built into your browser. No API key needed. Real-time streaming.</div>
                                </div>
                                <div class="voice-option-check">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            </div>
                        </label>

                        <label class="voice-option" id="voice-option-openai">
                            <input type="radio" name="voice-provider" value="openai">
                            <div class="voice-option-body">
                                <div class="voice-option-icon">\U0001f916</div>
                                <div class="voice-option-info">
                                    <div class="voice-option-name">OpenAI Whisper <span class="voice-option-tag api">API Key</span></div>
                                    <div class="voice-option-desc">High-accuracy transcription via OpenAI\'s Whisper model. Records then transcribes.</div>
                                </div>
                                <div class="voice-option-check">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            </div>
                        </label>

                        <label class="voice-option" id="voice-option-gemini-stt">
                            <input type="radio" name="voice-provider" value="gemini-stt">
                            <div class="voice-option-body">
                                <div class="voice-option-icon">\u2726</div>
                                <div class="voice-option-info">
                                    <div class="voice-option-name">Gemini Audio <span class="voice-option-tag api">API Key</span></div>
                                    <div class="voice-option-desc">Google Gemini multimodal audio understanding. Uses your existing Gemini API key.</div>
                                </div>
                                <div class="voice-option-check">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            </div>
                        </label>

                    </div>

                    <!-- OpenAI key (shown when openai selected) -->
                    <div id="openai-key-group" class="voice-key-panel" style="display:none;">
                        <label for="openai-api-key" class="voice-key-label">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                            OpenAI API Key
                        </label>
                        <div class="key-input-wrapper">
                            <input type="password" id="openai-api-key" placeholder="sk-proj-...">
                            <button class="toggle-key-vis" data-target="openai-api-key" title="Show/hide key">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Gemini notice (shown when gemini-stt selected) -->
                    <div id="gemini-voice-notice" class="voice-key-panel" style="display:none;">
                        <div class="voice-notice-inline">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Uses your <strong>Gemini API key</strong> from the API Keys section above. No separate key needed.
                        </div>
                    </div>

                    <!-- Browser info (shown when browser selected) -->
                    <div id="voice-browser-notice" class="voice-key-panel" style="display:flex;">
                        <div class="voice-notice-inline">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            No API key needed. Works offline via your browser\'s built-in speech engine.
                        </div>
                    </div>
                </div>

                '''

new_content = content[:start_idx] + new_section + content[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('SUCCESS: Voice settings section replaced.')
