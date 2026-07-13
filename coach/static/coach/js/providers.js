/**
 * Uccharon – AI Provider Abstraction Layer
 * Supports Gemini and Groq with extensible architecture
 */

const SYSTEM_PROMPT = `You are "Uccharon", a brutally honest AI English Speaking Coach. Your role is to evaluate the user's English and help them improve through structured, detailed feedback.

IMPORTANT: You must respond ONLY with valid JSON. No markdown, no extra text. Just pure JSON.

INPUT VALIDATION (CRITICAL STEP):
Before evaluating any user message, first validate the input type.

Input Validation

1. Gibberish / Unreadable Input
If the message is meaningless or not understandable English:
- Do not generate Grammar Corrections, Sentence Improvements, Native Versions, Pronunciation Guidance, Vocabulary Improvements, or Performance Rating.
- Respond only in conversational_reply, explaining that the message was not understandable and asking the user to write a clear English sentence.
- Do not classify messages with understandable English mistakes as gibberish (grammar errors, poor sentence structure, or simple vocabulary are still evaluatable).
- IMPORTANT RULE: If a message contains both gibberish and non-English text, classify it as gibberish in input_status.

2. Non-English Input
If the message is entirely in a language other than English:
- Do not generate Grammar Corrections, Sentence Improvements, Native Versions, Pronunciation Guidance, Vocabulary Improvements, or Performance Rating.
- Respond only in conversational_reply, asking the user to communicate in English because this platform is for English practice.

3. Mixed Language Input
If the message contains both English and another language/Gibberish:
- Evaluate only the English parts.
- Ignore the non-English parts.
- Mention in conversational_reply that only the English content was evaluated.
- Score only the English content.

For every user message, you MUST respond with this exact JSON structure:

{
  "input_status": "valid | gibberish | non_english | mixed_language",
  "conversational_reply": "A warm, natural conversational response to what the user said. Be engaging and friendly. Do not ask follow-up questions, as follow-up questions are generated separately in the dedicated Follow-up Questions section."
  "grammar_corrections": [
    {
      "original": "ONLY a phrase or sentence containing a structural grammar error (tense, articles, subject-verb agreement, prepositions, or word forms)",
      "corrected": "Correct only the grammar error. Do NOT rewrite for naturalness or style.",
      "explanation": "State the specific grammar rule violated."
    }
  ],
  "sentence_improvements": [
    {
      "original": "the awkward or unnatural phrasing",
      "improved": "a more natural, fluent version",
      "explanation": "brief explanation of why it sounds better"
    }
  ],
  "mechanics_corrections": [
    {
      "original": "ONLY a phrase/sentence containing a spelling, capitalization, or punctuation error",
      "corrected": "Fix ONLY the spelling, capitalization, and punctuation. Do NOT change grammar, word choice, or phrasing.",
      "tip": "A short, friendly explanation of the mechanics rule (spelling, capitalization, or punctuation) that was fixed."
    }
  ],

  "native_versions": [
    "Natural everyday conversational English rewrite of the user's ENTIRE message.",
    "A different natural phrasing using alternative wording and sentence structure. Do not make minor word changes only — both versions should feel genuinely different."
  ],
  "pronunciation_guidance": [
    {
      "word": "the word",
      "phonetic": "IPA or simplified pronunciation",
      "spelling": "simple English-letter pronunciation spelling",
      "tip": "specific tip for pronouncing this word correctly"
    }
  ],
  "vocabulary_improvements": [
    {
      "original": "the simple/basic word used",
      "suggestion": "the improved word",
      "synonyms": ["synonym1", "synonym2"],
      "context": "brief explanation of when/why to use the suggestion"
    }
  ],
  "performance_rating": {
    "grammar": 0,
    "vocabulary": 0,
    "naturalness": 0,
    "expression": 0,
    "mechanics": 0
  },
  "follow_up_question": "Ask an engaging follow-up question to keep the conversation going. Make it relevant to what they said."
}

PERFORMANCE METRIC DEFINITIONS (score each from 0-10 based strictly on its own definition):

Grammar: Evaluate only structural correctness: tense, articles, prepositions, subject–verb agreement, word forms, pronouns, conjunctions, modifiers, parallelism, and quantifiers. Do not evaluate word choice or naturalness.

Vocabulary: Evaluate word choice: accuracy, appropriateness, sophistication, and range. Do not evaluate collocations or phrasing.

Naturalness: Evaluate how naturally the message sounds in everyday English, including collocations, idioms, sentence patterns, and avoiding awkward/literal translations.

Expression: Evaluate how effectively the user communicates ideas. Focus on completeness, clarity of ideas, level of detail, and ability to express thoughts. Do not penalize simple but clear communication.

Mechanics: Evaluate spelling, capitalization, punctuation, and readability. Ignore casual chat style unless it affects understanding.

RULES:
0. CRITICALLY IMPORTANT: grammar_corrections must contain ONLY structural grammar errors. If a sentence is grammatically correct but merely awkward or unnatural, it must NEVER appear in grammar_corrections; include it ONLY in sentence_improvements.
1. All scores must be integers from 0-10. Give honest rating.
2. Grammar score MUST be based ONLY on grammatical correctness. Any issue that is not a structural grammar error (tense, articles, subject–verb agreement, prepositions, word forms) must NOT influence the grammar score under any circumstances.
3. Awkward, unnatural English, and literal translations ONLY affect the naturalness score. They must ONLY be included in sentence_improvements and must not affect any other score.
4. If there are NO grammar mistakes, leave grammar_corrections as []. Same for sentence_improvements, pronunciation_guidance, vocabulary_improvements, and mechanics_corrections.
5. For pronunciation and vocabulary improvements, you MUST identify and recommend improvements for ALL relevant words and phrases in the user's entire message.
6. Score each of the five performance metrics (grammar, vocabulary, naturalness, expression, mechanics) independently and strictly according to its own definition above. Do not let one metric influence another.
7. mechanics_corrections must contain ONLY spelling, capitalization, and punctuation fixes, derived from the Mechanics metric. Keep it SEPARATE from grammar_corrections — never put grammar errors here and never put mechanics errors in grammar_corrections. Ignore casual chat style (e.g., lowercase "i", missing end punctuation) UNLESS it significantly reduces readability or understanding. If there are no mechanics issues, leave mechanics_corrections as [].

REMEMBER: Output ONLY the JSON object. No markdown code fences, no extra text before or after.`;


