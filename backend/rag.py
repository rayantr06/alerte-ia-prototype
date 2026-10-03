"""
Assistant analytique (RAG) sur les scénarios fictifs de démonstration — moteur LLM LOCAL.

Principe (robuste, calcul des agrégats par un outil déterministe) :
  1. Un LLM local (Qwen2.5-7B-Instruct, 4-bit) COMPREND la question, même mal écrite.
  2. Il FORMULE une requête structurée (JSON : filtres + mesure + classement + période).
  3. UN SEUL OUTIL DÉTERMINISTE (`interroger`) calcule le résultat exact sur les scénarios
     fictifs fournis, en filtrant/agrégeant sur N'IMPORTE QUEL champ de la fiche.
  4. Le résultat (phrase française exacte) est renvoyé. Le LLM ne manipule jamais les chiffres.

Champs interrogeables : incident_type, commune, daira, intent, urgency_human,
fire_present, trapped_persons, injury_severity, victims_count, et la date (période).

Si le LLM n'est pas disponible, un repli par mots-clés répond aux questions courantes.
"""
from __future__ import annotations

import json
import os
import re
import unicodedata
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

BACKEND_DIR = Path(__file__).resolve().parent
from backend.demo import bootstrap, MODELS_ENABLED
DATA_PATH = str(bootstrap()[0])

# Où tourne le planificateur LLM : "local" (Qwen 4-bit sur GPU) ou "api" (endpoint compatible OpenAI).
# Le reste du pipeline (prompt, extraction JSON, outils déterministes) est IDENTIQUE dans les deux cas.
RAG_BACKEND = os.getenv("DGPC_RAG_BACKEND", "local").lower() if MODELS_ENABLED else "keywords"
RAG_LLM_MODEL = os.getenv("DGPC_RAG_LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")
RAG_LLM_4BIT = os.getenv("DGPC_RAG_LLM_4BIT", "1") not in ("0", "false", "False")
# Mode "api" — compatible OpenAI (OpenRouter / Together / DeepInfra / vLLM... servant le MÊME modèle Qwen).
RAG_API_BASE = os.getenv("DGPC_RAG_API_BASE", "https://openrouter.ai/api/v1")
RAG_API_KEY = os.getenv("DGPC_RAG_API_KEY", "")
RAG_API_MODEL = os.getenv("DGPC_RAG_API_MODEL", "qwen/qwen-2.5-7b-instruct")
# Reformulation naturelle de la réponse par le LLM (2e passe), avec citation de la source exacte.
RAG_NATURAL = os.getenv("DGPC_RAG_NATURAL", "1") not in ("0", "false", "False")

# ------------------------------------------------------------------ libellés FR
INCIDENT_FR = {
    "medical_emergency": "urgence médicale",
    "accident_vehicular": "accident de la route",
    "accident_pedestrian": "accident de piéton",
    "fire_building": "incendie de bâtiment",
    "fire_vehicle": "incendie de véhicule",
    "fire_forest": "incendie de forêt",
    "structural_collapse": "effondrement",
    "natural_disaster": "catastrophe naturelle",
    "assault_violence": "agression",
    "theft_robbery": "vol",
    "lost_person": "personne disparue",
    "drowning": "noyade",
    "hazmat": "matières dangereuses",
    "other": "autre",
    "fire": "incendie (tous types)",  # méta : regroupe bâtiment + véhicule + forêt
}

# Types d'incident regroupés sous le méta "fire" (feu/incendie générique).
_FIRE_TYPES = {"fire_building", "fire_vehicle", "fire_forest"}
INTENT_FR = {
    "request_help": "demande de secours",
    "report_incident": "signalement",
    "update_info": "mise à jour",
    "false_alarm": "fausse alerte",
    "other": "autre",
}
URGENCY_FR = {"critical": "critique", "high": "élevée", "medium": "moyenne",
              "low": "faible", "unknown": "inconnue"}
SEVERITY_VAL_FR = {"severe": "grave", "fatal": "mortelle", "minor": "légère",
                   "none": "aucune", "unknown": "inconnue"}
YESNO_FR = {"yes": "oui", "no": "non", "unknown": "inconnu"}

