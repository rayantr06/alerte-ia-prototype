"use client";

import Image from "next/image";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useTeam } from "@/context/TeamContext";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { team, setTeam } = useTeam();

  const navItems = [
    { name: "Accueil", href: "/", icon: "home" },
    { name: "Gestion des Appels", href: "/appels", icon: "call" },
    { name: "Historique", href: "/historique", icon: "history" },
    { name: "Tableau de Bord", href: "/dashboard", icon: "dashboard" },
    { name: "Explorateur IA", href: "/ia", icon: "psychology" },
  ];

  return (
    <nav className="w-[72px] lg:w-[20%] lg:min-w-[250px] h-full bg-[#121212] flex flex-col shrink-0 z-50">
      <div className="px-4 lg:px-6 py-6 flex items-center justify-center lg:justify-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0 overflow-hidden bg-white">
          <Image width={64} height={64}
            alt="Alerte IA — prototype"
            className="w-full h-full object-cover"
            src="/prototype-mark.svg"
          />
        </div>
        <div className="hidden lg:block">
          <h1 className="text-white font-['Roboto'] font-black tracking-wide text-[16px] leading-tight">
            Alerte IA
          </h1>
          <p className="font-['Inter'] text-[10px] uppercase tracking-wider font-bold text-slate-400">
            Prototype de recherche
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.name}
              className={`mx-2 lg:mx-4 my-1 flex items-center justify-center lg:justify-start gap-3 p-3 rounded-xl font-['Inter'] text-sm font-medium transition-all ${isActive
                  ? "bg-[#D32F2F] text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <span
                className={`material-symbols-outlined ${isActive ? "fill" : ""}`}
              >
                {item.icon}
              </span>
              <span className="hidden lg:inline">{item.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto px-4 pb-4 space-y-4">
        <div className="hidden lg:block p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${team ? 'bg-emerald-500/20' : 'bg-slate-500/20'}`}>
              <span className={`material-symbols-outlined text-sm ${team ? 'text-emerald-500' : 'text-slate-500'}`}>
                {team ? 'group' : 'person_off'}
              </span>
            </div>
            <div>
              <p className="text-white font-medium text-sm">
                {team ? `Équipe ${team}` : "Aucune équipe"}
              </p>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${team ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
                <span className="text-slate-400 text-[11px] font-medium uppercase tracking-wider">
                  {team ? 'Actif' : 'Inactif'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${team ? 'bg-emerald-500' : 'bg-slate-500'}`}></div>
            <span className="text-slate-400 font-data-mono text-[11px]">
              Système: {team ? 'Opérationnel' : 'En attente'}
            </span>
          </div>
        </div>

        <button
          onClick={() => { setTeam(null); router.push("/"); }}
          title="Déconnexion"
          className="w-full flex items-center justify-center lg:justify-start gap-3 p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-['Inter'] text-sm font-medium"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="hidden lg:inline">Déconnexion</span>
        </button>
      </div>
    </nav>
  );
}
