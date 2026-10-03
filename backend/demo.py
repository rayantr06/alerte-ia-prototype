"""Synthetic fixtures and private runtime state for the public prototype."""
from copy import deepcopy
import json
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent
RUNTIME = Path(os.getenv('DGPC_RUNTIME_DIR', str(BASE / 'runtime')))
MODELS_ENABLED = os.getenv('DGPC_ENABLE_MODELS', '0') == '1'


def cases():
    return json.loads((BASE / 'demo_cases.json').read_text(encoding='utf-8'))


def bootstrap():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    rows = cases()
    records = RUNTIME / 'records.json'
    history = RUNTIME / 'history.json'
    if not records.exists():
        records.write_text(json.dumps([
            {**c['fields'], 'date': c['date'], 'synthetic': True} for c in rows
        ], ensure_ascii=False, indent=2), encoding='utf-8')
    if not history.exists():
        history.write_text(json.dumps([
            {'id': c['id'], 'timestamp': c['date'], 'nature': c['nature'],
             'commune': c['fields']['commune'], 'address': c['fields']['lieu'],
             'transcription': c['transcription'], 'status': 'Exemple fictif',
             'victims': c['fields']['victims_count'], 'phone': 'DEMO',
             'source': 'Scénario fictif', 'synthetic': True}
            for c in rows
        ], ensure_ascii=False, indent=2), encoding='utf-8')
    return records, history


def extraction(text):
    case = next((c for c in cases() if c['transcription'] == text.strip()), None)
    return {'json_valid': case is not None,
            'parsed': deepcopy(case['fields']) if case else None,
            'think': '', 'raw': '', 'model': 'fixture', 'model_id': 'synthetic-fixture',
            'mode': 'demo', 'simulated': True,
            'error': '' if case else 'Mode démo : seuls les scénarios fictifs fournis ont une fiche prédéfinie. Aucun modèle IA exécuté.'}
