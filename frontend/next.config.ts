import type { NextConfig } from "next";

// Le frontend appelle l'API en chemin RELATIF (/api/...) ; Next la proxifie vers le backend local.
// => même domaine que le frontend : un seul tunnel suffit, et aucun problème de CORS.
const API_TARGET = process.env.DGPC_API_TARGET || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
    ];
  },
};

export default nextConfig;
