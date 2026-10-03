"use client";

import Image from "next/image";

import { useState, useRef, useEffect } from "react";

// Types
interface Message {
  role: "user" | "assistant";
  content: string;
  source?: string;
}

interface Alert {
  id: number;
  type: "warning" | "info" | "critical";
  title: string;
  description: string;
  details?: string;
}

interface ReportCategory { title: string; total: number; items: { labelFr: string; count: number; value: number }[] }
interface ReportStats {
  total: number;
  victims: number;
  avg_per_day: number;
  categories: Record<string, ReportCategory>;
  category_order: string[];
  coverage?: { from?: string; to?: string };
}

// Par défaut : chemin relatif "" -> /api/... proxifié par Next vers le backend (même domaine).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export default function AssistantDecisionnelDGPC() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour. Je réponds à vos questions sur les interventions enregistrées (scénarios fictifs). Par exemple : « où y a-t-il le plus d'accidents de voiture ? », « combien de victimes au total ? », « combien d'incendies à Béjaïa ? ».",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // States for UI Components
  const [showSettings, setShowSettings] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:8000");
  const [language, setLanguage] = useState("Français");

  // Questions suggérées (cliquables) — interrogent le RAG sur les scénarios fictifs.
  const [alerts] = useState<Alert[]>([
    { id: 1, type: "info", title: "Accidents graves / semaine", description: "Combien d'accidents graves cette semaine ?" },
    { id: 2, type: "info", title: "Accidents par lieu", description: "Où y a-t-il le plus d'accidents de la route ?" },
    { id: 3, type: "info", title: "Fausses alertes / mois", description: "Combien de fausses alertes ce mois-ci ?" },
    { id: 4, type: "info", title: "Urgences critiques", description: "Combien d'interventions d'urgence critique ?" },
    { id: 5, type: "info", title: "Vue d'ensemble", description: "Donne-moi un résumé des interventions." },
  ]);

  const [notifications] = useState([
    { id: 1, title: "Nouvel Appel", desc: "Accident RN26 (El-Kseur)", time: "2 min" },
    { id: 2, title: "Mise à jour", desc: "Unité Akbou en route", time: "5 min" },
    { id: 3, title: "Alerte", desc: "Risque météo Orange", time: "15 min" },
  ]);

  // Rapport stratégique : généré à partir des VRAIES statistiques (/api/stats), par période.
  const [reportData, setReportData] = useState<ReportStats | null>(null);
  const [reportPeriod, setReportPeriod] = useState<"" | "semaine" | "aujourd_hui">("");
  const reportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showReportModal) return;
    const q = reportPeriod ? `?periode=${reportPeriod}` : "";
    fetch(`${API_BASE}/api/stats${q}`)
      .then((r) => r.json())
      .then((d: ReportStats) => setReportData(d))
      .catch((e) => console.error("Rapport:", e));
  }, [showReportModal, reportPeriod]);
  const PERIOD_LABEL: Record<string, string> = {
    "": "Rapport général — toutes les interventions",
    "semaine": "Rapport hebdomadaire — 7 derniers jours",
    "aujourd_hui": "Rapport journalier — aujourd'hui",
  };

  const printReport = () => {
    if (!reportRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><meta charset="utf-8"><title>Rapport DGPC Béjaïa</title><style>body{font-family:sans-serif;padding:30px;color:#1a1c1e}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}h1{font-size:18px;text-align:center}</style></head><body>${reportRef.current.innerHTML}<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };

  const downloadReport = () => {
    if (!reportRef.current) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Rapport DGPC Béjaïa</title><style>body{font-family:sans-serif;padding:30px;color:#1a1c1e}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px}h1{font-size:18px;text-align:center}</style></head><body>${reportRef.current.innerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rapport_DGPC_Bejaia_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const topCategory = reportData
    ? reportData.category_order.map((k) => reportData.categories[k]).sort((a, b) => b.total - a.total)[0]
    : null;

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: textToSend }]);
    if (!customText) setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: textToSend }),
      });
      if (!res.ok) throw new Error("Backend");
      const data = await res.json();
      const answer = (data.answer as string) || "Je n'ai pas pu traiter cette question.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, source: "Données fictives de démonstration" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Erreur : le serveur d'analyse est injoignable. Vérifiez que le backend tourne." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlertClick = (alert: Alert) => {
    handleSend(alert.description);
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 h-full p-2 relative">
      {/* Zone de Chat Principale */}
      <div className="flex-1 flex flex-col bg-white rounded-[32px] border-2 border-[#D92721]/10 shadow-xl overflow-hidden relative">
        {/* Header Officiel */}
        <div className="px-8 py-5 border-b-2 border-[#D92721]/10 flex items-center justify-between bg-white relative z-20">
          <div className="flex items-center gap-5">
            <div className="relative w-14 h-14 flex-shrink-0">
              <Image width={64} height={64} src="/prototype-mark.svg" alt="Alerte IA — prototype" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#D92721] tracking-tight uppercase">Assistant Décisionnel DGPC</h2>
              <p className="text-[11px] text-slate-500 font-bold uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-emerald-500">security</span>
                Prototype de recherche • Données fictives
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Bell Icon */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2.5 rounded-xl transition-all ${showNotifications ? "bg-[#D92721] text-white" : "hover:bg-slate-100 text-slate-400"}`}
              >
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">3</span>
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <span className="text-[10px] font-black text-[#D92721] uppercase tracking-widest">Alertes Récentes</span>
                    <span className="text-[10px] font-bold text-slate-400">Marquer tout lu</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map(n => (
                      <div key={n.id} className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer">
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="text-xs font-black text-slate-800">{n.title}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{n.time}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500">{n.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Settings Icon */}
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2.5 rounded-xl transition-all ${showSettings ? "bg-slate-800 text-white" : "hover:bg-slate-100 text-slate-400"}`}
              >
                <span className="material-symbols-outlined">settings</span>
              </button>

              {showSettings && (
                <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 animate-in fade-in zoom-in duration-200">
                  <h4 className="text-xs font-black text-slate-800 uppercase mb-4 tracking-widest border-b border-slate-50 pb-2">Paramètres Système</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">URL Serveur API</label>
                      <input
                        type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-[#D92721]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Langue de l&apos;IA</label>
                      <select
                        value={language} onChange={(e) => setLanguage(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none cursor-pointer"
                      >
                        <option>Français</option><option>Arabe</option><option>Kabyle</option>
                      </select>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-full py-2 bg-[#D92721] text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md">Enregistrer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Zone de Dialogue */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 flex flex-col gap-6 custom-scrollbar bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 duration-300`}>
              <div className={`max-w-[75%] flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} gap-2`}>
                <div className={`px-6 py-4 rounded-3xl text-sm font-medium shadow-sm leading-relaxed whitespace-pre-line ${msg.role === "user" ? "bg-[#D92721] text-white rounded-tr-none" : "bg-white border-2 border-slate-100 text-slate-800 rounded-tl-none shadow-md"}`}>
                  {msg.content}
                </div>
                {msg.source && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FDB913]/10 rounded-full border border-[#FDB913]/20">
                    <span className="material-symbols-outlined text-[12px] text-[#FDB913]">verified</span>
                    <span className="text-[10px] font-black text-[#FDB913] uppercase tracking-tight">Source : {msg.source}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border-2 border-slate-100 px-6 py-4 rounded-3xl rounded-tl-none flex gap-2 shadow-sm">
                <div className="w-2 h-2 bg-[#D92721] rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-[#D92721] rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-[#D92721] rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          )}
        </div>

        {/* Zone de Saisie */}
        <div className="p-6 bg-white border-t-2 border-[#D92721]/10">
          <div className="relative max-w-4xl mx-auto flex gap-3">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1} className="w-full pl-6 pr-14 py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:border-[#D92721] focus:bg-white focus:outline-none text-sm font-semibold transition-all placeholder:text-slate-400 shadow-inner"
              placeholder="Posez une question sur les données (ex : où le plus d'accidents ? combien de victimes ?)"
            />
            <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="w-14 h-14 bg-[#D92721] text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
              <span className="material-symbols-outlined text-[24px]">send</span>
            </button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#D92721]">shield</span>
              Démonstration locale avec scénarios fictifs. Sélection d’équipe sans authentification. Aucun accès à un réseau opérationnel.
            </p>
          </div>
        </div>
      </div>

      {/* Barre Latérale : Recommandations */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-5">
        <div className="bg-white rounded-[32px] p-6 border-2 border-[#D92721]/10 shadow-xl flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 mb-6 border-b-2 border-slate-50 pb-4">
            <div className="w-10 h-10 rounded-xl bg-[#FDB913] flex items-center justify-center text-white shadow-lg">
              <span className="material-symbols-outlined">bolt</span>
            </div>
            <div>
              <h3 className="text-xs font-black text-[#D92721] uppercase tracking-tighter">Questions suggérées</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase">Sur les scénarios fictifs</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
            {alerts.map((alert) => (
              <div key={alert.id} onClick={() => handleAlertClick(alert)} className={`p-4 rounded-2xl border-l-4 transition-all shadow-sm cursor-pointer hover:translate-x-1 ${alert.type === "critical" ? "bg-red-50 border-[#D92721]" : alert.type === "warning" ? "bg-amber-50 border-[#FDB913]" : "bg-blue-50 border-blue-400"}`}>
                <div className="flex justify-between items-start mb-1">
                  <h4 className={`text-[11px] font-black uppercase ${alert.type === "critical" ? "text-[#D92721]" : alert.type === "warning" ? "text-amber-700" : "text-blue-700"}`}>{alert.title}</h4>
                  <span className="material-symbols-outlined text-[18px] opacity-70">{alert.type === "critical" ? "report_problem" : "notifications"}</span>
                </div>
                <p className="text-[11px] font-bold leading-tight text-slate-600">{alert.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t-2 border-slate-50">
            <button onClick={() => { setReportData(null); setShowReportModal(true); }} className="w-full py-4 bg-[#D92721] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#D92721]/90 shadow-lg shadow-[#D92721]/20 transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">description</span>
              Générer rapport stratégique
            </button>
          </div>
        </div>

        {/* Status Sécurité */}
        <div className="bg-[#1A1C1E] rounded-[32px] p-6 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-[#FDB913]">verified_user</span>
              <span className="text-[10px] font-black uppercase tracking-widest">Statut Réseau</span>
            </div>
            <h4 className="text-sm font-black mb-1 uppercase tracking-tighter">Prototype local</h4>
            <p className="text-[10px] text-white/60 font-bold leading-tight uppercase">Scénarios fictifs • Démonstration locale</p>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-[#D92721] rounded-full blur-3xl opacity-30"></div>
        </div>
      </div>

      {/* Strategic Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[80vh]">
            <div className="px-10 py-6 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <Image width={64} height={64} src="/prototype-mark.svg" alt="Logo" className="w-12 h-12 object-contain" />
                <h3 className="text-sm font-black text-[#D92721] uppercase tracking-widest">Aperçu du Rapport Stratégique</h3>
              </div>
              <button onClick={() => setShowReportModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-slate-600">close</span>
              </button>
            </div>
            {/* Sélecteur de période — recalcule les VRAIS chiffres */}
            <div className="px-10 py-3 border-b bg-white flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Type :</span>
              {([
                { key: "", label: "Général" },
                { key: "semaine", label: "Semaine" },
                { key: "aujourd_hui", label: "Journée" },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setReportData(null); setReportPeriod(p.key); }}
                  className={`px-4 py-1.5 rounded-lg text-[12px] font-black transition-all ${
                    reportPeriod === p.key
                      ? "bg-[#D92721] text-white shadow"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-12 bg-slate-100">
              {/* Rapport généré depuis les VRAIES données (/api/stats) */}
              <div ref={reportRef} className="bg-white p-10 shadow-lg min-h-full border border-slate-200">
                <div className="text-center mb-8 border-b-2 border-slate-900 pb-4">
                  <h1 className="text-lg font-black uppercase tracking-[0.2em]">Rapport de Situation Opérationnelle</h1>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">WILAYA DE BÉJAÏA • DIRECTION GÉNÉRALE DE LA PROTECTION CIVILE</p>
                  <p className="text-[11px] font-black text-[#D92721] mt-2 uppercase">{PERIOD_LABEL[reportPeriod]}</p>
                </div>
                <div className="space-y-6 text-sm">
                  <div className="flex justify-between font-bold text-[11px] uppercase text-slate-400">
                    <span>Date : {new Date().toLocaleDateString("fr-FR")}</span>
                    <span>Réf : DGPC-BJA/{new Date().getFullYear()}/{reportData?.total ?? "—"}</span>
                  </div>
                  <div className="space-y-4 pt-4">
                    <h2 className="font-black border-l-4 border-[#D92721] pl-3 text-[#D92721] uppercase">Résumé des Activités</h2>
                    <p className="text-slate-700 leading-relaxed font-medium">
                      {reportData
                        ? `La base fictive de démonstration contient ${reportData.total} interventions enregistrées, totalisant ${reportData.victims} victimes, soit une moyenne de ${reportData.avg_per_day} interventions par jour. ${topCategory ? `La nature dominante est « ${topCategory.title} » avec ${topCategory.total} interventions.` : ""}`
                        : "Chargement des données fictives…"}
                    </p>
                  </div>
                  <div className="space-y-4 pt-4">
                    <h2 className="font-black border-l-4 border-[#D92721] pl-3 text-[#D92721] uppercase">Répartition par nature</h2>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black uppercase">
                          <th className="p-2 border">Nature</th>
                          <th className="p-2 border">Volume</th>
                          <th className="p-2 border">Part</th>
                        </tr>
                      </thead>
                      <tbody className="text-[11px]">
                        {reportData?.category_order.map((k) => {
                          const c = reportData.categories[k];
                          const pct = reportData.total ? Math.round((100 * c.total) / reportData.total) : 0;
                          return (
                            <tr key={k}>
                              <td className="p-2 border font-bold">{c.title}</td>
                              <td className="p-2 border">{c.total}</td>
                              <td className="p-2 border">{pct}%</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 font-black">
                          <td className="p-2 border">TOTAL</td>
                          <td className="p-2 border">{reportData?.total ?? 0}</td>
                          <td className="p-2 border">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {reportData?.coverage?.from && (
                    <p className="text-[10px] text-slate-400 font-bold uppercase">
                      Période couverte : {reportData.coverage.from} → {reportData.coverage.to}
                    </p>
                  )}
                </div>
                <div className="mt-12 flex justify-between items-center pt-8 border-t border-slate-100">
                   <div className="w-32 h-16 border bg-slate-50 flex items-center justify-center text-[9px] font-black uppercase text-slate-300">Sceau Officiel</div>
                   <div className="text-right">
                     <p className="text-[10px] font-black uppercase">Données fictives</p>
                     <p className="text-[9px] text-slate-400">CCO Béjaïa — Système local</p>
                   </div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-white border-t flex justify-end gap-3">
              <button onClick={downloadReport} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Télécharger</button>
              <button onClick={printReport} className="px-8 py-2.5 bg-[#D92721] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-[#D92721]/20 hover:scale-105 transition-all">Imprimer Rapport</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