# ------------------------------------------------------------- synonymes -> canon
_SYNONYMS: list[tuple[str, list[str]]] = [
    ("accident_pedestrian", ["pieton", "renversement"]),
    ("accident_vehicular", ["accident de voiture", "accident de la route", "accident routier",
                            "accident de vehicule", "accident de la circulation", "collision",
                            "carambolage", "route", "voiture", "circulation", "vehicule", "accident"]),
    ("fire_forest", ["foret", "maquis", "broussaille"]),
    ("fire_vehicle", ["feu de vehicule", "incendie de voiture", "feu de voiture"]),
    ("fire_building", ["batiment", "habitation", "maison", "immeuble"]),
    ("drowning", ["noyade", "noye"]),
    ("assault_violence", ["agression", "violence", "bagarre", "arme", "coups"]),
    ("theft_robbery", ["vol", "cambriolage", "braquage"]),
    ("lost_person", ["disparu", "disparition", "perdue", "egare"]),
    ("structural_collapse", ["effondrement", "eboulement", "ecroulement"]),
    ("natural_disaster", ["inondation", "catastrophe", "seisme", "glissement"]),
    ("hazmat", ["gaz", "matieres dangereuses", "chimique", "hazmat"]),
    ("medical_emergency", ["medical", "malaise", "secours medical", "blesse", "cardiaque",
                           "accouchement", "asphyxie"]),
    # "feu"/"incendie" générique (sans type précisé) -> méta "fire" = tous les types de feu.
    ("fire", ["incendie", "feu", "feux", "incendies"]),
]

# Maps {valeur_canon: [mots-clés FR/EN]} — l'ORDRE compte (le 1er qui matche gagne).
_INTENT_MAP = {
    "false_alarm": ["fausse alerte", "fausse", "faux", "canular", "false"],
    "update_info": ["mise a jour", "update", "complement", "suivi", "information supplementaire"],
    "request_help": ["secours", "aide", "sauvetage", "help", "appel a l aide", "demande de secours"],
    "report_incident": ["signalement", "signaler", "signale", "rapport", "declaration", "report"],
    "other": ["autre", "divers"],
}
_URGENCY_MAP = {
    "critical": ["critique", "critical", "vitale", "vital", "extreme"],
    "high": ["elevee", "eleve", "haute", "haut", "urgent", "urgente", "forte", "fort", "high", "important"],
    "medium": ["moyen", "moyenne", "modere", "moderee", "medium", "normale"],
    "low": ["faible", "basse", "bas", "low", "mineure"],
}
_FIRE_MAP = {
    "no": ["non", "sans feu", "pas de feu", "aucun feu", "absent"],
    "yes": ["oui", "avec feu", "feu", "incendie", "flamme", "present", "brule"],
}
_TRAP_MAP = {
    "no": ["non", "sans personne", "pas de personne", "libre", "aucune personne"],
    "yes": ["oui", "piege", "coince", "bloque", "enseveli", "prisonnier", "trapped",
            "emprisonne", "sous les decombres"],
}
_SEVERITY_MAP = {
    "fatal": ["mort", "deces", "decede", "tue", "fatal", "mortel", "perdu la vie"],
    "severe": ["grave", "severe", "serieux", "serieuse"],
    "minor": ["leger", "legere", "mineur", "benin", "benigne"],
    "none": ["aucune blessure", "aucun blesse", "sans blessure", "indemne", "pas de blessure", "aucune"],
}
_ENUM_MAPS = {
    "intent": _INTENT_MAP, "urgency_human": _URGENCY_MAP,
    "fire_present": _FIRE_MAP, "trapped_persons": _TRAP_MAP, "injury_severity": _SEVERITY_MAP,
}

_FILTER_FIELDS = ["incident_type", "commune", "daira", "intent", "urgency_human",
                  "fire_present", "trapped_persons", "injury_severity"]

_FIELD_FR = {"commune": "commune", "daira": "daïra", "incident_type": "type d'incident",
             "intent": "intention d'appel", "urgency_human": "niveau d'urgence",
             "injury_severity": "gravité des blessures", "fire_present": "présence de feu",
             "trapped_persons": "personnes piégées"}
_CLASSEUR_MAP = {
    "commune": ["commune", "ville", "localite", "village", "endroit"],
    "daira": ["daira"],
    "incident_type": ["type", "incident", "categorie", "nature"],
    "intent": ["intention", "intent", "motif", "raison"],
    "urgency_human": ["urgence", "priorite"],
    "injury_severity": ["gravite", "severite", "blessure"],
    "fire_present": ["feu"],
    "trapped_persons": ["piege", "coince"],
}

_PERIODES = {"aujourd_hui", "hier", "semaine", "mois", "annee"}
_PERIODE_FR = {"aujourd_hui": "aujourd'hui", "hier": "hier", "semaine": "cette semaine",
               "mois": "ce mois-ci", "annee": "cette année"}
_PERIODE_ALIAS = {"today": "aujourd_hui", "ce_jour": "aujourd_hui", "yesterday": "hier",
                  "week": "semaine", "cette_semaine": "semaine", "7_jours": "semaine",
                  "month": "mois", "ce_mois": "mois", "ce_mois_ci": "mois", "30_jours": "mois",
                  "year": "annee", "cette_annee": "annee"}

_records: Optional[list[dict[str, Any]]] = None
_llm_tok = None
_llm_model = None


