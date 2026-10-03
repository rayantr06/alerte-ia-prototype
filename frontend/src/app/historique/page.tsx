"use client";

import { useState, useMemo, useEffect } from "react";

// Par défaut : chemin relatif "" -> /api/... proxifié par Next vers le backend (même domaine).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

// Types
interface Intervention {
  id: number;
  date: string;
  timestamp: number;
  nature: string;
  category: string;
  location: string;
  daira: string;
  source: string;
  phone: string;
  details?: string;
}

type SortOption = "recent" | "oldest";

// Normalise un libellé de nature variable vers une des 4 grandes catégories.
function normalizeNature(s: string): string {
  const t = (s || "").toLowerCase();
  if (/(accident|collision|circulation|route|moto|pieton|piéton)/.test(t)) return "Accidents";
  if (/(incendie|feu|explosion)/.test(t)) return "Incendies";
  if (/(secours|malaise|cardiaque|accouchement|asphyxie|bless|medical|médical|personne|noyade)/.test(t)) return "Secours";
  return "Opérations";
}

// Enregistrement renvoyé par /api/history.
interface HistoryRecord {
  id?: string | number;
  timestamp?: string;
  nature?: string;
  commune?: string;
  address?: string;
  source?: string;
  phone?: string;
  transcription?: string;
}

function mapRecord(r: HistoryRecord, i: number): Intervention {
  const ts = r.timestamp ? new Date(String(r.timestamp).replace(" ", "T")).getTime() : Date.now();
  const date = new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const commune = r.commune || "Inconnu";
  return {
    id: Number(r.id ?? i) || i,
    date,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    nature: normalizeNature(r.nature || r.transcription || ""),
    category: r.nature || "—",
    location: r.address ? `${commune} / ${r.address}` : commune,
    daira: commune,
    source: r.source || "Citoyen",
    phone: r.phone || "—",
    details: r.transcription || `Intervention à ${commune}.`,
  };
}

