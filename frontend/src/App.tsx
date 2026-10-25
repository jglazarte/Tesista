"use client";

import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { SourcesPage } from "./components/SourcesPage";
import { NotesPage } from "./components/NotesPage";

export const SectionsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Estructura de Capítulos</h1>
    <p className="text-muted-foreground mt-2">
      Gestión jerárquica de partes, capítulos, secciones y subsecciones.
    </p>
  </div>
);

export const MatrixPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Matriz de Síntesis</h1>
    <p className="text-muted-foreground mt-2">
      Cruzamiento de fuentes contra conceptos y variables.
    </p>
  </div>
);

export const SettingsPage = () => (
  <div className="p-6">
    <h1 className="text-2xl font-bold">Configuración</h1>
    <p className="text-muted-foreground mt-2">
      Opciones de la aplicación y conexión al servidor.
    </p>
  </div>
);

export function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activePage={page} onPageChange={setPage} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-background/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">
              {page === "dashboard" ? "Dashboard" : page.charAt(0).toUpperCase() + page.slice(1)}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors"
              onClick={() => window.location.reload()}
            >
              Refrescar
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {page === "dashboard" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Fuentes</h3>
                <p className="text-muted-foreground text-sm">Gestión de referencias bibliográficas</p>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Notas Atómicas</h3>
                <p className="text-muted-foreground text-sm">Pensamiento interconectado con wikilinks</p>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Capítulos</h3>
                <p className="text-muted-foreground text-sm">Estructura jerárquica de la tesis</p>
              </div>
              <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Matriz</h3>
                <p className="text-muted-foreground text-sm">Cruce de datos para síntesis</p>
              </div>
            </div>
          )}
          {page === "sources" && <SourcesPage />}
          {page === "notes" && <NotesPage />}
          {page === "sections" && <SectionsPage />}
          {page === "matrix" && <MatrixPage />}
          {page === "settings" && <SettingsPage />}
        </div>
      </div>
    </div>
  );
}
