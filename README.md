<div align="center">

<img src="coach/static/coach/icon/uccharon-circle-icon.png" alt="Uccharon logo" width="120" height="120" />

# Uccharon (উচ্চারণ)

### Your API Key. Your AI. Your Learning.

An open-source AI English speaking coach that runs on **your** AI provider, **your** models, and **your** budget — with no subscriptions and no middleman.

</div>

---

## Overview

Uccharon is an AI-powered English speaking coach that turns everyday conversation into structured, actionable feedback. Instead of a static lesson plan, you talk naturally and get instant evaluation on grammar, vocabulary, naturalness, expression, and mechanics — every single message.

What sets it apart is the model behind it: Uccharon has **no built-in AI billing and no locked-in provider**. You connect your own API key from a provider you already trust, pick the exact model you want, and pay that provider directly. Uccharon is just the coaching layer on top.

## Why Uccharon Is Different

Most AI English platforms wrap a hidden API key inside a monthly subscription. You pay them, they pay the AI provider, and you never see the real cost or control the model. Uccharon flips that:

- **Bring your own AI.** Use your own key from Gemini, Groq, OpenAI, or OpenRouter.
- **No forced subscriptions.** No paywalls between you and your practice.
- **Full cost control.** You choose the model and pay the provider directly at their rate.
- **You own the experience.** Swap providers or models anytime to match your budget and quality needs.

The result is transparent pricing, no vendor lock-in, and a learning tool that respects both your data and your wallet.

## Key Features

- **Conversational coaching** — practice English naturally with an AI that responds and evaluates in real time.
- **Five-dimension scoring** — every message is rated on grammar, vocabulary, naturalness, expression, and mechanics.
- **Detailed corrections** — grammar fixes, natural rewrites, vocabulary upgrades, and pronunciation guidance for each turn.
- **Bilingual explanations** — get feedback explanations in English or Bengali (বাংলা).
- **Progress tracking** — daily word goals, learning streaks, and visual analytics across daily, weekly, and monthly views.
- **Provider flexibility** — switch between AI providers and models directly from settings.
- **Installable PWA** — works like a native app with a light and dark theme.

## Privacy & Security

Uccharon is built so your credentials never leave your control:

- **Keys stay on your device.** Your API keys are stored only in your own browser/device — never transmitted to or saved on Uccharon's servers.
- **Direct-to-provider requests.** AI requests go straight from your browser to the AI provider you selected. Uccharon does not proxy or intercept them.
- **No key retention.** We do not collect, log, or persist your API keys anywhere on our infrastructure.
- **Open and transparent.** The entire codebase is open source, so anyone can verify exactly how data is handled.

## Supported AI Providers

| Provider | Get an API Key |
| --- | --- |
| Google Gemini | https://aistudio.google.com/ |
| Groq | https://console.groq.com/ |
| OpenAI | https://platform.openai.com/ |
| OpenRouter | https://openrouter.ai/ |

Add your key in the app's settings, choose a model, and start practicing — costs are billed by the provider, not by Uccharon.

## Tech Stack

- **Backend:** Django 5.2 (Python 3)
- **Frontend:** HTML5, CSS, Vanilla JavaScript (SPA)
- **Database:** SQLite (local) / PostgreSQL (production)
- **AI Layer:** Client-side provider abstraction (Gemini, Groq, OpenAI, OpenRouter)
- **Deployment:** Gunicorn + WhiteNoise, PaaS-ready (Railway, Heroku)
- **Media & Storage:** Cloudinary via `django-cloudinary-storage`
