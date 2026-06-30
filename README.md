# Uccharon (উচ্চারণ) - AI Language Coach

Uccharon is an interactive AI-powered language learning application that acts as your personal conversation coach. Built with Django and vanilla JavaScript, it integrates directly with Large Language Models (Gemini and Groq) to provide dynamic conversations, evaluate your language skills, and help you improve over time.
<br>


## ✨ Features

- **Interactive AI Coaching:** Practice conversations naturally with an AI coach.
- **Provider Choice:** Switch between **Gemini** and **Groq** AI APIs by providing your own API keys in the app settings.
- **Performance Scoring:** Get real-time feedback on your messages covering:
  - Grammar
  - Vocabulary
  - Naturalness
  - Confidence
- **Progress Tracking:**
  - Set daily word goals and maintain learning streaks.
  - View detailed visual analytics for your historical performance (daily, weekly, monthly).
- **User Personalization:** Dark and Light themes tailored to your preference.
- **PWA Support:** Installable as a Progressive Web App (PWA) with native-like icons and experience.
<br>

## 🛠 Tech Stack

- **Backend:** Django 5.2 (Python 3)
- **Database:** SQLite3 (Local) / PostgreSQL (Production)
- **Frontend:** HTML5, CSS, Vanilla JS (`app.js`, `providers.js`)
- **Deployment:** Ready for platforms like Railway or Heroku (Gunicorn + Whitenoise)
- **Static & Media:** Configured for Django Cloudinary Storage
<br>

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- `pip` (Python package manager)

### Local Setup

1. **Clone the repository (if not already cloned):**
   ```bash
   git clone <your-repo-url>
   cd Uccharon
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python -m venv venv
   # On Windows
   venv\Scripts\activate
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Create a `.env` file in the root directory.
   ```env
   DEBUG=True
   SECRET_KEY=your_development_secret_key_here
   # DATABASE_URL=... (Optional: Only if you want to use Postgres locally)
   ```

5. **Apply Database Migrations:**
   ```bash
   python manage.py migrate
   ```

6. **Run the Development Server:**
   ```bash
   python manage.py runserver
   ```
   Open `http://127.0.0.1:8000` in your web browser.
<br>

## ⚙️ Configuration

To use the AI features, register an account in the app, click on your profile/settings, and add your API keys for:
- [Google Gemini API](https://aistudio.google.com/)
- [Groq API](https://console.groq.com/)
<br>

## 🚢 Deployment

The project is configured for easy deployment on PaaS platforms like Railway:
- Uses `dj-database-url` for database configuration via the `DATABASE_URL` environment variable.
- Uses `gunicorn` as the WSGI HTTP server (configured in `Procfile`).
- Static files are served efficiently via `whitenoise`.
<br>

## 📁 Project Structure

- `Uccharon/` - Core Django settings, URLs, and configurations.
- `coach/` - Main application directory containing models, views, and core business logic.
  - `static/coach/` - Frontend assets including CSS, JS, and PWA icons.
  - `templates/coach/` - HTML templates (SPA index).
- `requirements.txt` - Python dependencies for the project.
- `manage.py` - Django project management utility.
