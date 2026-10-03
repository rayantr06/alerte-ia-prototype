"use client";

import React, { useState, useEffect, useRef } from "react";
import { COMMUNE_COORDS, DEFAULT_CENTER } from "./geo_communes";

// Charge Leaflet (carte OpenStreetMap navigable) depuis le CDN, une seule fois.
function ensureLeaflet(): Promise<unknown> {
  return new Promise((resolve) => {
    const w = window as unknown as { L?: unknown };
    if (w.L) return resolve(w.L);
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let s = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = "leaflet-js";
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => resolve((window as unknown as { L: unknown }).L);
      document.body.appendChild(s);
    } else {
      s.addEventListener("load", () => resolve((window as unknown as { L: unknown }).L));
    }
  });
}

const CATEGORIES = [
  "Secours à Personnes",
  "Accidents de la Circulation",
  "Incendies",
  "Opérations Diverses"
];

const NATURES: Record<string, string[]> = {
  "Secours à Personnes": [
    "Malaise à domicile / sur la voie publique",
    "Chute de hauteur",
    "Arrêt cardio-respiratoire",
    "Blessure par arme",
    "Asphyxie / Intoxication"
  ],
  "Accidents de la Circulation": [
    "Collision entre deux véhicules légers",
    "Accident impliquant un poids lourd ou un bus",
    "Renversement de piéton",
    "Chute de motocycle"
  ],
  "Incendies": [
    "Feu de forêt / Maquis / Broussailles",
    "Feu d'habitation",
    "Feu de véhicule",
    "Feu industriel ou commercial"
  ],
  "Opérations Diverses": [
    "Inondation / Évacuation des eaux",
    "Dégagement de la voie publique",
    "Sauvetage de personnes bloquées",
    "Fausse alerte"
  ]
};

const DAIRAS = [
  "Béjaïa", "Amizour", "Akbou", "El Kseur", "Sidi Aïch", "Kherrata",
  "Souk El Ténine", "Tazmalt", "Ifri Ouzellaguen", "Darguina", "Adekar",
  "Seddouk", "Chemini", "Tichy", "Aokas", "Timizart / Timezrit"
];

const COMMUNES: Record<string, string[]> = {
  "Béjaïa": ["Béjaïa", "Oued Ghir"],
  "Amizour": ["Amizour", "Ferraoun", "Barbacha", "Kendira"],
  "Akbou": ["Akbou", "Chellata", "Ighram", "Tamokra"],
  "El Kseur": ["El Kseur", "Oued Amizour (Oued Ghir)", "Semaoun"],
  "Sidi Aïch": ["Sidi Aïch", "Leflaye", "Tinabdher", "Tinebdar", "Sidi Ayad"],
  "Kherrata": ["Kherrata", "Draâ El Kaïd"],
  "Souk El Ténine": ["Souk El Ténine", "Melbou", "Tamridjet"],
  "Tazmalt": ["Tazmalt", "M'cisna", "Boudjellil"],
  "Ifri Ouzellaguen": ["Ouzellaguen"],
  "Darguina": ["Darguina", "Aït R'zine", "Taskriout"],
  "Adekar": ["Adekar", "Taourirt Ighil", "Benni Ksila"],
  "Seddouk": ["Seddouk", "Amalou", "M'cisna", "Bouhamza"],
  "Chemini": ["Chemini", "Souk Oufella", "Aït Mellikeche", "Sanhadja"],
  "Tichy": ["Tichy", "Aït Tizi", "Boukhelifa"],
  "Aokas": ["Aokas", "Tizi N'Berber"],
  "Timizart / Timezrit": ["Timezrit"]
};

type TransferTarget = {
  id: string;
  label: string;
  unit: string;
  phone: string;
};

// Schéma plat réellement produit par le modèle extracteur (Qwen DGPC).
type ExtractorParsed = {
  incident_type?: string | null;
  intent?: string | null;
  urgency_human?: string | null;
  commune?: string | null;
  lieu?: string | null;
  location_description?: string | null;
  victims_count?: number | null;
  injury_severity?: string | null;
  fire_present?: string | null;
  trapped_persons?: string | null;
};