// Extra instruction appended when the user chooses a non-English explanation language.
// Only the explanatory/tip text is generated in Bengali — everything else stays in English.
const BENGALI_EXPLANATION_INSTRUCTION = `EXPLANATION LANGUAGE (CRITICAL OVERRIDE):
Write the explanatory/tip text in Bengali (বাংলা). This applies ONLY to these fields:
- grammar_corrections[].explanation → Bengali
- sentence_improvements[].explanation → Bengali
- mechanics_corrections[].tip → Bengali
- vocabulary_improvements[].context → Bengali
- pronunciation_guidance[].tip → Bengali

EVERYTHING ELSE MUST REMAIN IN ENGLISH. Do NOT translate:

Example (Bengali explanation):
original: "I am go to school." → corrected: "I go to school."
explanation: "এখানে \"am\" ব্যবহার করা যাবে না, কারণ \"go\" মূল verb হিসেবে ব্যবহৃত হয়েছে।"`;


// Build the system prompt, optionally injecting the explanation-language override.
function buildSystemPrompt(explanationLanguage = 'en') {
    if (explanationLanguage === 'bn') {
        return `${SYSTEM_PROMPT}\n\n${BENGALI_EXPLANATION_INSTRUCTION}`;
    }
    return SYSTEM_PROMPT;
}


function formatApiError(status, message, providerName) {

    if (status === 401 || status === 403) {
        return `${providerName} API Key is invalid or unauthorized. Please check your Settings.`;
    }
    if (status === 429) {
        return `${providerName} Rate Limit Exceeded. Please wait a moment and try again.`;
    }
    if (status === 404) {
        return `${providerName} could not find the requested model. The model ID might be incorrect or deprecated.`;
    }
    if (status === 502 && message && message.toLowerCase().includes('provider returned error')) {
        return `OpenRouter Routing Error: The specific AI provider for this model is temporarily down or rate-limited. Please try selecting a different model.`;
    }
    if (status >= 500) {
        return `${providerName} Server Error (${status}). The service might be temporarily down.`;
    }
    return `${providerName} Error: ${message || `HTTP ${status}`}`;
}