export default function Historique() {
  // Données fictives depuis le backend (historique des appels enregistrés)
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/history`)
      .then((r) => r.json())
      .then((rows: HistoryRecord[]) => {
        if (Array.isArray(rows)) setInterventions(rows.map(mapRecord));
      })
      .catch((e) => console.error("Historique:", e));
  }, []);
  // Global States
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "yesterday" | "week">("all");
  const [sortOrder, setSortOrder] = useState<SortOption>("recent");

  // Specific Filters
  const [filters, setFilters] = useState({
    nature: "",
    source: "",
    daira: "",
    phone: "",
    category: ""
  });

  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);

  // Count active filters (excluding time and search)
  const activeFiltersCount = Object.values(filters).filter(v => v !== "").length;

  // Filter Logic
  const filteredInterventions = useMemo(() => {
    const result = interventions.filter((item) => {
      // 1. Global Search
      const searchStr = `${item.nature} ${item.location} ${item.phone} ${item.source} ${item.category}`.toLowerCase();
      if (searchQuery && !searchStr.includes(searchQuery.toLowerCase())) return false;

      // 2. Additive Logic Filters
      if (filters.nature && item.nature !== filters.nature) return false;
      if (filters.source && item.source !== filters.source) return false;
      if (filters.daira && item.daira !== filters.daira) return false;
      if (filters.phone && !item.phone.includes(filters.phone)) return false;
      if (filters.category && !item.category.includes(filters.category)) return false;

      // 3. Time filter (utilise le timestamp réel, pas le parsing fragile de la date affichée)
      const itemDate = new Date(item.timestamp);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (timeFilter === "today") {
        if (itemDate < today) return false;
      } else if (timeFilter === "yesterday") {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (itemDate < yesterday || itemDate >= today) return false;
      } else if (timeFilter === "week") {
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        if (itemDate < lastWeek) return false;
      }

      return true;
    });

    // 4. Sorting
    return result.sort((a, b) =>
      sortOrder === "recent" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
    );
  }, [interventions, searchQuery, timeFilter, filters, sortOrder]);

  const resetFilters = () => {
    setFilters({ nature: "", source: "", daira: "", phone: "", category: "" });
    setTimeFilter("all");
    setSearchQuery("");
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = ["Date", "Nature", "Catégorie", "Lieu", "Source", "Numéro Appelant"];
    const rows = filteredInterventions.map(item => [item.date, item.nature, item.category, item.location, item.source, item.phone]);
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Rapport_Interventions_DGPC_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  const handlePrint = (item: Intervention) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Fiche DGPC</title><style>body{font-family:sans-serif;padding:40px;color:#1a1c1e}.header{border-bottom:2px solid #ba1a1a;padding-bottom:20px;margin-bottom:30px;text-align:center}.title{color:#ba1a1a;font-size:24px;font-weight:bold}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.label{font-weight:bold;color:#44474e;font-size:12px;text-transform:uppercase}.value{font-size:16px;margin-bottom:15px;border-bottom:1px solid #dee2f1;padding-bottom:5px}</style></head><body><div class="header"><div class="title">DIRECTION GÉNÉRALE DE LA PROTECTION CIVILE</div><div>RAPPORT #${item.id}</div></div><div class="grid"><div><div class="label">Date</div><div class="value">${item.date}</div><div class="label">Nature</div><div class="value">${item.nature}</div></div><div><div class="label">Lieu</div><div class="value">${item.location}</div><div class="label">Source</div><div class="value">${item.source}</div></div></div><p>${item.details}</p><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col gap-[20px] h-full p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-h2 text-[28px] font-bold text-on-surface tracking-tight">Registre des Interventions</h2>
          <p className="text-on-surface-variant text-sm mt-1">Exploration et gestion de l&apos;historique opérationnel</p>
        </div>
        <button onClick={exportToCSV} className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-all font-bold shadow-lg active:scale-95">
          <span className="material-symbols-outlined">download</span> Exporter Rapport
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="p-4 bg-surface-container-lowest rounded-2xl border border-surface-variant flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {/* Time Shortcuts */}
            <div className="flex items-center gap-1 bg-surface-container rounded-full p-1 border border-surface-variant">
              {(["all", "today", "yesterday", "week"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeFilter(t)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${timeFilter === t ? "bg-primary text-on-primary shadow-md" : "text-on-surface-variant hover:bg-surface-variant"}`}
                >
                  {t === "all" ? "Tous" : t === "today" ? "Aujourd'hui" : t === "yesterday" ? "Hier" : "Semaine"}
                </button>
              ))}
            </div>

            {/* Main Filter Toggle */}
            <button
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all font-bold text-sm ${activeFiltersCount > 0 || isFilterMenuOpen ? "bg-primary/10 border-primary text-primary shadow-sm" : "bg-surface border-surface-variant text-on-surface-variant hover:border-primary"}`}
            >
              <span className="material-symbols-outlined text-xl">tune</span>
              Filtrer par
              {activeFiltersCount > 0 && (
                <span className="ml-1 bg-primary text-on-primary w-5 h-5 rounded-full text-[10px] flex items-center justify-center animate-in zoom-in">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button onClick={resetFilters} className="text-xs text-primary font-bold hover:underline px-2">Réinitialiser</button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Sorting */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOption)}
                className="pl-9 pr-8 py-2.5 bg-surface-container-low rounded-xl border border-surface-variant text-xs font-bold text-on-surface appearance-none cursor-pointer hover:border-primary transition-all"
              >
                <option value="recent">Plus récent</option>
                <option value="oldest">Plus ancien</option>
              </select>
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-primary text-sm">swap_vert</span>
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-xl">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-2.5 bg-surface rounded-xl border border-surface-variant text-sm text-on-surface focus:ring-2 focus:ring-primary w-64 placeholder:text-on-surface-variant/50 transition-all"
                placeholder="Recherche globale..."
              />
            </div>
          </div>
        </div>

        {/* Expanded Filters Panel */}
        {isFilterMenuOpen && (
          <div className="p-5 bg-surface-container-low rounded-2xl border border-primary/30 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-primary uppercase ml-1">Nature</label>
              <select
                value={filters.nature}
                onChange={(e) => setFilters({...filters, nature: e.target.value})}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-variant text-sm font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="">Toutes</option>
                <option value="Accidents">Accidents</option>
                <option value="Incendies">Incendies</option>
                <option value="Secours">Secours</option>
                <option value="Opérations">Opérations</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-primary uppercase ml-1">Source</label>
              <select
                value={filters.source}
                onChange={(e) => setFilters({...filters, source: e.target.value})}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-variant text-sm font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="">Toutes</option>
                <option value="Citoyen">Citoyen</option>
                <option value="Police">Police</option>
                <option value="Gendarmerie">Gendarmerie</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-primary uppercase ml-1">Localisation (Daïra)</label>
              <select
                value={filters.daira}
                onChange={(e) => setFilters({...filters, daira: e.target.value})}
                className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-variant text-sm font-medium focus:ring-2 focus:ring-primary"
              >
                <option value="">Toutes</option>
                <option value="Béjaïa">Béjaïa Ville</option>
                <option value="Akbou">Akbou</option>
                <option value="El Kseur">El Kseur</option>
                <option value="Amizour">Amizour</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-primary uppercase ml-1">Sous-Catégorie</label>
              <input
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
                placeholder="Ex: Forêt, Route..."
                className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-variant text-sm font-medium focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-primary uppercase ml-1">N° Appelant</label>
              <input
                value={filters.phone}
                onChange={(e) => setFilters({...filters, phone: e.target.value})}
                placeholder="Ex: 0550..."
                className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-variant text-sm font-medium focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="flex-1 bg-surface-container-lowest rounded-2xl border border-surface-variant flex flex-col overflow-hidden shadow-sm">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-surface-container-low sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Date & Heure</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Nature</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Détails/Catégorie</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Localisation</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Source</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest">Appelant</th>
                <th className="px-6 py-4 border-b border-surface-variant font-bold text-[10px] text-on-surface-variant uppercase tracking-widest text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant/50 bg-surface-container-lowest text-[13px]">
              {filteredInterventions.length > 0 ? (
                filteredInterventions.map((item) => (
                  <tr key={item.id} className="hover:bg-primary/[0.03] transition-colors group">
                    <td className="px-6 py-4 font-mono text-on-surface-variant">{item.date}</td>
                    <td className="px-6 py-4 font-bold text-on-surface">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.nature === "Incendies" ? "bg-error" : item.nature === "Accidents" ? "bg-warning" : "bg-primary"}`}></span>
                        {item.nature}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-on-surface-variant">{item.category}</td>
                    <td className="px-6 py-4 text-on-surface font-medium">{item.location}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-surface-container-high rounded-md text-[11px] font-bold text-on-surface-variant">{item.source}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-primary font-bold">{item.phone}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setSelectedIntervention(item)} className="p-1.5 hover:bg-primary/10 rounded-lg text-primary transition-colors" title="Détails">
                          <span className="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                        <button onClick={() => handlePrint(item)} className="p-1.5 hover:bg-secondary/10 rounded-lg text-secondary transition-colors" title="Imprimer">
                          <span className="material-symbols-outlined text-[20px]">print</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-32 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-5xl opacity-20">search_off</span>
                      <p className="text-lg font-medium opacity-50">Aucune intervention ne correspond à votre recherche.</p>
                      <button onClick={resetFilters} className="mt-2 text-primary font-bold hover:underline">Réinitialiser tous les filtres</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-variant bg-surface-container flex items-center justify-between shrink-0">
          <p className="text-xs text-on-surface-variant font-medium">
            Affichage de <span className="text-on-surface font-bold">{filteredInterventions.length}</span> sur <span className="text-on-surface font-bold">{interventions.length}</span> interventions
          </p>
        </div>
      </div>

      {/* Modal */}
      {selectedIntervention && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-surface-container-lowest w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-surface-variant animate-in zoom-in-95">
            <div className="px-8 py-6 bg-primary text-on-primary flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Fiche d&apos;Intervention</h3>
                <p className="text-xs opacity-70">ID: DGPC-2024-{selectedIntervention.id.toString().padStart(4, '0')}</p>
              </div>
              <button onClick={() => setSelectedIntervention(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-primary uppercase">Date & Heure</p>
                  <p className="text-base font-semibold">{selectedIntervention.date}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary uppercase">Nature</p>
                  <p className="text-base font-semibold">{selectedIntervention.nature}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary uppercase">Localisation</p>
                  <p className="text-base font-semibold">{selectedIntervention.location}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-primary uppercase">N° Appelant</p>
                  <p className="text-base font-bold text-primary">{selectedIntervention.phone}</p>
                </div>
              </div>
              <div className="pt-6 border-t border-surface-variant">
                <p className="text-[10px] font-bold text-primary uppercase mb-2">Compte-rendu</p>
                <p className="text-sm text-on-surface leading-relaxed italic bg-surface-container-low p-4 rounded-xl">&quot;{selectedIntervention.details}&quot;</p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setSelectedIntervention(null)} className="px-5 py-2 rounded-xl border border-surface-variant font-bold text-sm">Fermer</button>
                <button onClick={() => handlePrint(selectedIntervention)} className="px-5 py-2 rounded-xl bg-secondary-container text-on-secondary-container font-bold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">print</span> Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
