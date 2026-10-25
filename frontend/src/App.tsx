"use client";

import { useState } from "react";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { SourcesPage } from "./components/SourcesPage";
import { NotesPage } from "./components/NotesPage";
import { SectionsPage } from "./components/SectionsPage";
import { MatrixPage } from "./components/MatrixPage";
import { SettingsPage } from "./components/SettingsPage";

export const DashboardPage = () => (
  <div className="p-6">
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

    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4">Acciones rápidas</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          className="flex items-center gap-3 px-4 py-3 border border-input rounded-lg text-left hover:bg-muted/50 transition-colors"
        >
          <BookOpen className="w-5 h-5 text-primary mr-3" />
          <div>
            <div className="font-medium text-sm">Nueva fuente</div>
            <div className="text-xs text-muted-foreground">Agregar referencia bibliográfica</div>
          </div>
        </button>
        <button
          className="flex items-center gap-3 px-4 py-3 border border-input rounded-lg text-left hover:bg-muted/50 transition-colors"
        >
          <FileText className="w-5 h-5 text-primary mr-3" />
          <div>
            <div className="font-medium text-sm">Nueva nota</div>
            <div className="text-xs text-muted-foreground">Crear nota atómica</div>
          </div>
        </button>
        <button
          className="flex items-center gap-3 px-4 py-3 border border-input rounded-lg text-left hover:bg-muted/50 transition-colors"
        >
          <LayoutDashboard className="w-5 h-5 text-primary mr-3" />
          <div>
            <div className="font-medium text-sm">Nuevo capítulo</div>
            <div className="text-xs text-muted-foreground">Estructurar tesis</div>
          </div>
        </button>
      </div>
    </div>
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
              {page === "dashboard"
                ? "Dashboard"
                : page.charAt(0).toUpperCase() + page.slice(1)}
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
          {page === "dashboard" && <DashboardPage />}
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
