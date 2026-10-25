"use client";

import { useState } from "react";

const ShieldCheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.307A5.5 5.5 0 0017.48 18.36c-.173.33-.336.638-.488.935L16.384 21.5a1 1 0 001.618-.148l.564-1.247a2 2 0 00-.142-1.826L13.4 15.48a2 2 0 01-.732-1.329L11.2 12.862a1 1 0 00-1.416 0L8.48 12.677a2 2 0 01-2.828 0L4.968 14.522A2 2 0 012.132 13.2c.273-.626.436-1.273.499-1.915C2.59 9.69 4.01 7.5 5.643 7.5c1.617 0 3.016 1.304 3.574 2.774c.249.753.362 1.333.402 1.827q.003.072.005.144c0 .073.005.147.006.22z" />
  </svg>
);
const DatabaseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-4V7M4 7c0-2.21 3.582-4 8-4s8-4V7" />
  </svg>
);
const SaveIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);
const GitBranchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const SettingsPage = () => {
  const [tab, setTab] = useState("general");

  const tabs = [
    { id: "general", label: "General", icon: ShieldCheckIcon },
    { id: "database", label: "Base de Datos", icon: DatabaseIcon },
    { id: "backup", label: "Respaldos", icon: SaveIcon },
    { id: "git", label: "Git", icon: GitBranchIcon },
  ];

  return (
    <div className="h-full flex flex-col">
      <header className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
        <h1 className="text-xl font-bold">Configuración</h1>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-border bg-muted/50 flex flex-col">
          <nav className="p-4 space-y-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-3 px-4 py-3 text-sm rounded-md transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "general" && (
            <div className="max-w-lg space-y-6">
              <h2 className="text-lg font-bold mb-2">General</h2>
              <p className="text-muted-foreground text-sm mb-4">Configuración general de la aplicación</p>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary" />
                    <span>Modo oscuro</span>
                  </label>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary" />
                    <span>Auto-guardar notas</span>
                  </label>
                </div>
              </div>
            </div>
          )}
          {tab === "database" && (
            <div className="max-w-lg space-y-6">
              <h2 className="text-lg font-bold mb-2">Base de Datos</h2>
              <p className="text-muted-foreground text-sm mb-4">Gestión de la base de datos SQLite local</p>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Estado</span>
                    <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">Conectada</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Ubicación:</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">data/tesista.db</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50">
                  <span className="text-sm font-medium">Compactar base de datos</span>
                  <button className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-md">
                    Compactar
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === "backup" && (
            <div className="max-w-lg space-y-6">
              <h2 className="text-lg font-bold mb-2">Respaldos</h2>
              <p className="text-muted-foreground text-sm mb-4">Crea respaldos completos de tu base de datos y notas</p>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="rounded text-primary" />
                    <span>Respaldos automáticos semanales</span>
                  </label>
                </div>
                <div className="pt-4">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    <SaveIcon className="w-4 h-4" />
                    Crear respaldo ahora
                  </button>
                </div>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <h4 className="text-sm font-semibold text-blue-700 mb-2">¿Qué incluye el respaldo?</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>Base de datos SQLite completa</li>
                    <li>Exportación JSON de todas las tablas</li>
                    <li>Notas en formato Markdown plano</li>
                    <li>Manifiesto con metadatos del respaldo</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          {tab === "git" && (
            <div className="max-w-lg space-y-6">
              <h2 className="text-lg font-bold mb-2">Control de Versiones (Git)</h2>
              <p className="text-muted-foreground text-sm mb-4">Integra tu trabajo con Git para control de versiones</p>
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Estado del repositorio</span>
                    <span className="text-xs font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">No inicializado</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Ruta:</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">/home/guille/Proyectos/Tesista</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border/50">
                  <span className="text-sm font-medium">Inicializar Git</span>
                  <button className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-md">
                    Inicializar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
