"use client";

import React, { useState, useEffect, useCallback } from "react";

// Par défaut : chemin relatif "" -> /api/... proxifié par Next vers le backend (même domaine).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Couleurs des 4 natures pour le donut multi-segments.
const CAT_COLORS: Record<string, string> = {
  accidents: "#D92721", incendies: "#FDB913", secours: "#0061a4", divers: "#94A3B8",
};
const CAT_LABELS: Record<string, string> = {
  accidents: "Accidents", incendies: "Incendies", secours: "Secours", divers: "Divers",
};

// Types renvoyés par /api/stats
interface StatItem {
  labelFr: string;
  labelAr: string;
  count: number;
  value: number; // pourcentage dans la catégorie
}
interface Category {
  title: string;
  icon: string;
  color: string;
  total: number;
  items: StatItem[];
}
interface StatsResponse {
  total: number;
  victims: number;
  avg_per_day: number;
  categories: Record<string, Category>;
  category_order: string[];
  coverage: { years: number[]; months: number[]; from?: string; to?: string };
  synthetic_dates: boolean;
}

export default function Dashboard() {
  const [year, setYear] = useState("Toutes");
  const [month, setMonth] = useState("Tous");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState("accidents");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestStats = useCallback(async () => {
      const params = new URLSearchParams();
      if (year !== "Toutes") params.set("year", year);
      if (month !== "Tous") params.set("month", month);
      const res = await fetch(`${API_BASE}/api/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Backend indisponible");
      return await res.json() as StatsResponse;
  }, [year, month]);

  const fetchStats = () => requestStats().then(setStats)
    .catch(() => setError("Impossible de charger les statistiques (backend hors ligne ?)."))
    .finally(() => setLoading(false));

  useEffect(() => {
    let cancelled = false;
    requestStats()
      .then(data => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setError("Impossible de charger les statistiques (backend hors ligne ?)."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestStats]);

  const order = stats?.category_order ?? ["accidents", "incendies", "secours", "divers"];
  const currentStats = stats?.categories?.[activeCategory];
  const total = stats?.total ?? 0;
  const activeTotal = currentStats?.total ?? 0;

  return (
    <div className="h-full overflow-hidden flex flex-col gap-4 p-5 bg-[#F8F9FA] font-sans selection:bg-primary/20">
      {/* 1. Header & Global Filters */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-end md:justify-between gap-3 border-b-2 border-[#D92721]/10 pb-3">
        <div>
          <h2 className="text-[28px] font-black text-[#D92721] tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-[32px]">dashboard</span>
            CENTRE DE COMMANDEMENT DGPC
          </h2>
          <p className="text-muted text-sm font-medium flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-[#D92721] animate-pulse"></span>
            {total} SCÉNARIOS FICTIFS • DÉMONSTRATION
            {stats?.coverage?.from && (
              <span className="text-[11px] text-slate-400 normal-case font-bold ml-1">
                ({stats.coverage.from} → {stats.coverage.to})
              </span>
            )}
          </p>
        </div>

        {/* Control Bar (filtres réels année / mois) */}
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-2xl shadow-lg border border-[#D92721]/20 self-start md:self-auto">
          <div className="flex items-center gap-2 px-3 border-r border-slate-100">
            <span className="material-symbols-outlined text-sm text-[#D92721]">calendar_today</span>
            <select
              value={year} onChange={(e) => { setLoading(true); setError(""); setYear(e.target.value); }}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer"
            >
              <option value="Toutes">Toutes années</option>
              {(stats?.coverage?.years ?? [2026]).map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3">
            <select
              value={month} onChange={(e) => { setLoading(true); setError(""); setMonth(e.target.value); }}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer"
            >
              <option value="Tous">Tous les mois</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setLoading(true); setError(""); fetchStats(); }}
            className="px-2 text-[#D92721] hover:rotate-180 transition-transform duration-500"
            title="Rafraîchir"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="shrink-0 bg-orange-50 border border-orange-200 text-orange-800 text-sm font-bold rounded-xl px-4 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">warning</span> {error}
        </div>
      )}

      {/* 2. Nature Navigation Cards (totaux réels) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {order.map((key) => {
          const cat = stats?.categories?.[key];
          const isActive = activeCategory === key;
          const catTotal = cat?.total ?? 0;
          const pct = total ? (catTotal / total) * 100 : 0;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`relative group p-4 rounded-3xl border-2 transition-all duration-300 text-left shadow-sm ${
                isActive
                  ? "bg-white border-[#D92721] shadow-[#D92721]/10"
                  : "bg-white/80 border-transparent hover:border-[#FDB913]/50 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2.5 rounded-2xl transition-colors ${isActive ? "bg-[#D92721] text-white shadow-lg shadow-[#D92721]/30" : "bg-slate-100 text-slate-400 group-hover:bg-[#FDB913] group-hover:text-white"}`}>
                  <span className="material-symbols-outlined text-[26px]">{cat?.icon ?? "category"}</span>
                </div>
                <div className={`text-xl font-black ${isActive ? "text-[#D92721]" : "text-slate-300"}`}>
                  {loading ? "…" : catTotal.toLocaleString()}
                </div>
              </div>
              <div>
                <h4 className={`text-[13px] font-black uppercase tracking-tight ${isActive ? "text-[#D92721]" : "text-slate-500"}`}>
                  {cat?.title ?? key}
                </h4>
                <div className="flex items-center gap-1 mt-1">
                  <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                         style={{ width: `${pct}%`, backgroundColor: isActive ? "#D92721" : "#FDB913" }}></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{pct.toFixed(0)}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. Main Operational View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-4 min-h-0">
        {/* Left: Volume & Global Metrics */}
        <div className="min-h-0">
          <div className="h-full bg-white rounded-[32px] px-6 py-5 border-2 border-[#D92721]/5 shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0">
              <h3 className="text-sm font-black text-[#D92721] uppercase tracking-widest">Volume Global</h3>
              <p className="text-[10px] font-bold text-muted uppercase">Wilaya de Béjaïa</p>
            </div>

            <div className="relative w-36 h-36 flex items-center justify-center mx-auto my-1 shrink-0">
              <svg className="w-full h-full -rotate-90 drop-shadow-2xl" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="transparent" stroke="#F1F3F5" strokeWidth="10" />
                {(() => {
                  const C = 264;

                  return order.map((key, index) => {
                    const off = total ? order.slice(0, index).reduce((sum, k) => sum + (stats?.categories?.[k]?.total ?? 0), 0) / total * C : 0;
                    const share = total ? (stats?.categories?.[key]?.total ?? 0) / total : 0;
                    const len = share * C;
                    const el = (
                      <circle key={key} cx="50" cy="50" r="42" fill="transparent"
                        stroke={CAT_COLORS[key] ?? "#94A3B8"} strokeWidth="10"
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
                        className="transition-all duration-700" />
                    );
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <div className={`text-3xl font-black text-[#D92721] tracking-tighter transition-all ${loading ? "scale-95 opacity-50" : "scale-100"}`}>
                  {total.toLocaleString()}
                </div>
                <div className="text-[11px] font-bold text-muted uppercase tracking-widest mt-1">Interventions</div>
              </div>
            </div>

            {/* Légende du donut */}
            <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1.5 shrink-0">
              {order.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[key] }}></span>
                  <span className="text-[11px] font-bold text-slate-600 truncate">{CAT_LABELS[key] ?? key}</span>
                  <span className="text-[11px] font-black text-slate-400 ml-auto">{stats?.categories?.[key]?.total ?? 0}</span>
                </div>
              ))}
            </div>

            <div className="w-full mt-auto pt-2 grid grid-cols-2 gap-2 shrink-0">
              <div className="bg-[#D92721]/5 p-3 rounded-2xl border border-[#D92721]/10 text-center">
                <div className="text-[10px] font-black text-[#D92721] uppercase">Victimes</div>
                <div className="text-xl font-black text-[#D92721]">{loading ? "…" : (stats?.victims ?? 0)}</div>
              </div>
              <div className="bg-[#FDB913]/5 p-3 rounded-2xl border border-[#FDB913]/10 text-center">
                <div className="text-[10px] font-black text-[#FDB913] uppercase">Moyenne/J</div>
                <div className="text-xl font-black text-[#FDB913]">{loading ? "…" : (stats?.avg_per_day ?? 0)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Detailed Classification (sous-natures réelles) */}
        <div className="min-h-0 bg-white rounded-[32px] border-2 border-[#D92721]/5 shadow-xl flex flex-col overflow-hidden">
          <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-white to-slate-50 shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-3xl flex items-center justify-center shadow-xl text-white shrink-0" style={{ backgroundColor: "#D92721" }}>
                <span className="material-symbols-outlined text-[28px]">{currentStats?.icon ?? "category"}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-xl xl:text-2xl font-black text-[#D92721] tracking-tight uppercase truncate">{currentStats?.title ?? "—"}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-[#FDB913] text-white text-[10px] font-black rounded-full uppercase">Données fictives</span>
                  <p className="text-[11px] text-muted font-bold uppercase tracking-widest">RÉPARTITION SOUS-NATURE</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-[#D92721] tracking-tighter">{loading ? "…" : activeTotal.toLocaleString()}</div>
              <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Volume Période</div>
            </div>
          </div>

          <div className="flex-1 px-7 py-5 overflow-hidden min-h-0">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400 font-bold">Chargement des données fictives…</div>
            ) : !currentStats || currentStats.items.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 font-bold text-center">
                Aucune intervention pour cette catégorie sur la période sélectionnée.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {currentStats.items.map((item, idx) => (
                  <div key={idx} className="group rounded-3xl border border-slate-100 bg-slate-50/60 p-4 animate-in slide-in-from-right duration-500" style={{ animationDelay: `${idx * 80}ms` }}>
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div className="flex flex-col min-w-0">
                        <span className="text-base font-black text-[#1A1C1E] group-hover:text-[#D92721] transition-colors truncate">
                          {item.labelFr}
                        </span>
                        {item.labelAr && (
                          <span className="text-sm font-bold text-muted opacity-50 truncate" dir="rtl">{item.labelAr}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-slate-400">{item.count} cas</span>
                        <span className="text-xl font-black text-[#D92721]">{item.value}%</span>
                      </div>
                    </div>
                    <div className="h-5 w-full bg-white rounded-2xl overflow-hidden shadow-inner border border-slate-200/60 p-1">
                      <div
                        className="h-full rounded-xl transition-all duration-1000 ease-out"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: idx % 2 === 0 ? "#D92721" : "#FDB913",
                          boxShadow: `0 4px 15px ${idx % 2 === 0 ? "#D92721" : "#FDB913"}40`,
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-7 py-4 bg-[#D92721] text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
              <span className="text-[11px] font-black uppercase tracking-widest">
                Données fictives ({total} appels){stats?.synthetic_dates ? " — données et dates fictives" : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
