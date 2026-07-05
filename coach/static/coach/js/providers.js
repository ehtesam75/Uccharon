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
- IMPORTANT RULE: If a message contains both gibberish and non-English text, classify it as gibberish in input_status.

2. Non-English Input
If the message is entirely in a language other than English:
- Do not generate Grammar Corrections, Sentence Improvements, Native Versions, Pronunciation Guidance, Vocabulary Improvements, or Performance Rating.
- Respond only in conversational_reply, asking the user to communicate in English because this platform is for English practice.

3. Mixed Language Input
If the message contains both English and another language:
- Evaluate only the English parts.
- Ignore the non-English parts.
- Mention in conversational_reply that only the English content was evaluated.
- Score only the English content.

For every user message, you MUST respond with this exact JSON structure:

{
  "input_status": "valid | gibberish | non_english | mixed_language",
  "conversational_reply": "A warm, natural conversational response to what the user said. Be engaging and friendly.",
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
    "confidence": 0
  },
  "follow_up_question": "Ask an engaging follow-up question to keep the conversation going. Make it relevant to what they said."
}

RULES:
0. CRITICALLY IMPORTANT: grammar_corrections must contain ONLY structural grammar errors. If a sentence is grammatically correct but merely awkward or unnatural, it must NEVER appear in grammar_corrections; include it ONLY in sentence_improvements.
1. All scores must be integers from 0-10. Give honest rating.
2. Grammar score MUST be based ONLY on grammatical correctness. Any issue that is not a structural grammar error (tense, articles, subject–verb agreement, prepositions, word forms) must NOT influence the grammar score under any circumstances.
3. Awkward, unnatural English, and literal translations ONLY affect the naturalness score. They must ONLY be included in sentence_improvements and must not affect any other score.
4. If there are NO grammar mistakes, leave grammar_corrections as []. Same for sentence_improvements, pronunciation_guidance, and vocabulary_improvements.
5. For pronunciation, focus on words that non-native speakers commonly mispronounce.

REMEMBER: Output ONLY the JSON object. No markdown code fences, no extra text before or after.`;


class GeminiProvider {
    constructor(apiKey, model = 'gemini-2.0-flash') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Gemini';
    }

    async sendMessage(userMessage, conversationHistory = []) {
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
                parts: [{ text: SYSTEM_PROMPT }]
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
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
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
    constructor(apiKey, model = 'llama-3.3-70b-versatile') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Groq';
    }

    async sendMessage(userMessage, conversationHistory = []) {
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        const MAX_HISTORY_TURNS = 8; // keep last 8 exchanges, tune as needed
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

        // Build messages array
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT }
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
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Groq API error: ${response.status}`);
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


class ProviderFactory {
    static create(providerName, apiKey, model) {
        switch (providerName) {
            case 'gemini':
                return new GeminiProvider(apiKey, model);
            case 'groq':
                return new GroqProvider(apiKey, model);
            default:
                throw new Error(`Unknown provider: ${providerName}`);
        }
    }
}

// Export for use in app.js
window.ProviderFactory = ProviderFactory;
window.SYSTEM_PROMPT = SYSTEM_PROMPT;