type ExtractorResult = {
  json_valid?: boolean;
  parsed?: ExtractorParsed | null;
  think?: string;
  error?: string;
  model_id?: string;
};

const TRANSFER_TARGETS: TransferTarget[] = [
  { id: "cco", label: "Chef de salle CCO", unit: "Coordination wilaya", phone: "DEMO — non joignable" },
  { id: "bejaia", label: "Unité Béjaïa", unit: "Secours urbain", phone: "DEMO — non joignable" },
  { id: "oued-ghir", label: "Unité Oued Ghir", unit: "Ambulance / renfort", phone: "DEMO — non joignable" },
  { id: "el-kseur", label: "Unité El Kseur", unit: "Secteur ouest", phone: "DEMO — non joignable" },
  { id: "souk-el-tenine", label: "Unité Souk El Ténine", unit: "Secteur est", phone: "DEMO — non joignable" },
  { id: "samu", label: "SAMU Béjaïa", unit: "Médical", phone: "DEMO — non joignable" },
  { id: "gendarmerie", label: "Gendarmerie", unit: "Sécurité", phone: "DEMO — non joignable" }
];

// Par défaut : chemin relatif "" -> /api/... proxifié par Next vers le backend (même domaine).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

const findDairaForCommune = (communeName: string) => {
  const normalized = communeName.toLowerCase();
  return DAIRAS.find((dairaName) =>
    (COMMUNES[dairaName] || []).some((candidate) => candidate.toLowerCase() === normalized)
  );
};

// Traductions lisibles pour l'affichage de la fiche extraite.
const URGENCY_FR: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée", critical: "Critique", unknown: "Inconnue" };
const YESNO_FR: Record<string, string> = { yes: "Oui", no: "Non", unknown: "Inconnu" };
const SEVERITY_FR: Record<string, string> = { none: "Aucune", minor: "Légère", severe: "Grave", unknown: "Inconnue" };
const INTENT_FR: Record<string, string> = { request_help: "Demande de secours", report_incident: "Signalement", update_info: "Mise à jour", false_alarm: "Fausse alerte", other: "Autre" };

const fr = (map: Record<string, string>, v?: string | null) =>
  v ? (map[v.toLowerCase()] ?? v) : "—";

function FicheField({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div>
      <p className="font-black text-slate-400 uppercase">{label}</p>
      <p className={`font-bold break-words ${empty ? "text-slate-400" : accent ? "text-[#D32F2F]" : "text-slate-800"}`}>
        {empty ? "—" : value}
      </p>
    </div>
  );
}