# ====================================================================== utilitaires
def _norm(s: Any) -> str:
    s = str(s or "").replace("'", " ").replace("’", " ").replace("`", " ")
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


def _to_int(v: Any) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _parse_date(v: Any) -> Optional[datetime]:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v)[:19])
    except ValueError:
        return None


def load_records() -> list[dict[str, Any]]:
    global _records
    if _records is None:
        try:
            raw = json.loads(Path(DATA_PATH).read_text(encoding="utf-8"))
        except Exception as exc:  # pragma: no cover
            print(f"[RAG] Impossible de charger {DATA_PATH}: {exc}")
            raw = []
        _records = [{
            "incident_type": (r.get("incident_type") or "").strip().lower(),
            "commune": (r.get("commune") or "").strip(),
            "daira": (r.get("daira") or "").strip(),
            "intent": (r.get("intent") or "").strip().lower(),
            "urgency_human": (r.get("urgency_human") or "").strip().lower(),
            "fire_present": (r.get("fire_present") or "").strip().lower(),
            "trapped_persons": (r.get("trapped_persons") or "").strip().lower(),
            "injury_severity": (r.get("injury_severity") or "").strip().lower(),
            "victims_count": _to_int(r.get("victims_count")),
            "ts": _parse_date(r.get("date")),
        } for r in raw]
        print(f"[RAG] {len(_records)} interventions chargées depuis {DATA_PATH}")
    return _records


