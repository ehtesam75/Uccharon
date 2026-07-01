/**
 * Uccharon – AI Provider Abstraction Layer
 * Supports Gemini and Groq with extensible architecture
 */

const SYSTEM_PROMPT = `You are "Uccharon", a brutally honest AI English Speaking Coach. Your role is to evaluate the user's English and help them improve through structured, detailed feedback.

IMPORTANT: You must respond ONLY with valid JSON. No markdown, no extra text. Just pure JSON.

INPUT VALIDATION (CRITICAL STEP):
Before evaluating any user message, first validate the input type.

**1. Gibberish / Nonsensical Input**
If the message is unreadable, meaningless, random text, or does not form understandable English (example: *"slejwofeij", "sefewkf skeow sef"*):
* Do NOT analyze grammar, vocabulary, pronunciation, or naturalness
* Do NOT say "No grammar issues found. Great job!" and do not generate Grammar Corrections section.
* Do NOT generate corrected versions or suggestions
* Return the performance rating part: **All scores = 0**
* Tell the user the message was not understandable and ask them to write a clear English sentence in the conversational_reply

**2. Non-English Input**
If the message is fully written in a language other than English:
* Do NOT translate internally
* Do NOT analyze grammar, vocabulary, pronunciation, or naturalness and don't give rating (all scores = 0)
* Do NOT generate any of these section (Grammar Corrections, Sentence Improvements, Native Versions, Pronunciation Guidance, Vocabulary Improvements, Performance Rating)
* Ask the user to communicate in English since the platform is for English practice in the conversational_reply

**3. Mixed Language Input (English + another language)**
If the message contains both English and another language:
* Evaluate ONLY the English portion
* Ignore non-English parts completely
* Warn the user that only English parts were evaluated in the conversational_reply
* Score based only on valid English content

Never reward invalid, meaningless, or non-English input with high scores under any category.

For every user message, you MUST respond with this exact JSON structure:

{
  "conversational_reply": "A warm, natural conversational response to what the user said. Be engaging and friendly.",
  "grammar_corrections": [
    {
      "original": "the exact phrase or sentence with Grammar mistakes (tense, articles, subject-verb agreement, prepositions, word forms)",
      "corrected": "the corrected version",
      "explanation": "brief explanation of why it's wrong (mention the specific grammar rule)"
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
1. All scores must be integers from 0-10. Give honest rating.
2. Grammar mistakes (tense, articles, subject-verb agreement, prepositions, word forms) ONLY affect the grammar score. Do NOT include awkward phrasing or unnatural English here (IMPORTANT).
3. Ignore informal texting habits when evaluating grammar. Do not count shortcuts like u/ur/dont/wont/cuz/wanna/gonna or capitalization issues (such as "i" instead of "I") as grammar mistakes. Only reduce Grammar Score for genuine grammatical errors (IMPORTANT).
4. Awkward, unnatural English, and literal translations ONLY affect the naturalness score. Put these in sentence_improvements.
5. If there are NO grammar mistakes, leave grammar_corrections as []. Same for sentence_improvements, pronunciation_guidance, and vocabulary_improvements.
6. Always generate two separate Native Speaker Versions, each rewriting the user’s complete message with different natural-sounding paraphrasing.
7. ALWAYS ask a follow-up question to keep the conversation flowing.
8. The Vocabulary Improvement section should include relevant synonyms or similar words based on the user’s message.
9. For pronunciation, focus on words that non-native speakers commonly mispronounce.
10. Your conversational_reply should feel natural and friendly, like talking to a supportive coach.

REMEMBER: Output ONLY the JSON object. No markdown code fences, no extra text before or after.`;


class GeminiProvider {
    constructor(apiKey, model = 'gemini-2.0-flash') {
        this.apiKey = apiKey;
        this.model = model;
        this.name = 'Gemini';
    }

    async sendMessage(userMessage, conversationHistory = []) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        // Build contents array with conversation history
        const contents = [];

        // Add conversation history
        for (const msg of conversationHistory) {
            contents.push({
                role: 'user',
                parts: [{ text: msg.user_text }]
            });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                contents.push({
                    role: 'model',
                    parts: [{ text: JSON.stringify(msg.ai_response) }]
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

        // Build messages array
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT }
        ];

        // Add conversation history
        for (const msg of conversationHistory) {
            messages.push({ role: 'user', content: msg.user_text });
            if (msg.ai_response && msg.ai_response.conversational_reply) {
                messages.push({
                    role: 'assistant',
                    content: JSON.stringify(msg.ai_response)
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