export default function Appels() {
  // Form State
  const [nature, setNature] = useState("");
  const [category, setCategory] = useState("");
  const [daira, setDaira] = useState("");
  const [commune, setCommune] = useState("");
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("Citoyen");
  const phone = "DEMO — numéro fictif";
  const [timestamp, setTimestamp] = useState("");
  // Calculé côté client uniquement (évite un mismatch d'hydratation date serveur/client).

  const [victims, setVictims] = useState(0);

  // UI & Simulation State
  const [modelsEnabled, setModelsEnabled] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/api/health`).then(r => r.json()).then(d => setModelsEnabled(d.mode === "models" && d.asr?.loaded === true)).catch(() => {});
  }, []);
  const [isCalling, setIsCalling] = useState(true);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferTarget | null>(null);
  const [transferStatus, setTransferStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [transcription, setTranscription] = useState("");
  const [extractionResult, setExtractionResult] = useState<ExtractorResult | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  // Modèle d'extraction sélectionné (envoyé au backend) : "qwen" (2B, défaut) ou "gemma" (12B).
  const [extractorModel, setExtractorModel] = useState<"qwen" | "gemma">("qwen");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Audio visualizer refs (Web Audio API)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Carte Leaflet (OpenStreetMap) navigable
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialisation de la carte (une fois, côté client)
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then((L: any) => {
      if (cancelled || !mapDivRef.current || leafletMapRef.current) return;
      const map = L.map(mapDivRef.current).setView(DEFAULT_CENTER, 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      markerRef.current = L.marker(DEFAULT_CENTER).addTo(map);
      leafletMapRef.current = map;
      setTimeout(() => map.invalidateSize(), 250); // assure le bon rendu dans le flex
    });
    return () => { cancelled = true; };
  }, []);

  // Recentrer sur la commune détectée par l'extracteur
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map) return;
    const coords = COMMUNE_COORDS[commune];
    if (coords) {
      map.flyTo(coords, 13, { duration: 1.2 });
      if (markerRef.current) {
        markerRef.current.setLatLng(coords).bindPopup(`<b>${commune}</b>`).openPopup();
      }
    }
  }, [commune]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Call Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isAnswered) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAnswered]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Handlers
  const handleAnswer = () => {
    setTimestamp(new Date().toLocaleString("fr-DZ"));
    setIsAnswered(true);
    setIsCalling(false);
  };

  const handleSpam = () => {
    setNature(""); setCategory(""); setDaira(""); setCommune(""); setAddress("");
    setTranscription(""); setIsMicActive(false);
    setExtractionResult(null);
    setIsTransferOpen(false); setSelectedTransfer(null); setTransferStatus("idle");
    setCallDuration(0); setVictims(0);
    setIsAnswered(false);
    setIsCalling(false);
    alert("Appel rejeté et classé comme Spam.");
  };

  const handleEndCall = () => {
    setIsAnswered(false);
    setIsTransferOpen(false);
    setTransferStatus("idle");
    setSelectedTransfer(null);
    if (isMicActive) {
      handleStopMic();
    }
  };

  const applyHeuristicFields = (lowerText: string) => {
    if (lowerText.includes("accident") || lowerText.includes("collision")) {
      setCategory("Accidents de la Circulation");
      setNature("Collision entre deux véhicules légers");
    } else if (lowerText.includes("feu") || lowerText.includes("incendie")) {
      setCategory("Incendies");
      setNature("Feu de forêt / Maquis / Broussailles");
    } else if (lowerText.includes("malaise") || lowerText.includes("blessé")) {
      setCategory("Secours à Personnes");
      setNature("Malaise à domicile / sur la voie publique");
    }

    if (lowerText.includes("amizour")) {
      setDaira("Amizour");
      setCommune("Amizour");
    } else if (lowerText.includes("akbou")) {
      setDaira("Akbou");
      setCommune("Akbou");
    } else if (lowerText.includes("kseur")) {
      setDaira("El Kseur");
      setCommune("El Kseur");
    } else {
      setDaira("Béjaïa");
      setCommune("Béjaïa");
    }

    const victimMatch = lowerText.match(/(\d+)\s*(victime|blessé|personne)/);
    if (victimMatch) setVictims(parseInt(victimMatch[1]));
  };

  const applyExtractorFields = (parsed: ExtractorParsed, lowerText: string) => {
    const incidentType = (parsed.incident_type || "").toLowerCase();

    if (incidentType.includes("accident")) {
      setCategory("Accidents de la Circulation");
      setNature(incidentType.includes("pedestrian") ? "Renversement de piéton" : "Collision entre deux véhicules légers");
    } else if (incidentType.includes("fire") || incidentType.includes("incendie")) {
      setCategory("Incendies");
      setNature(incidentType === "fire_building" ? "Feu d'habitation" : incidentType === "fire_vehicle" ? "Feu de véhicule" : "Feu de forêt / Maquis / Broussailles");
    } else if (incidentType.includes("medical") || incidentType.includes("secours")) {
      setCategory("Secours à Personnes");
      setNature("Malaise à domicile / sur la voie publique");
    } else if (incidentType.includes("other")) {
      setCategory("Opérations Diverses");
      setNature("Fausse alerte");
    } else {
      applyHeuristicFields(lowerText);
    }

    const extractedCommune = parsed.commune || "";
    const matchedDaira = extractedCommune ? findDairaForCommune(extractedCommune) : undefined;
    // On ne renseigne commune/daïra que si la commune extraite est reconnue.
    if (extractedCommune && matchedDaira) {
      setDaira(matchedDaira);
      setCommune(extractedCommune);
    }

    const extractedAddress = parsed.lieu || parsed.location_description || "";
    if (extractedAddress) setAddress(extractedAddress);

    const victimCount = parsed.victims_count;
    if (typeof victimCount === "number" && Number.isFinite(victimCount)) {
      setVictims(Math.max(0, Math.round(victimCount)));
    }
  };

  const loadDemoScenario = async () => {
    setScenarioLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/next-call`);
      if (!response.ok) throw new Error("Le backend ne répond pas");
      const data = await response.json();
      setTimestamp(data.timestamp);
      setTranscription(data.transcription);
      setExtractionResult(data.extraction);
      applyExtractorFields(data.extraction.parsed, data.transcription.toLowerCase());
      setIsAnswered(true); setIsCalling(false);
    } catch {
      setTranscription("Impossible de charger le scénario fictif. Démarrez le backend FastAPI.");
    } finally { setScenarioLoading(false); }
  };

  const handleStartMic = async () => {
    if (!modelsEnabled) return;
    setIsMicActive(true);
    setExtractionResult(null);
    setTranscription("Écoute en cours... 🔴");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // --- Audio visualizer setup ---
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const drawBars = () => {
        const canvas = canvasRef.current;
        const an = analyserRef.current;
        if (!canvas || !an) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const bufLen = an.frequencyBinCount;
        const data = new Uint8Array(bufLen);
        an.getByteFrequencyData(data);
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const barW = Math.max(2, (W / bufLen) * 1.5);
        const gap = 1;
        for (let i = 0; i < bufLen; i++) {
          const v = data[i] / 255;
          const barH = v * H;
          const x = i * (barW + gap);
          if (x > W) break;
          // gradient from green to red based on volume
          const r = Math.round(v * 220);
          const g = Math.round((1 - v) * 180 + 60);
          ctx.fillStyle = `rgb(${r},${g},40)`;
          ctx.fillRect(x, H - barH, barW, barH);
        }
        animFrameRef.current = requestAnimationFrame(drawBars);
      };
      drawBars();

      mediaRecorder.start();
    } catch (err) {
      console.error(err);
      setTranscription("Erreur: Impossible d'accéder au microphone. Vérifiez vos permissions.");
      setIsMicActive(false);
    }
  };

  const handleStopMic = () => {
    setIsMicActive(false);
    // --- Stop audio visualizer ---
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    analyserRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setTranscription("Analyse audio en cours...");

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm;codecs=opus" });
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.wav");
        formData.append("model", extractorModel);

        try {
          const response = await fetch(`${API_BASE}/api/transcrire`, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error("Erreur Backend");

          const data = await response.json();
          const text = data.transcription || data.text || "";
          const extraction = (data.extraction || null) as ExtractorResult | null;
          const parsedExtraction = extraction?.json_valid ? extraction.parsed : null;
          setExtractionResult(extraction);
          const lowerText = text.toLowerCase();

          // Si l'extracteur produit une fiche valide avec un type d'incident reconnu,
          // on lui fait confiance même sans mots-clés FR (dialecte / arabizi).
          const extractedIncident = (parsedExtraction?.incident_type || "").toLowerCase();
          const hasValidExtraction = !!parsedExtraction && extractedIncident !== "" && extractedIncident !== "unknown";
          const hasEmergency = hasValidExtraction || lowerText.includes("blessé") || lowerText.includes("accident") || lowerText.includes("feu") || lowerText.includes("malaise") || lowerText.includes("urgence");

          if (!hasEmergency || text.trim().length < 15) {
            setTranscription(text + "\n\n(Message non reconnu ou insuffisant, classé comme suspect)");
            // On laisse les champs vides pour que l'opérateur puisse cliquer sur SUPPRIMER
          } else {
            setTranscription(text);

            if (parsedExtraction) {
              applyExtractorFields(parsedExtraction, lowerText);
            } else {
              applyHeuristicFields(lowerText);
            }
          }
        } catch (err) {
          console.error(err);
          setTranscription("Erreur: Impossible de contacter le serveur d'analyse.");
        }
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleEnvoyer3ayina = async () => {
    setIsSending(true);
    try {
      const resp = await fetch(`${API_BASE}/api/save_call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nature: nature || category,
          category: category,
          commune: commune,
          address: address,
          transcription: transcription,
          extraction: extractionResult,
          victims: victims,
          source: source,
          phone: phone
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json().catch(() => ({}));
      alert(data.added_to_rag
        ? "Exemple enregistré localement dans la démo et ajouté au tableau de bord."
        : "Exemple enregistré localement. Aucun transfert réel.");
      handleCancel();
    } catch (err) {
      console.error(err);
      alert("Échec de l'envoi : le serveur n'a pas répondu. Vérifie que le backend tourne.");
    }
    setIsSending(false);
  };

  const handleSelectTransfer = (target: TransferTarget) => {
    if (transferStatus !== "idle") return; // pas de changement de cible pendant un transfert
    setSelectedTransfer(target);
  };

  const handleStartTransfer = () => {
    if (!selectedTransfer) return;
    setTransferStatus("connecting");
    // Établissement de la liaison (simulation jusqu'au branchement téléphonique réel).
    setTimeout(() => setTransferStatus("connected"), 1600);
  };

  const handleEndTransfer = () => {
    setTransferStatus("idle");
    setSelectedTransfer(null);
  };

  const closeTransferPanel = () => {
    setIsTransferOpen(false);
    setTransferStatus("idle");
    setSelectedTransfer(null);
  };

  const handleCancel = () => {
    setNature(""); setCategory(""); setDaira(""); setCommune(""); setAddress("");
    setTranscription(""); setIsMicActive(false);
    setExtractionResult(null);
    setIsTransferOpen(false); setSelectedTransfer(null); setTransferStatus("idle");
    setCallDuration(0); setVictims(0);
    setIsAnswered(false); setIsCalling(true);
  };

  const natureOptions = category ? NATURES[category] || [] : [];
  const communeOptions = daira ? COMMUNES[daira] || [] : [];

  return (
    <div className="flex-1 overflow-hidden flex flex-col gap-4 h-full bg-slate-50">
      {/* Emergency Call Banner */}
      {isCalling && (
        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm flex items-center justify-between shrink-0 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#D32F2F] rounded-full flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[32px]">phone_in_talk</span>
            </div>
            <div>
              <h2 className="font-h2 text-[24px] font-bold text-[#D32F2F]">Appel d&apos;Urgence Entrant</h2>
              <p className="font-data-mono text-[18px] text-slate-500 mt-1">{phone}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSpam} className="px-6 py-2 rounded-lg border-2 border-orange-500 text-orange-600 font-bold hover:bg-orange-50 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">shield</span> Spam
            </button>
            <button onClick={() => setIsCalling(false)} className="px-6 py-2 rounded-lg border border-red-200 text-[#D32F2F] font-medium hover:bg-red-50">Refuser</button>
            <button onClick={handleAnswer} className="px-8 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">call</span> RÉPONDRE
            </button>
          </div>
        </div>
      )}

      {/* Live Status */}
      {isAnswered && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[18px]">mic</span>
            </div>
            <p className="text-green-800 font-bold">Communication active - {formatTime(callDuration)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => (isTransferOpen ? closeTransferPanel() : setIsTransferOpen(true))}
              className={`px-5 py-2 rounded-lg text-sm font-black shadow-md flex items-center gap-2 uppercase tracking-tighter transition-all ${
                isTransferOpen
                  ? "bg-white text-[#0061a4] border-2 border-[#0061a4]"
                  : "bg-[#0061a4] text-white hover:bg-[#004f86]"
              } ${transferStatus === "connected" ? "ring-2 ring-green-400" : ""}`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isTransferOpen ? "close" : "phone_forwarded"}
              </span>
              {isTransferOpen ? "Fermer" : "Transférer"}
            </button>
            <button onClick={handleEndCall} className="bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-black hover:bg-red-700 shadow-md flex items-center gap-2 uppercase tracking-tighter">
              <span className="material-symbols-outlined text-[18px]">call_end</span> Raccrocher
            </button>
          </div>
        </div>
      )}

      {isAnswered && isTransferOpen && (
        <div className="mx-4 bg-white border border-blue-200 rounded-xl shadow-lg shrink-0 overflow-hidden animate-in slide-in-from-top duration-300">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/60 to-white">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0061a4]">phone_forwarded</span>
              <h3 className="text-[16px] font-black text-slate-800">Transfert d&apos;appel</h3>
            </div>
            {transferStatus === "connected" ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Liaison établie
              </span>
            ) : transferStatus === "connecting" ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-[#0061a4] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0061a4] animate-ping"></span> Connexion…
              </span>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">
                {selectedTransfer ? "Prêt à transférer" : "Sélectionnez une unité"}
              </span>
            )}
          </div>

          {transferStatus === "connected" ? (
            /* Vue liaison établie */
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 border-4 border-green-300 flex items-center justify-center shadow-inner">
                <span className="material-symbols-outlined text-green-600 text-[34px]">call</span>
              </div>
              <div>
                <p className="text-[12px] font-black uppercase tracking-widest text-green-700">Appel transféré</p>
                <p className="text-[18px] font-black text-slate-800 mt-0.5">{selectedTransfer?.label}</p>
                <p className="font-data-mono text-[15px] text-[#0061a4] font-black">{selectedTransfer?.phone}</p>
              </div>
              <button
                type="button"
                onClick={handleEndTransfer}
                className="mt-1 px-5 py-2 rounded-lg bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 shadow-md flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">call_end</span> Terminer le transfert
              </button>
            </div>
          ) : (
            <>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {TRANSFER_TARGETS.map((target) => {
                  const isSelected = selectedTransfer?.id === target.id;
                  const isConnecting = transferStatus === "connecting";
                  return (
                    <button
                      key={target.id}
                      type="button"
                      disabled={isConnecting}
                      onClick={() => handleSelectTransfer(target)}
                      className={`text-left rounded-lg border p-3 transition-all disabled:opacity-50 ${
                        isSelected
                          ? "border-[#0061a4] bg-blue-50 shadow-sm ring-1 ring-[#0061a4]/30"
                          : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[14px] font-black text-slate-800">{target.label}</span>
                        {isSelected && <span className="material-symbols-outlined text-[#0061a4] text-[18px]">check_circle</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 font-bold mt-1">{target.unit}</p>
                      <p className="font-data-mono text-[16px] text-[#0061a4] font-black mt-2">{target.phone}</p>
                    </button>
                  );
                })}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-600 flex items-center gap-2">
                  {selectedTransfer ? (
                    <><span className="material-symbols-outlined text-[16px] text-[#0061a4]">arrow_forward</span>
                    Cible : <span className="font-black text-slate-800">{selectedTransfer.label}</span></>
                  ) : "Choisissez un destinataire pour lancer le transfert."}
                </p>
                <button
                  type="button"
                  disabled={!selectedTransfer || transferStatus === "connecting"}
                  onClick={handleStartTransfer}
                  className="px-5 py-2 rounded-lg bg-[#0061a4] text-white text-xs font-black uppercase tracking-widest hover:bg-[#004f86] shadow-md flex items-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                >
                  {transferStatus === "connecting" ? (
                    <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Connexion…</>
                  ) : (
                    <><span className="material-symbols-outlined text-[16px]">phone_forwarded</span> Lancer le transfert</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 p-4">
        {/* Left Column: Form */}
        <div className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-[20px] font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#D32F2F]">description</span> Détails de l&apos;Intervention
            </h3>
            <form className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Date / Heure</label>
                <input className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={timestamp} readOnly />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Catégorie</label>
                  <select className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold text-[#D32F2F]" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">-- Catégorie --</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Nature de l&apos;incident</label>
                  <select className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={nature} onChange={(e) => setNature(e.target.value)}>
                    <option value="">-- Nature --</option>
                    {natureOptions.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Daïra</label>
                  <select className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={daira} onChange={(e) => setDaira(e.target.value)}>
                    <option value="">-- Daïra --</option>
                    {DAIRAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Commune</label>
                  <select className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={commune} onChange={(e) => setCommune(e.target.value)}>
                    <option value="">-- Commune --</option>
                    {communeOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Adresse / Lieu-dit</label>
                <input className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Victimes</label>
                  <input className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={victims} onChange={(e) => setVictims(parseInt(e.target.value) || 0)} type="number" min="0" />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Source</label>
                  <select className="w-full bg-slate-50 rounded-lg border-slate-200 text-[14px] p-3 font-bold" value={source} onChange={(e) => setSource(e.target.value)}>
                    <option>Citoyen</option>
                    <option>Gendarmerie</option>
                    <option>Sûreté</option>
                  </select>
                </div>
              </div>
            </form>
          </div>

          {/* AI Analysis Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-[20px] font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#D32F2F]">psychology</span> Analyse Vocale IA
              </div>
              {isAnswered && (
                <div>
                  {!isMicActive ? (
                    <button onClick={handleStartMic} disabled={!modelsEnabled} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-1 shadow-sm">
                      <span className="material-symbols-outlined text-[16px]">mic</span> Allumer Micro
                    </button>
                  ) : (
                    <button onClick={handleStopMic} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 flex items-center gap-1 shadow-sm animate-pulse">
                      <span className="material-symbols-outlined text-[16px]">mic_off</span> Couper Micro
                    </button>
                  )}
                </div>
              )}
            </h3>
            {/* Sélecteur du modèle d'extraction (Qwen 2B / Gemma 12B) envoyé au backend */}
            <button type="button" onClick={loadDemoScenario} disabled={scenarioLoading} className="mb-3 w-full rounded-lg bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 text-sm font-semibold disabled:opacity-50">
              {scenarioLoading ? "Chargement…" : "Charger un scénario fictif"}
            </button>
            {!modelsEnabled && <p className="text-xs text-slate-500 mb-3">Fiche prédéfinie de démonstration. Aucun modèle IA exécuté. Le microphone nécessite les modèles optionnels.</p>}
            <div className="mb-4 flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-slate-500">smart_toy</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Modèle d&apos;extraction</span>
              </div>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-inner">
                {([
                  { key: "qwen", label: "Qwen 2B" },
                  { key: "gemma", label: "Gemma 12B" },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    disabled={isMicActive || !modelsEnabled}
                    onClick={() => setExtractorModel(m.key)}
                    className={`px-3 py-1 rounded-md text-[12px] font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      extractorModel === m.key
                        ? "bg-[#D32F2F] text-white shadow"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-slate-900 p-6 rounded-lg min-h-[220px] max-h-[350px] overflow-y-auto mb-4 border border-slate-800 shadow-2xl custom-scrollbar relative">
               <div className="sticky top-0 bg-slate-900 pb-2 mb-2 border-b border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transcription en direct</p>
               </div>
               {/* Real-time audio visualizer (shown while mic is active) */}
               {isMicActive && (
                 <div className="mb-3 rounded-lg overflow-hidden bg-slate-800/60 border border-slate-700 p-2">
                   <div className="flex items-center gap-2 mb-1">
                     <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                     <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Signal Audio en Direct</span>
                   </div>
                   <canvas ref={canvasRef} width={460} height={60} className="w-full h-[60px] rounded" />
                 </div>
               )}
               <p className={`text-[18px] leading-relaxed font-bold font-mono italic ${transcription ? 'text-white' : 'text-green-400'}`}>
                 {transcription ? transcription :
                  isMicActive ? "Écoute en cours... 🔴" :
                  isAnswered ? "Chargez un scénario fictif pour explorer la démonstration." :
                  "En attente de communication..."}
               </p>
            </div>
            {extractionResult && (
              <div className={`mb-4 rounded-lg border p-4 ${
                extractionResult.json_valid
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-orange-50 border-orange-200"
              }`}>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[18px] ${extractionResult.json_valid ? "text-emerald-700" : "text-orange-700"}`}>
                      {extractionResult.json_valid ? "fact_check" : "warning"}
                    </span>
                    <p className="text-[12px] font-black uppercase tracking-widest text-slate-700">
                      {modelsEnabled ? "Extracteur HF" : "Fiche prédéfinie"}
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {extractionResult.model_id === "synthetic-fixture" ? "Scénario fictif — aucun modèle exécuté" : (extractionResult.model_id || "").toLowerCase().includes("gemma")
                      ? "Modèle DGPC — Gemma 12B"
                      : "Modèle DGPC — Qwen 2B"}
                  </span>
                </div>
                {extractionResult.json_valid && extractionResult.parsed ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
                      <FicheField label="Incident" value={extractionResult.parsed.incident_type} accent />
                      <FicheField label="Urgence" value={fr(URGENCY_FR, extractionResult.parsed.urgency_human)} accent />
                      <FicheField label="Intention" value={fr(INTENT_FR, extractionResult.parsed.intent)} />
                      <FicheField label="Commune" value={extractionResult.parsed.commune} />
                      <FicheField label="Lieu" value={extractionResult.parsed.lieu || extractionResult.parsed.location_description} />
                      <FicheField label="Victimes" value={extractionResult.parsed.victims_count} />
                      <FicheField label="Gravité" value={fr(SEVERITY_FR, extractionResult.parsed.injury_severity)} />
                      <FicheField label="Feu présent" value={fr(YESNO_FR, extractionResult.parsed.fire_present)} />
                      <FicheField label="Personnes piégées" value={fr(YESNO_FR, extractionResult.parsed.trapped_persons)} />
                    </div>
                    {extractionResult.think && (
                      <details className="mt-3 border-t border-emerald-200 pt-2">
                        <summary className="text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer select-none">
                          Raisonnement du modèle
                        </summary>
                        <p className="mt-2 text-[12px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                          {extractionResult.think}
                        </p>
                      </details>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] font-semibold text-orange-800">
                    JSON non valide ou absent : {extractionResult.error || "réponse vide"}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full bg-green-500 transition-all duration-500 ${isAnswered ? 'w-full' : 'w-0'}`}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Map & Actions */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-200 border border-slate-200 rounded-xl overflow-hidden flex-1 relative shadow-inner min-h-[300px]">
            {/* Carte OpenStreetMap navigable (Leaflet) — se centre sur la commune détectée */}
            <div ref={mapDivRef} className="absolute inset-0 z-0" />
            {commune && COMMUNE_COORDS[commune] && (
              <div className="absolute top-3 left-3 z-[500] bg-white/95 backdrop-blur px-3 py-1.5 rounded-lg shadow-lg border border-slate-200 flex items-center gap-2 pointer-events-none">
                <span className="material-symbols-outlined text-[#D32F2F] text-[18px]">location_on</span>
                <span className="text-[13px] font-black text-slate-800">{commune}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 shrink-0">
            <button onClick={handleEnvoyer3ayina} disabled={isSending || !transcription.trim()} className="w-full bg-[#0061a4] text-white py-5 rounded-xl font-black text-[20px] hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50 uppercase tracking-tighter">
              {isSending ? "Enregistrement..." : "Enregistrer la démo"}
            </button>
            <button onClick={handleCancel} className="w-full border-2 border-red-500 text-red-600 py-5 rounded-xl font-black text-[20px] hover:bg-red-50 transition-all flex items-center justify-center gap-3 uppercase tracking-tighter shadow-sm">
              <span className="material-symbols-outlined text-[24px]">delete</span> Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