def add_record(call: dict) -> bool:
    """Ajoute une intervention (appel traité) au jeu de données RAG, datée à maintenant.
    Ainsi un nouvel appel envoyé est immédiatement compté par l'assistant (ex. « ... aujourd'hui »)."""
    parsed = ((call.get("extraction") or {}) or {}).get("parsed") or {}
    now = datetime.now()
    raw = {
        "incident_type": (parsed.get("incident_type") or "unknown").strip().lower() or "unknown",
        "injury_severity": (parsed.get("injury_severity") or "unknown").strip().lower(),
        "victims_count": call.get("victims") if call.get("victims") is not None else parsed.get("victims_count") or 0,
        "fire_present": str(parsed.get("fire_present") or "unknown").strip().lower(),
        "trapped_persons": str(parsed.get("trapped_persons") or "unknown").strip().lower(),
        "intent": (parsed.get("intent") or "unknown").strip().lower(),
        "urgency_human": (parsed.get("urgency_human") or "unknown").strip().lower(),
        "commune": (call.get("commune") or parsed.get("commune") or "Inconnu").strip() or "Inconnu",
        "daira": (parsed.get("daira") or "").strip(),
        "lieu": (call.get("address") or parsed.get("lieu") or "").strip(),
        "date": now.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    # Persistance dans runtime/records.json
    try:
        data = json.loads(Path(DATA_PATH).read_text(encoding="utf-8"))
    except Exception:
        data = []
    data.append(raw)
    try:
        Path(DATA_PATH).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:  # pragma: no cover
        print(f"[RAG] add_record : échec persistance ({exc})")
    # Mise à jour du cache en mémoire
    global _records
    if _records is not None:
        _records.append({
            "incident_type": raw["incident_type"],
            "commune": raw["commune"],
            "daira": raw["daira"],
            "intent": raw["intent"],
            "urgency_human": raw["urgency_human"],
            "fire_present": raw["fire_present"],
            "trapped_persons": raw["trapped_persons"],
            "injury_severity": raw["injury_severity"],
            "victims_count": _to_int(raw["victims_count"]),
            "ts": _parse_date(raw["date"]),
        })
    print(f"[RAG] Nouvelle intervention ajoutée ({raw['incident_type']} à {raw['commune']}). Total = {len(_records or [])}.")
    return True


def _distinct(field: str) -> list[str]:
    return sorted({r[field] for r in load_records()
                   if r.get(field) and str(r[field]).lower() not in ("inconnu", "unknown", "")})


def _data_now() -> datetime:
    ts = [r["ts"] for r in load_records() if r.get("ts")]
    return max(ts) if ts else datetime.now()


# ============================================================ canonicalisation champ
def _canon_incident(label: str) -> str:
    n = _norm(label)
    if not n:
        return ""
    if n in INCIDENT_FR:
        return n
    for canon, kws in _SYNONYMS:
        if any(k in n for k in kws):
            return canon
    return ""


def _canon_enum(value: str, mapping: dict[str, list[str]]) -> str:
    n = _norm(value)
    if not n:
        return ""
    if n in mapping:
        return n
    for canon, kws in mapping.items():
        if any(k in n for k in kws):
            return canon
    return ""


def _canon_place(field: str, label: str) -> str:
    target = _norm(label)
    if not target:
        return ""
    vals = _distinct(field)
    for v in vals:
        if _norm(v) == target:
            return v
    for v in vals:
        if _norm(v) in target or target in _norm(v):
            return v
    return ""


def _canon_field(field: str, value: str) -> str:
    if field == "incident_type":
        return _canon_incident(value)
    if field in ("commune", "daira"):
        return _canon_place(field, value)
    if field in _ENUM_MAPS:
        return _canon_enum(value, _ENUM_MAPS[field])
    return ""


def _canon_classeur(label: str) -> str:
    n = _norm(label)
    if not n:
        return ""
    if n in _FIELD_FR:
        return n
    return _canon_enum(n, _CLASSEUR_MAP)


def _canon_periode(periode: str) -> str:
    p = _norm(periode).replace(" ", "_")
    p = _PERIODE_ALIAS.get(p, p)
    return p if p in _PERIODES else ""


# ================================================================= libellés requête
def _filter_label(field: str, cv: str) -> str:
    if field == "incident_type":
        return f"de type « {INCIDENT_FR.get(cv, cv)} »"
    if field == "commune":
        return f"à {cv}"
    if field == "daira":
        return f"dans la daïra de {cv}"
    if field == "intent":
        return f"avec intention « {INTENT_FR.get(cv, cv)} »"
    if field == "urgency_human":
        return f"d'urgence {URGENCY_FR.get(cv, cv)}"
    if field == "fire_present":
        return "avec feu" if cv == "yes" else "sans feu"
    if field == "trapped_persons":
        return "avec personnes piégées" if cv == "yes" else "sans personnes piégées"
    if field == "injury_severity":
        return {"severe": "avec blessures graves", "fatal": "avec décès",
                "minor": "avec blessures légères", "none": "sans blessure"}.get(cv, cv)
    return cv


def _value_fr(field: str, value: str) -> str:
    if field == "incident_type":
        return INCIDENT_FR.get(value, value)
    if field == "intent":
        return INTENT_FR.get(value, value)
    if field == "urgency_human":
        return URGENCY_FR.get(value, value)
    if field == "injury_severity":
        return SEVERITY_VAL_FR.get(value, value)
    if field in ("fire_present", "trapped_persons"):
        return YESNO_FR.get(value, value)
    return value


# ============================================================== OUTIL DÉTERMINISTE
def _rec_match(r: dict, field: str, cv: str) -> bool:
    if field in ("commune", "daira"):
        return _norm(r.get(field, "")) == _norm(cv)
    if field == "incident_type" and cv == "fire":  # méta : tous les feux
        return r.get("incident_type", "") in _FIRE_TYPES
    return r.get(field, "") == cv


def _apply_filters(recs, filtres):
    out, canon, desc = recs, {}, []
    for field in _FILTER_FIELDS:
        cv = _canon_field(field, filtres.get(field, ""))
        if not cv:
            continue
        canon[field] = cv
        out = [r for r in out if _rec_match(r, field, cv)]
        desc.append(_filter_label(field, cv))
    return out, canon, desc


def _in_period(r, periode, ref):
    ts = r.get("ts")
    if not ts:
        return False
    if periode == "aujourd_hui":
        return ts.date() == ref.date()
    if periode == "hier":
        return ts.date() == (ref - timedelta(days=1)).date()
    if periode == "semaine":
        return ts >= ref - timedelta(days=7)
    if periode == "mois":
        return ts >= ref - timedelta(days=30)
    if periode == "annee":
        return ts >= ref - timedelta(days=365)
    return True


def _classement(subset, field, mesure, filt_desc, period_desc):
    if mesure == "victimes":
        agg = Counter()
        for r in subset:
            agg[r[field]] += r["victims_count"]
        unit = "victimes"
    else:
        agg = Counter(r[field] for r in subset)
        unit = "interventions"
    agg = {k: v for k, v in agg.items()
           if k and str(k).lower() not in ("inconnu", "unknown", "") and v}
    if not agg:
        return f"Aucune donnée à classer{filt_desc}{period_desc}."
    rank = ", ".join(f"{_value_fr(field, k)} ({v})" for k, v in Counter(agg).most_common(5))
    return f"Classement par {_FIELD_FR[field]}{filt_desc}{period_desc} ({unit}) : {rank}."


def interroger(filtres=None, mesure="nombre", classer_par="", periode="") -> str:
    """Outil unique : filtre/agrège les interventions sur n'importe quel champ."""
    subset, _, desc = _apply_filters(load_records(), filtres or {})

    periode = _canon_periode(periode)
    period_desc = ""
    if periode:
        ref = _data_now()
        subset = [r for r in subset if _in_period(r, periode, ref)]
        period_desc = " " + _PERIODE_FR[periode]

    filt_desc = (" " + ", ".join(desc)) if desc else ""
    field = _canon_classeur(classer_par)
    if field:
        return _classement(subset, field, mesure, filt_desc, period_desc)

    if (mesure or "").lower() == "victimes":
        total = sum(r["victims_count"] for r in subset)
        return f"Total de victimes{filt_desc}{period_desc} : {total} (sur {len(subset)} appels)."
    return f"Nombre d'interventions{filt_desc}{period_desc} : {len(subset)}."


def _apercu() -> str:
    recs = load_records()
    by_i = Counter(r["incident_type"] for r in recs
                   if r["incident_type"] and r["incident_type"] != "unknown")
    by_c = Counter(r["commune"] for r in recs
                   if r["commune"] and r["commune"].lower() != "inconnu")
    tops = ", ".join(f"{INCIDENT_FR.get(i, i)} ({n})" for i, n in by_i.most_common(5))
    coms = ", ".join(f"{c} ({n})" for c, n in by_c.most_common(5))
    v = sum(r["victims_count"] for r in recs)
    return (f"Sur {len(recs)} appels enregistrés : {v} victimes recensées au total. "
            f"Types d'incident les plus fréquents : {tops}. Communes les plus touchées : {coms}. "
            f"Période couverte jusqu'au {_data_now().date()}.")


def _details(r: dict) -> str:
    """Décrit une intervention (date, type, commune, victimes, gravité)."""
    quand = r["ts"].strftime("%d/%m/%Y à %H:%M") if r.get("ts") else "date inconnue"
    typ = INCIDENT_FR.get(r["incident_type"], r["incident_type"] or "type inconnu")
    lieu = r["commune"] if r["commune"] and r["commune"].lower() != "inconnu" else "commune inconnue"
    grav = SEVERITY_VAL_FR.get(r["injury_severity"], r["injury_severity"] or "inconnue")
    return f"{quand} — {typ} à {lieu} ({r['victims_count']} victime(s), gravité {grav})"


def derniers(filtres=None, n=1, periode="") -> str:
    """Renvoie la/les intervention(s) la/les plus récente(s) (notion de « dernier »)."""
    subset, _, desc = _apply_filters(load_records(), filtres or {})
    periode = _canon_periode(periode)
    if periode:
        ref = _data_now()
        subset = [r for r in subset if _in_period(r, periode, ref)]
    dated = sorted([r for r in subset if r.get("ts")], key=lambda r: r["ts"], reverse=True)
    filt = (" " + ", ".join(desc)) if desc else ""
    if not dated:
        return f"Aucune intervention{filt} trouvée."
    try:
        n = max(1, min(int(n), 10))
    except (TypeError, ValueError):
        n = 1
    if n == 1:
        return f"Dernière intervention{filt} : {_details(dated[0])}."
    lignes = " ; ".join(_details(r) for r in dated[:n])
    return f"Les {n} interventions les plus récentes{filt} : {lignes}."


# ===================================================================== LLM local
def get_rag_status() -> dict[str, Any]:
    recs = load_records()
    return {
        "loaded": len(recs) > 0,
        "n_records": len(recs),
        "data_path": DATA_PATH,
        "backend": RAG_BACKEND,
        "mode": RAG_BACKEND,
        "synthetic_data": True,
        "model": RAG_API_MODEL if RAG_BACKEND == "api" else RAG_LLM_MODEL,
        "quantized_4bit": False if RAG_BACKEND == "api" else RAG_LLM_4BIT,
        "llm_loaded": _llm_model is not None,
        "champs_interrogeables": _FILTER_FIELDS + ["victims_count", "date(période)"],
    }


def _load_llm():
    global _llm_tok, _llm_model
    if _llm_model is not None:
        return _llm_tok, _llm_model
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    print(f"[RAG] Chargement du LLM local {RAG_LLM_MODEL} (4bit={RAG_LLM_4BIT})...")
    _llm_tok = AutoTokenizer.from_pretrained(RAG_LLM_MODEL)
    kwargs: dict[str, Any] = {"device_map": "auto", "torch_dtype": torch.bfloat16}
    if RAG_LLM_4BIT:
        from transformers import BitsAndBytesConfig
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_quant_type="nf4",
        )
    _llm_model = AutoModelForCausalLM.from_pretrained(RAG_LLM_MODEL, **kwargs)
    _llm_model.eval()
    print("[RAG] LLM local chargé.")
    return _llm_tok, _llm_model


