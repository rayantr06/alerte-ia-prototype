"""Integration tests for the sanitized public API (no models or real recordings)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

_runtime = tempfile.TemporaryDirectory()
os.environ['DGPC_RUNTIME_DIR'] = _runtime.name
os.environ['DGPC_ENABLE_MODELS'] = '0'

from fastapi.testclient import TestClient
from backend.main import app
from backend import demo


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_does_not_import_models(self):
        health = self.client.get('/api/health').json()
        self.assertEqual(health['mode'], 'demo')
        self.assertTrue(health['synthetic_data'])
        self.assertFalse(health['asr']['loaded'])
        self.assertNotIn('torch', sys.modules)
        self.assertNotIn('transformers', sys.modules)

    def test_demo_scenario_is_marked_and_matches_fixture(self):
        scenario = self.client.get('/api/next-call').json()
        self.assertTrue(scenario['synthetic'])
        self.assertTrue(scenario['extraction']['simulated'])
        response = self.client.post('/api/extract', json={'text': scenario['transcription']}).json()
        self.assertEqual(response['extraction']['parsed']['commune'], scenario['commune'])

    def test_unseen_text_does_not_claim_ai_inference(self):
        result = self.client.post('/api/extract', json={'text': 'Texte fictif inconnu.'}).json()['extraction']
        self.assertFalse(result['json_valid'])
        self.assertIsNone(result['parsed'])
        self.assertEqual(result['mode'], 'demo')
        self.assertEqual(self.client.post('/api/extract', json={}).status_code, 400)

    def test_stats_and_keyword_assistant_use_only_synthetic_rows(self):
        total = self.client.get('/api/stats').json()
        self.assertTrue(total['synthetic_data'])
        self.assertEqual(total['total'], 3)
        self.assertEqual(sum(c['total'] for c in total['categories'].values()), 3)
        self.assertEqual(self.client.get('/api/stats?year=1900').json()['total'], 0)
        answer = self.client.post('/api/ask', json={'question': 'Combien de victimes au total ?'}).json()
        self.assertEqual(answer['data']['mode'], 'fallback')
        self.assertIn('fictifs', answer['answer'])
        self.assertEqual(self.client.post('/api/ask', json={}).status_code, 400)

    def test_unconfigured_audio_returns_unavailable_not_fake_transcript(self):
        for endpoint in ['/api/transcrire', '/transcribe']:
            result = self.client.post(endpoint, files={'file': ('fake.wav', b'fictional', 'audio/wav')})
            self.assertEqual(result.status_code, 503)
            self.assertNotIn('transcription', result.json())

    def test_z_save_updates_runtime_without_changing_fixture(self):
        fixture = Path('backend/demo_cases.json').read_bytes()
        sample = demo.cases()[0]
        before = self.client.get('/api/stats').json()['total']
        result = self.client.post('/api/save_call', json={
            'transcription': sample['transcription'], 'commune': sample['fields']['commune'],
            'extraction': demo.extraction(sample['transcription']), 'victims': 1,
            'address': 'Lieu fictif de test', 'nature': sample['nature']
        }).json()
        self.assertTrue(result['simulated'])
        self.assertTrue(result['added_to_rag'])
        self.assertEqual(self.client.get('/api/stats').json()['total'], before + 1)
        self.assertEqual(self.client.get('/api/history').json()[0]['status'], 'Enregistré (démo)')
        self.assertEqual(Path('backend/demo_cases.json').read_bytes(), fixture)


if __name__ == '__main__':
    unittest.main()