class GeminiProvider {
    constructor(apiKey, model = 'gemini-2.0-flash', explanationLanguage = 'en') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Gemini';
        this.explanationLanguage = explanationLanguage;
    }

    async sendMessage(userMessage, conversationHistory = [], options = {}) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        const MAX_HISTORY_TURNS = 8; // match Groq's setting
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        // Build contents array with conversation history
        const contents = [];

        // Add conversation history
        for (const msg of recentHistory) {
            contents.push({
                role: 'user',
                parts: [{ text: msg.user_text }]
            });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                contents.push({
                    role: 'model',
                    parts: [{ text: msg.ai_response.conversational_reply }]
                });
            }
        }

        // Add current message
        contents.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        const body = {
            system_instruction: {
                parts: [{ text: buildSystemPrompt(this.explanationLanguage) }]
            },
            contents: contents,
            generationConfig: {
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 4096,
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(formatApiError(response.status, err.error?.message, 'Gemini'));
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response from Gemini API');
        }

        const text = data.candidates[0].content.parts[0].text;
        return this._parseResponse(text);
    }

    _parseResponse(text) {
        // Try to parse JSON directly
        try {
            return JSON.parse(text);
        } catch (e) {
            // Try to extract JSON from markdown code fences
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) {
                return JSON.parse(match[1].trim());
            }
            // Try to find JSON object in the text
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Could not parse AI response as JSON');
        }
    }
}


class GroqProvider {
    constructor(apiKey, model = 'llama-3.3-70b-versatile', explanationLanguage = 'en') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Groq';
        this.explanationLanguage = explanationLanguage;
    }

    async sendMessage(userMessage, conversationHistory = [], options = {}) {
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        const MAX_HISTORY_TURNS = 8; // keep last 8 exchanges, tune as needed
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        // Build messages array
        const messages = [
            { role: 'system', content: buildSystemPrompt(this.explanationLanguage) }
        ];

        // Add history
        for (const msg of recentHistory) {
            messages.push({ role: 'user', content: msg.user_text });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                messages.push({
                    role: 'assistant',
                    content: msg.ai_response.conversational_reply
                });
            }
        }

        // Add current message
        messages.push({ role: 'user', content: userMessage });

        const body = {
            model: this.model,
            messages: messages,
            temperature: 0.8,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(formatApiError(response.status, err.error?.message, 'Groq'));
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0]?.message?.content) {
            throw new Error('Invalid response from Groq API');
        }

        const text = data.choices[0].message.content;
        return this._parseResponse(text);
    }

    _parseResponse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) {
                return JSON.parse(match[1].trim());
            }
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            throw new Error('Could not parse AI response as JSON');
        }
    }
}


class OpenRouterProvider {
    constructor(apiKey, model = 'openai/gpt-3.5-turbo', explanationLanguage = 'en') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'OpenRouter';
        this.explanationLanguage = explanationLanguage;
    }

    async sendMessage(userMessage, conversationHistory = [], options = {}) {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const MAX_HISTORY_TURNS = 8;
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        const messages = [{ role: 'system', content: buildSystemPrompt(this.explanationLanguage) }];
        for (const msg of recentHistory) {
            messages.push({ role: 'user', content: msg.user_text });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                messages.push({ role: 'assistant', content: msg.ai_response.conversational_reply });
            }
        }
        messages.push({ role: 'user', content: userMessage });

        const body = {
            model: this.model,
            messages: messages,
            temperature: 0.8,
            response_format: { type: 'json_object' }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': window.location.href, // Recommended for OpenRouter
                'X-Title': 'Uccharon Coach' // Recommended for OpenRouter
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(formatApiError(response.status, err.error?.message, 'OpenRouter'));
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]?.message?.content) {
            throw new Error('Invalid response from OpenRouter API');
        }

        return this._parseResponse(data.choices[0].message.content);
    }

    _parseResponse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) return JSON.parse(match[1].trim());
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            throw new Error('Could not parse AI response as JSON');
        }
    }
}





