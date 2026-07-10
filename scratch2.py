import re

with open('coach/static/coach/js/providers.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove CohereProvider class
content = re.sub(r'\n\nclass CohereProvider \{.*?\n\}\n', '', content, flags=re.DOTALL)

# 2. Remove case 'cohere': ...
content = re.sub(r"\s*case 'cohere':\s*return new CohereProvider\(apiKey, model\);", '', content)

with open('coach/static/coach/js/providers.js', 'w', encoding='utf-8') as f:
    f.write(content)
