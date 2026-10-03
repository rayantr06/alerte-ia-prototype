"""Public adaptation of the collaborative FastAPI prototype.

Synthetic demonstration by default. Model adapters are opt-in; no call datasets,
audio recordings or checkpoint files are bundled with the application.
"""
from contextlib import asynccontextmanager
from datetime import datetime
import itertools
import json
from pathlib import Path
import tempfile
from threading import Lock

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from backend import demo
from backend.rag import add_record, answer_question, dashboard_stats, get_rag_status

_, HISTORY_PATH = demo.bootstrap()
_history_lock = Lock()
_scenario_ids = itertools.cycle(range(len(demo.cases())))
_asr = None


@asynccontextmanager
async def lifespan(app):
    global _asr
    if demo.MODELS_ENABLED:
        try:
            from backend.asr_module import initialize_asr_model
            _asr = await run_in_threadpool(initialize_asr_model)
        except Exception:
            _asr = None
    yield


app = FastAPI(title='Alerte IA — public research prototype', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
    allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'],
)


def extractor_status():
    if demo.MODELS_ENABLED:
        from backend.extractor import get_extractor_status
        return get_extractor_status()
    return {'mode': 'demo', 'loaded_models': [], 'model_id': 'synthetic-fixture'}


def extract(text, model=None):
    if demo.MODELS_ENABLED:
        from backend.extractor import extract_call_fields
        return extract_call_fields(text, model=model)
    return demo.extraction(text)


@app.get('/')
@app.get('/api/health')
def health():
    return {'status': 'prototype', 'mode': 'models' if demo.MODELS_ENABLED else 'demo',
            'synthetic_data': True, 'asr': {'loaded': _asr is not None},
            'extractor': extractor_status(), 'rag': get_rag_status()}


@app.get('/api/next-call')
def next_call():
    c = demo.cases()[next(_scenario_ids)]
    return {'id': c['id'], 'transcription': c['transcription'], 'nature': c['nature'],
            **c['fields'], 'timestamp': c['date'], 'synthetic': True,
            'extraction': demo.extraction(c['transcription'])}


@app.get('/api/history')
def history():
    with _history_lock:
        return json.loads(HISTORY_PATH.read_text(encoding='utf-8'))


@app.post('/api/save_call')
def save_call(call_data: dict = Body(...)):
    with _history_lock:
        rows = json.loads(HISTORY_PATH.read_text(encoding='utf-8'))
        rows.insert(0, {**call_data, 'id': str(len(rows) + 1),
                       'timestamp': datetime.now().isoformat(timespec='seconds'),
                       'status': 'Enregistré (démo)', 'synthetic': True})
        HISTORY_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        added = add_record(call_data)
    return {'status': 'success', 'added_to_rag': added, 'simulated': True}


@app.post('/api/extract')
def extract_fields(payload: dict = Body(...)):
    text = str(payload.get('transcription') or payload.get('text') or '').strip()
    if not text:
        raise HTTPException(400, 'Missing transcription')
    return {'status': 'success', 'extraction': extract(text, payload.get('model')),
            'extractor': extractor_status()}


@app.post('/api/ask')
def ask(payload: dict = Body(...)):
    question = str(payload.get('question') or payload.get('query') or '').strip()
    if not question:
        raise HTTPException(400, 'Missing question')
    return {'status': 'success', 'synthetic_data': True, **answer_question(question)}


_MONTHS = {'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
           'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9,
           'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12}


@app.get('/api/stats')
def stats(year: str = '', month: str = '', periode: str = ''):
    y = int(year) if year.isdigit() else None
    m = int(month) if month.isdigit() else _MONTHS.get(month.lower())
    return {'status': 'success', 'synthetic_data': True,
            **dashboard_stats(year=y, month=m, periode=periode)}


@app.post('/api/transcrire')
async def transcribe(file: UploadFile = File(...), model: str = Form('')):
    if not demo.MODELS_ENABLED or _asr is None:
        raise HTTPException(503, 'ASR not configured. Use a supplied fictional scenario or configure the optional model adapters.')
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, 'Audio upload exceeds 20 MiB')
    if len(content) < 512:
        raise HTTPException(400, 'Audio upload is empty or too small')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            tmp.write(content)
            temporary = tmp.name
        from backend.asr_module import transcrire_audio_local
        text = await run_in_threadpool(transcrire_audio_local, temporary)
        extracted = await run_in_threadpool(extract, text, model or None)
        return {'text': text, 'transcription': text, 'extraction': extracted,
                'extractor': extractor_status()}
    except Exception as exc:
        raise HTTPException(503, 'Optional model inference failed; check your local model configuration.') from exc
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)


@app.post('/transcribe')
async def legacy(file: UploadFile = File(...)):
    return await transcribe(file, '')
