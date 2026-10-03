"use client";

import Image from "next/image";

import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

export default function TopAppBar() {
  const pathname = usePathname();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getTitle = () => {
    switch (pathname) {
      case "/": return "Accueil";
      case "/appels": return "Gestion des Appels";
      case "/historique": return "Registre des Interventions";
      case "/dashboard": return "Tableau de Bord";
      case "/ia": return "Explorateur IA";
      default: return "Protection Civile";
    }
  };

  return (
    <header className="bg-white h-16 border-b border-slate-200 px-6 flex items-center justify-between z-40 shrink-0 relative">
      <div className="flex items-center gap-4">
        {pathname !== "/" && (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 lg:hidden">
            <Image width={64} height={64} alt="Logo" className="w-full h-full object-cover rounded-full" src="/prototype-mark.svg" />
          </div>
        )}
        <h2 className="font-h2 text-[24px] font-semibold text-on-surface">
          {getTitle()}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications Dropdown */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowSettings(false); }}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${showNotifications ? 'bg-slate-100 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <span className="material-symbols-outlined">notifications</span>
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></div>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Notifications</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {[
                  { icon: 'call', text: 'Nouvel appel entrant', time: 'À l\'instant', color: 'text-red-500' },
                  { icon: 'system_update_alt', text: 'Mise à jour système effectuée', time: 'Il y a 5 min', color: 'text-blue-500' },
                  { icon: 'emergency', text: 'Ambulance disponible', time: 'Il y a 12 min', color: 'text-green-500' }
                ].map((notif, i) => (
                  <div key={i} className="p-4 hover:bg-slate-50 cursor-pointer border-b border-slate-50 flex gap-3 transition-colors">
                    <span className={`material-symbols-outlined ${notif.color}`}>{notif.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{notif.text}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{notif.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings Dropdown */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowNotifications(false); }}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${showSettings ? 'bg-slate-100 text-primary' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <span className="material-symbols-outlined">settings</span>
          </button>

          {showSettings && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">Paramètres</h3>
              </div>
              <div className="p-4 space-y-5">
                {/* Profile */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Profil Opérateur</label>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <Image width={64} height={64} src="/prototype-mark.svg" className="w-10 h-10 rounded-full border border-white shadow-sm" alt="Profile" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Opérateur de démo</p>
                      <p className="text-[11px] text-slate-500">ID: DEMO</p>
                    </div>
                  </div>
                </div>

                {/* Language */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Langue du Système</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-lg text-sm p-2 outline-none focus:ring-2 focus:ring-primary/20">
                    <option>Français</option>
                    <option>العربية (Arabe)</option>
                    <option>Taqbaylit (Kabyle)</option>
                  </select>
                </div>

                {/* Backend URL */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">URL Backend API</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:8000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg text-[12px] p-2 font-mono outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <button className="w-full py-2.5 bg-[#D32F2F] text-white text-sm font-bold rounded-lg hover:bg-[#B71C1C] transition-colors shadow-md">
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ml-2 w-8 h-8 rounded-full overflow-hidden border border-slate-200 cursor-pointer">
          <Image width={64} height={64} alt="User" className="w-full h-full object-cover" src="/prototype-mark.svg" />
        </div>
      </div>
    </header>
  );
}