def _llm_chat(system: str, user: str, max_new_tokens: int = 160) -> str:
    """Aiguille vers le LLM local ou l'API. Le reste du pipeline est identique."""
    if not MODELS_ENABLED:
        raise RuntimeError("Model adapters disabled in the synthetic demo")
    if RAG_BACKEND == "api":
        return _llm_chat_api(system, user, max_new_tokens)
    return _llm_chat_local(system, user, max_new_tokens)


def _llm_chat_local(system: str, user: str, max_new_tokens: int = 160) -> str:
    import torch
    tok, model = _load_llm()
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tok(prompt, return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False,
                             pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()


def _llm_chat_api(system: str, user: str, max_new_tokens: int = 160) -> str:
    """Planificateur via endpoint compatible OpenAI (mêmes prompt/messages que le local)."""
    import time
    import urllib.error
    import urllib.request
    if not RAG_API_KEY:
        raise RuntimeError("DGPC_RAG_API_KEY manquante pour le mode api.")
    body = json.dumps({
        "model": RAG_API_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "max_tokens": max_new_tokens,
    }).encode("utf-8")
    url = RAG_API_BASE.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {RAG_API_KEY}", "Content-Type": "application/json"}
    for attempt in range(3):
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return (data["choices"][0]["message"]["content"] or "").strip()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 2:
                m = re.search(r"retry in ([\d.]+)s", exc.read().decode("utf-8", "ignore"))
                time.sleep(min(float(m.group(1)) if m else 5.0, 20.0))
                continue
            raise


_PLAN_SYSTEM = (
    "Tu es un planificateur de requêtes pour une base de scénarios fictifs de démonstration de la Protection "
    "Civile de Béjaïa. À partir de la question (même mal écrite ou familière), produis "
    "UNIQUEMENT un objet JSON, sans aucun texte autour :\n"
    '{"filtres":{}, "mesure":"nombre", "classer_par":"", "periode":"", "recent":0, "apercu":false}\n\n'
    "filtres — n'inclus QUE les champs pertinents (omets les autres) :\n"
    "- incident_type : accident, voiture, pieton, incendie (= TOUS les feux), feu de foret, "
    "feu de vehicule, feu de batiment, noyade, agression, vol, medical, disparu, gaz, effondrement, inondation.\n"
    "  IMPORTANT : si on dit juste « feu » ou « incendie » sans préciser, mets incident_type=\"incendie\".\n"
    "- commune ou daira : nom du lieu (Akbou, Béjaïa, El Kseur, Seddouk, Amizour...).\n"
    "- intent : secours, signalement, fausse alerte, mise a jour, autre.\n"
    "- urgency_human : critique, elevee, moyenne, faible.\n"
    "- fire_present : oui | non.   - trapped_persons : oui | non.\n"
    "- injury_severity : grave, mortel, leger, aucune.\n\n"
    "mesure : \"victimes\" si on demande un NOMBRE DE VICTIMES/BLESSÉS ; sinon \"nombre\".\n"
    "classer_par : pour un classement (« où y a-t-il le plus », « quelle commune »), mets le champ "
    "à classer : commune, daira, incident_type, intent, urgency_human, injury_severity. Sinon \"\".\n"
    "periode : aujourd_hui, hier, semaine, mois — dès que la question parle de temps "
    "(aujourd'hui, aujourdhui, ce jour, hier, cette semaine, ce mois...). Sinon \"\".\n"
    "recent : si on demande LA DERNIÈRE / la plus récente intervention (« le dernier accident », "
    "« la dernière intervention », « c'est quoi le dernier... »), mets recent=1 (ou N pour les N derniers). Sinon 0.\n"
    "apercu : true uniquement pour une vue d'ensemble globale.\n\n"
    "Exemples :\n"
    "Q: « combien daccident grave cette semaine » -> "
    '{"filtres":{"incident_type":"accident","injury_severity":"grave"},"mesure":"nombre","classer_par":"","periode":"semaine","recent":0,"apercu":false}\n'
    "Q: « est ce quil y a des feux aujourdhui » -> "
    '{"filtres":{"incident_type":"incendie"},"mesure":"nombre","classer_par":"","periode":"aujourd_hui","recent":0,"apercu":false}\n'
    "Q: « cest quoi la nature du dernier accident » -> "
    '{"filtres":{"incident_type":"accident"},"mesure":"nombre","classer_par":"","periode":"","recent":1,"apercu":false}\n'
    "Q: « ou ya le plus de noyade » -> "
    '{"filtres":{"incident_type":"noyade"},"mesure":"nombre","classer_par":"commune","periode":"","recent":0,"apercu":false}\n'
    "Q: « combien de victimes a akbou » -> "
    '{"filtres":{"commune":"akbou"},"mesure":"victimes","classer_par":"","periode":"","recent":0,"apercu":false}'
)


def _plan(question: str) -> Optional[dict]:
    """Le LLM local lit la question et formule la requête structurée (JSON)."""
    raw = _llm_chat(_PLAN_SYSTEM, question, max_new_tokens=180)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


_PHRASE_SYSTEM = (
    "Tu es l'assistant analytique de la Protection Civile de Béjaïa. On te donne une QUESTION "
    "et un FAIT chiffré EXACT calculé sur les scénarios fictifs. Réponds à la question en "
    "1 à 2 phrases naturelles et professionnelles en français. RÈGLES STRICTES : reprends les "
    "chiffres et noms de lieux EXACTEMENT comme dans le fait, n'invente aucune donnée absente "
    "du fait, reste concis. Ne mets pas de formule de politesse."
)


def _phrase(question: str, fact: str) -> str:
    """2e passe LLM : reformule le fait exact en réponse naturelle (sans changer les chiffres)."""
    out = _llm_chat(_PHRASE_SYSTEM, f"QUESTION : {question}\nFAIT : {fact}\nRéponse :", max_new_tokens=130)
    return (out or "").strip()


def _cite(fact: str) -> str:
    return f"📊 Source : {fact} (sur {len(load_records())} scénarios fictifs de démonstration)"


def answer_question(question: str) -> dict[str, Any]:
    if not load_records():
        return {"answer": "Aucune donnée d'intervention n'est chargée sur le serveur.", "data": {}}
    if not (question or "").strip():
        return {"answer": "Posez une question sur les interventions "
                          "(ex. « où y a-t-il le plus d'accidents ? »).", "data": {}}

    # 1) Le LLM local comprend et formule la requête
    plan = None
    try:
        plan = _plan(question) if MODELS_ENABLED else None
    except Exception as exc:  # LLM indisponible (modèle non chargé, VRAM, etc.)
        print(f"[RAG] LLM local indisponible ({exc}) — repli par mots-clés.")

    # 2) Exécution déterministe -> fait chiffré EXACT
    if isinstance(plan, dict):
        try:
            if plan.get("apercu"):
                fact = _apercu()
            elif plan.get("recent"):
                fact = derniers(plan.get("filtres") or {}, n=plan.get("recent") or 1,
                                periode=plan.get("periode") or "")
            else:
                fact = interroger(
                    filtres=plan.get("filtres") or {},
                    mesure=plan.get("mesure") or "nombre",
                    classer_par=plan.get("classer_par") or "",
                    periode=plan.get("periode") or "",
                )
            # 3) Le LLM reformule le fait en réponse naturelle ; la source garde le chiffre exact.
            answer = fact
            if RAG_NATURAL:
                try:
                    nat = _phrase(question, fact)
                    if nat:
                        answer = f"{nat}\n\n{_cite(fact)}"
                except Exception as exc:
                    print(f"[RAG] Reformulation indisponible ({exc}) — réponse factuelle brute.")
            return {"answer": answer, "source": fact,
                    "data": {"mode": "local_llm", "plan": plan}}
        except Exception as exc:  # pragma: no cover
            print(f"[RAG] Erreur d'exécution du plan {plan} : {exc}")

    # 4) Repli par mots-clés (LLM indisponible) — réponse factuelle + source
    fact = _fallback(question)
    return {"answer": f"{fact}\n\n{_cite(fact)}", "source": fact, "data": {"mode": "fallback"}}


def _fallback(question: str) -> str:
    q = _norm(question)
    if any(w in q for w in ["apercu", "vue d ensemble", "resume", "panorama", "statistique", "global"]):
        return _apercu()

    filtres: dict[str, str] = {}
    inc = _canon_incident(question)
    if inc:
        filtres["incident_type"] = inc
    if any(w in q for w in ["mort", "deces", "tue", "fatal"]):
        filtres["injury_severity"] = "fatal"
    elif any(w in q for w in ["grave", "severe"]):
        filtres["injury_severity"] = "severe"
    if any(w in q for w in ["piege", "coince", "bloque", "enseveli"]):
        filtres["trapped_persons"] = "yes"
    if "fausse alerte" in q or "canular" in q:
        filtres["intent"] = "false_alarm"
    elif "secours" in q or "demande d aide" in q:
        filtres["intent"] = "request_help"
    if "urgence elevee" in q or "tres urgent" in q or "urgences elevees" in q:
        filtres["urgency_human"] = "high"
    elif "critique" in q:
        filtres["urgency_human"] = "critical"
    for c in _distinct("commune"):
        if _norm(c) in q:
            filtres["commune"] = c
            break

    periode = ""
    if "aujourd" in q or "ce jour" in q:
        periode = "aujourd_hui"
    elif "hier" in q:
        periode = "hier"
    elif "semaine" in q:
        periode = "semaine"
    elif "mois" in q:
        periode = "mois"

    # « dernier / récent / dernière » -> la/les intervention(s) la/les plus récente(s)
    if any(w in q for w in ["dernier", "derniere", "dernieres", "derniers", "recent", "recente", "plus recent"]):
        mnum = re.search(r"(\d+)\s+dernier", q)
        return derniers(filtres, n=int(mnum.group(1)) if mnum else 1, periode=periode)

    classer = ""
    if "type" in q and any(w in q for w in ["plus", "frequent", "courant"]):
        classer = "incident_type"
    elif any(w in q for w in ["quelle commune", "quel endroit", "ou ", "le plus", "la plus",
                              "ville", "classement", "repartition"]):
        classer = "commune"

    mesure = "victimes" if ("victime" in q or "combien de blesse" in q) else "nombre"
    return interroger(filtres=filtres, mesure=mesure, classer_par=classer, periode=periode)


# ====================================================================================
# STATISTIQUES DASHBOARD — agrégats des exemples fictifs (4 catégories DGPC).
# ====================================================================================

INCIDENT_AR = {
    "medical_emergency": "إسعاف طبي", "accident_vehicular": "حادث مرور",
    "accident_pedestrian": "دهس راجل", "fire_building": "حريق مبنى",
    "fire_vehicle": "حريق مركبة", "fire_forest": "حريق غابة",
    "structural_collapse": "انهيار", "natural_disaster": "كارثة طبيعية",
    "assault_violence": "اعتداء", "theft_robbery": "سرقة", "lost_person": "شخص مفقود",
    "drowning": "غرق", "hazmat": "مواد خطرة", "other": "أخرى", "unknown": "غير معروف",
}

# Regroupement des types d'incident dans les 4 grandes natures du dashboard DGPC.
_CATEGORY_OF = {
    "accident_vehicular": "accidents", "accident_pedestrian": "accidents",
    "fire_building": "incendies", "fire_vehicle": "incendies", "fire_forest": "incendies",
    "medical_emergency": "secours", "drowning": "secours", "lost_person": "secours",
    "assault_violence": "secours",
    "structural_collapse": "divers", "natural_disaster": "divers", "hazmat": "divers",
    "theft_robbery": "divers", "other": "divers", "unknown": "divers",
}
_CATEGORY_META = {
    "accidents": ("Accidents de la circulation", "directions_car", "#D92721"),
    "incendies": ("Incendies et Explosions", "local_fire_department", "#FDB913"),
    "secours": ("Secours et Évacuation", "medical_services", "#D92721"),
    "divers": ("Opérations diverses", "category", "#FDB913"),
}
_CATEGORY_ORDER = ["accidents", "incendies", "secours", "divers"]


def _stats_filter(year: Optional[int], month: Optional[int], periode: str = ""):
    recs = load_records()
    p = _canon_periode(periode) if periode else ""
    ref = _data_now() if p else None
    out = []
    for r in recs:
        ts = r.get("ts")
        if year and (not ts or ts.year != year):
            continue
        if month and (not ts or ts.month != month):
            continue
        if p and not _in_period(r, p, ref):
            continue
        out.append(r)
    return out


def dashboard_stats(year: Optional[int] = None, month: Optional[int] = None,
                    periode: str = "") -> dict[str, Any]:
    """Agrégats des exemples fictifs pour le tableau de bord / rapport, filtrables par année, mois,
    ou période relative (aujourd_hui | semaine | mois | annee)."""
    subset = _stats_filter(year, month, periode)
    total = len(subset)
    victims = sum(r["victims_count"] for r in subset)
    days = {r["ts"].date() for r in subset if r.get("ts")}
    avg_per_day = round(total / len(days), 1) if days else 0

    categories = {}
    for cat in _CATEGORY_ORDER:
        title, icon, color = _CATEGORY_META[cat]
        cat_recs = [r for r in subset if _CATEGORY_OF.get(r["incident_type"], "divers") == cat]
        by_type = Counter(r["incident_type"] for r in cat_recs)
        cat_total = len(cat_recs)
        items = []
        for itype, n in by_type.most_common():
            items.append({
                "labelFr": "Non précisé" if itype in ("", "unknown") else INCIDENT_FR.get(itype, itype),
                "labelAr": INCIDENT_AR.get(itype, ""),
                "count": n,
                "value": round(100 * n / cat_total) if cat_total else 0,
            })
        categories[cat] = {"title": title, "icon": icon, "color": color,
                           "total": cat_total, "items": items}

    return {
        "total": total,
        "victims": victims,
        "avg_per_day": avg_per_day,
        "categories": categories,
        "category_order": _CATEGORY_ORDER,
        "period": {"year": year, "month": month, "periode": _canon_periode(periode) if periode else "",
                   "n_with_date": len(days)},
        "coverage": _stats_coverage(),
        "synthetic_dates": True,
    }


def _stats_coverage() -> dict[str, Any]:
    ts = [r["ts"] for r in load_records() if r.get("ts")]
    if not ts:
        return {"years": [], "months": []}
    years = sorted({t.year for t in ts})
    months = sorted({t.month for t in ts})
    return {"years": years, "months": months,
            "from": min(ts).date().isoformat(), "to": max(ts).date().isoformat()}
