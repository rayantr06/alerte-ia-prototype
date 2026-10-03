import type { Metadata } from "next";
import { Inter, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopAppBar from "@/components/TopAppBar";
import { TeamProvider } from "@/context/TeamContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const roboto = Roboto({ weight: ["400", "500", "700", "900"], subsets: ["latin"], variable: "--font-roboto" });
const robotoMono = Roboto_Mono({ subsets: ["latin"], variable: "--font-roboto-mono" });

export const metadata: Metadata = {
  title: "Alerte IA — prototype public",
  description: "Prototype collaboratif avec scénarios fictifs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${roboto.variable} ${robotoMono.variable}`}>
      <head>
        {/* Shared App Router root layout: this icon font applies to every route. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-background text-on-surface flex overflow-hidden w-screen h-screen">
        <TeamProvider>
          <Sidebar />
          <div className="flex-1 h-full flex flex-col overflow-hidden">
            <TopAppBar />
            <div className="shrink-0 bg-blue-50 text-blue-900 px-5 py-2 text-xs font-semibold" role="note">Prototype de recherche · Données fictives · Aucun transfert réel · Modèles IA optionnels</div>
            <main className="p-5 flex-1 overflow-hidden flex flex-col relative">
              {children}
            </main>
          </div>
        </TeamProvider>
      </body>
    </html>
  );
}
