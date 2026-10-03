"""Reject accidental private files, credentials and unreviewed call datasets."""
import json
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
# Use the index: installed packages and locally generated runtime records aren't release files.
names = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
problems = []
for name in names:
    p = root / name
    if not p.exists():
        continue
    if p.name.startswith('.env') or p.suffix.lower() in {
        '.wav','.mp3','.m4a','.flac','.ogg','.webm','.csv','.jsonl','.parquet',
        '.safetensors','.pt','.pth','.bin','.pem','.key','.zip','.log','.docx','.pdf'
    } or 'runtime' in p.relative_to(root).parts or p.name in {'data_history.json','donnee_reel.json'}:
        problems.append(f'Excluded release file: {name}')
    if p.suffix in {'.py','.ts','.tsx','.json','.md','.yml','.yaml'}:
        content = p.read_text(encoding='utf-8')
        if re.search(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|hf_[A-Za-z0-9]{25,}|AIza[A-Za-z0-9_-]{25,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)', content):
            problems.append(f'Possible credential in {name}')

fixtures = json.loads((root/'backend/demo_cases.json').read_text(encoding='utf-8'))
if len(fixtures) != 3 or not all(r.get('synthetic') is True and r['transcription'].startswith('Exemple fictif :') for r in fixtures):
    problems.append('Unexpected synthetic fixture set')
print('\n'.join(problems) if problems else f'Public release check passed: {len(names)} tracked files, three synthetic scenarios.')
sys.exit(bool(problems))