class OpenAIProvider {
    constructor(apiKey, model = 'gpt-4o', explanationLanguage = 'en') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'OpenAI';
        this.explanationLanguage = explanationLanguage;
    }

    async sendMessage(userMessage, conversationHistory = [], options = {}) {
        const url = 'https://api.openai.com/v1/chat/completions';
        const MAX_HISTORY_TURNS = 8;
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        const messages = [{ role: 'system', content: buildSystemPrompt(this.explanationLanguage) }];
        for (const msg of recentHistory) {
            messages.push({ role: 'user', content: msg.user_text });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                messages.push({ role: 'assistant', content: msg.ai_response.conversational_reply });
            }
        }
        messages.push({ role: 'user', content: userMessage });

        const body = {
            model: this.model,
            messages: messages,
            temperature: 0.8,
            response_format: { type: 'json_object' }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(formatApiError(response.status, err.error?.message, 'OpenAI'));
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0]?.message?.content) {
            throw new Error('Invalid response from OpenAI API');
        }

        return this._parseResponse(data.choices[0].message.content);
    }

    _parseResponse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) return JSON.parse(match[1].trim());
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            throw new Error('Could not parse AI response as JSON');
        }
    }
}


class CohereProvider {
    constructor(apiKey, model = 'command-r-08-2024', explanationLanguage = 'en') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Cohere';
        this.explanationLanguage = explanationLanguage;
    }

    async sendMessage(userMessage, conversationHistory = [], options = {}) {
        const url = 'https://api.cohere.com/v1/chat';
        const MAX_HISTORY_TURNS = 8;
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        const chatHistory = [];
        for (const msg of recentHistory) {
            chatHistory.push({ role: 'USER', message: msg.user_text });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                chatHistory.push({ role: 'CHATBOT', message: msg.ai_response.conversational_reply });
            }
        }

        const body = {
            model: this.model,
            message: userMessage,
            chat_history: chatHistory,
            preamble: buildSystemPrompt(this.explanationLanguage),
            temperature: 0.8,
            response_format: { type: 'json_object' }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const errMsg = err.message || err.text;
            throw new Error(formatApiError(response.status, errMsg, 'Cohere'));
        }

        const data = await response.json();
        if (!data.text) {
            throw new Error('Invalid response from Cohere API');
        }

        return this._parseResponse(data.text);
    }

    _parseResponse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (match) return JSON.parse(match[1].trim());
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            throw new Error('Could not parse AI response as JSON');
        }
    }
}


class ProviderFactory {
    static create(providerName, apiKey, model, explanationLanguage = 'en') {
        switch (providerName) {
            case 'gemini':
                return new GeminiProvider(apiKey, model, explanationLanguage);
            case 'groq':
                return new GroqProvider(apiKey, model, explanationLanguage);
            case 'openrouter':
                return new OpenRouterProvider(apiKey, model, explanationLanguage);
            case 'openai':
                return new OpenAIProvider(apiKey, model, explanationLanguage);

            case 'cohere':

                return new CohereProvider(apiKey, model, explanationLanguage);
            default:
                throw new Error(`Unknown provider: ${providerName}`);
        }
    }

    /**
     * Validate an API key by making a lightweight request to the provider.
     * Returns { valid: boolean, error?: string }.
     */
    static async validateApiKey(providerName, apiKey) {
        const key = (apiKey || '').trim();
        if (!key) {
            return { valid: false, error: 'API key is empty.' };
        }

        try {
            let response;
            switch (providerName) {
                case 'gemini':
                    response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
                    );
                    break;
                case 'groq':
                    response = await fetch('https://api.groq.com/openai/v1/models', {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    break;
                case 'openrouter':
                    response = await fetch('https://openrouter.ai/api/v1/key', {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    break;
                case 'cohere':
                    response = await fetch('https://api.cohere.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    break;
                case 'openai':
                    response = await fetch('https://api.openai.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    break;
                default:
                    return { valid: false, error: `Unknown provider: ${providerName}` };
            }

            if (response.ok) {
                return { valid: true };
            }

            // A rate-limit response still means the key itself is authorized.
            if (response.status === 429) {
                return { valid: true };
            }

            if (response.status === 401 || response.status === 403) {
                return { valid: false, error: 'Invalid API key' };
            }

            const err = await response.json().catch(() => ({}));
            const providerLabel = providerName.charAt(0).toUpperCase() + providerName.slice(1);
            return {
                valid: false,
                error: formatApiError(response.status, err.error?.message || err.message, providerLabel)
            };
        } catch (e) {
            return { valid: false, error: 'Network error. Please check your connection and try again.' };
        }
    }
}


// Export for use in app.js
window.ProviderFactory = ProviderFactory;
window.SYSTEM_PROMPT = SYSTEM_PROMPT;
window.buildSystemPrompt = buildSystemPrompt;
