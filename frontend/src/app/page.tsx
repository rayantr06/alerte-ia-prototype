"use client";

import Image from "next/image";

import { useRouter } from "next/navigation";
import { useTeam } from "@/context/TeamContext";

export default function Home() {
  const router = useRouter();
  const { team, setTeam } = useTeam();

  const handleAccess = () => {
    if (team) {
      router.push("/appels");
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden h-full">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -right-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-3xl"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-3xl"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-30"></div>
      </div>

      <div className="max-w-4xl w-full relative z-10 flex flex-col items-center">
        {/* Team Selection */}
        <div className="mb-12 text-center w-full">
          <h3 className="font-h3 text-h3 text-on-surface mb-6 font-medium text-[20px]">
            S&eacute;lection de l&apos;&eacute;quipe
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            {["A", "B", "C"].map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t as "A" | "B" | "C")}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium shadow-sm transition-all ${
                  team === t
                    ? "bg-[#D32F2F] text-white border border-[#D32F2F] ring-2 ring-[#D32F2F]/20"
                    : "bg-white border border-slate-200 text-on-surface-variant hover:bg-slate-50"
                }`}
              >
                <span className={`material-symbols-outlined ${team === t ? "fill" : ""}`}>person</span>
                <span>&Eacute;quipe {t}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Hero Content */}
        <div className="text-center flex flex-col items-center">
          <div className="w-24 h-24 bg-white rounded-full shadow-md border-4 border-white flex items-center justify-center mb-8 overflow-hidden">
            <Image width={64} height={64}
              alt="Alerte IA — prototype"
              className="w-full h-full object-cover"
              src="/prototype-mark.svg"
            />
          </div>
          <h1 className="font-h1 text-[32px] font-bold text-on-surface mb-6 tracking-tight">
            Alerte IA — prototype de recherche
          </h1>
          <p className="font-body-lg text-[16px] text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
            Explorez le parcours opérateur, les fiches d&apos;incident, l&apos;historique
            et les statistiques à partir de scénarios entièrement fictifs.
          </p>

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleAccess}
              disabled={!team}
              className={`font-body-lg font-medium px-10 py-4 rounded-xl flex items-center gap-3 transition-all transform shadow-lg ${
                team
                  ? "bg-[#D32F2F] hover:bg-[#B71C1C] text-white hover:scale-[1.02] active:scale-95 shadow-red-900/20 cursor-pointer"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed grayscale"
              }`}
            >
              <span className="material-symbols-outlined">login</span>
              Acc&eacute;der au syst&egrave;me de contr&ocirc;le
            </button>
            {!team && (
              <p className="text-red-500 text-sm font-medium animate-pulse">
                Veuillez s&eacute;lectionner une &eacute;quipe pour continuer
              </p>
            )}
          </div>

          {/* Security Status */}
          <div className="mt-12 flex flex-col items-center gap-2">
            <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
                <span className="material-symbols-outlined text-[24px]">
                  security
                </span>
              </div>
              <div className="text-left">
                <h4 className="font-label-caps text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  MODE DE DÉMONSTRATION
                </h4>
                <p className="font-data-mono text-[16px] font-bold text-on-surface">
                  Scénarios fictifs · usage local
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
