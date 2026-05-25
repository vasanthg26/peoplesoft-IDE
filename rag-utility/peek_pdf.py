import pdfplumber
import sys
import re

path = r'C:\Users\vasan\Downloads\49765913-PeopleCode-Eventsv1-01.pdf'
start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
end   = int(sys.argv[2]) if len(sys.argv) > 2 else start + 9

def dedupe_chars(text):
    """Fix doubled-character encoding artifact from PowerPoint PDF exports."""
    if not text:
        return text
    # Remove every other character when they are identical pairs
    result = []
    i = 0
    while i < len(text):
        if i + 1 < len(text) and text[i] == text[i+1] and text[i] not in (' ', '\n'):
            result.append(text[i])
            i += 2
        else:
            result.append(text[i])
            i += 1
    return ''.join(result)

with pdfplumber.open(path) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    for i, page in enumerate(pdf.pages[start-1:end], start):
        raw = page.extract_text() or ''
        print(f"\n--- PAGE {i} ---")
        print(dedupe_chars(raw))
