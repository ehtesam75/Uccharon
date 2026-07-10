import re

with open('coach/static/coach/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove cohere_api_key: '', and cohere_model: '...',
content = re.sub(r"\s*cohere_api_key:\s*'.*?',", "", content)
content = re.sub(r"\s*cohere_model:\s*'.*?',", "", content)

# 2. Remove DOM selectors
content = re.sub(r"\s*cohereApiKey:\s*\$\('#cohere-api-key'\),", "", content)
content = re.sub(r"\s*cohereModelSelect:\s*\$\('#cohere-model-select'\),", "", content)

# 3. Remove from ai_provider === 'cohere' ? apiKey : ''
content = re.sub(r"\s*cohere_api_key:\s*ai_provider === 'cohere' \? apiKey : '',", "", content)

# 4. Remove from signupKeyGuide includes list
content = content.replace(", 'cohere']", "]")
content = content.replace("['gemini', 'groq', 'openrouter', 'cerebras', 'cohere']", "['gemini', 'groq', 'openrouter', 'cerebras']")

# 5. Remove else if block for cohere
cohere_guide_regex = r"\s*\} else if \(provider === 'cohere'\) \{.*?\}\s*(?=\} else \{)"
content = re.sub(cohere_guide_regex, "", content, flags=re.DOTALL)

# 6. Remove localStorage settings
content = re.sub(r"\s*state\.settings\.cohere_model = localStorage\.getItem\('uccharon_cohere_model'\) \|\| '.*?';", "", content)

# 7. Remove provider names
content = content.replace(", cohere: 'Cohere'", "")

# 8. Remove DOM values
content = re.sub(r"\s*DOM\.cohereApiKey\.value = state\.settings\.cohere_api_key \|\| '';", "", content)
content = re.sub(r"\s*DOM\.cohereModelSelect\.value = state\.settings\.cohere_model \|\| '.*?';", "", content)

# 9. Remove from setupSettingsHandlers arrays
# Already done by replacement 4, but let's just make sure:
content = content.replace(", 'cohere'", "")

# 10. Remove values from save logic
content = re.sub(r"\s*const cohereKey = DOM\.cohereApiKey\.value\.trim\(\);", "", content)
content = re.sub(r"\s*const cohereModel = DOM\.cohereModelSelect\.value;", "", content)
content = re.sub(r"\s*state\.settings\.cohere_api_key = cohereKey;", "", content)
content = re.sub(r"\s*state\.settings\.cohere_model = cohereModel;", "", content)
content = re.sub(r"\s*localStorage\.setItem\('uccharon_cohere_model', cohereModel\);", "", content)
content = re.sub(r"\s*cohere_api_key:\s*cohereKey,", "", content)

with open('coach/static/coach/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
