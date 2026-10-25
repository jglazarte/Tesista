import { useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  Quote,
  ShieldAlert,
  Tags,
  Link2,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { SourcesPage } from "./components/SourcesPage";
import { NotesPage } from "./components/NotesPage";
import { SectionsPage } from "./components/SectionsPage";
import { MatrixPage } from "./components/MatrixPage";
import { SettingsPage } from "./components/SettingsPage";
import { statsApi, Stats } from "./api";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  sources: "Biblioteca",
  notes: "Notas Atómicas",
  sections: "Capítulos",
  matrix: "Matriz de Síntesis",
  settings: "Configuración",
};

const DashboardPage = ({
  onNavigate,
  onQuickCreate,
}: {
  onNavigate: (page: string) => void;
  onQuickCreate: (page: string) => void;
}) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    statsApi
      .get()
      .then(setStats)
      .catch((err) => setError(err?.message || "No se pudieron cargar las estadísticas."));
  }, []);

  const cards = [
    { page: "sources", label: "Fuentes", value: stats?.sources, hint: "Referencias bibliográficas", icon: BookOpen },
    { page: "sources", label: "Citas", value: stats?.excerpts, hint: "Fragmentos textuales", icon: Quote },
    { page: "notes", label: "Notas", value: stats?.notes, hint: "Pensamiento interconectado", icon: FileText },
    { page: "sections", label: "Secciones", value: stats?.sections, hint: "Estructura de la tesis", icon: LayoutDashboard },
    { page: "matrix", label: "Etiquetas", value: stats?.tags, hint: "Conceptos y metodologías", icon: Tags },
    { page: "notes", label: "Enlaces", value: stats?.links, hint: "Wikilinks y menciones", icon: Link2 },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Tu tesis, en un solo lugar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fuentes, citas, notas y capítulos guardados localmente. Todo se gestiona desde esta interfaz.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.page)}
              className="rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/60"
            >
              <Icon className="mb-3 h-4 w-4 text-muted-foreground" />
              <div className="text-2xl font-bold tabular-nums">
                {card.value === undefined ? "—" : card.value}
              </div>
              <div className="text-sm font-medium">{card.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{card.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Acciones rápidas</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onQuickCreate("sources")}
            className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <BookOpen className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Nueva fuente</div>
              <div className="text-xs text-muted-foreground">Agregar referencia o importar por DOI</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onQuickCreate("notes")}
            className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <FileText className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Nueva nota</div>
              <div className="text-xs text-muted-foreground">Crear una nota atómica con etiquetas</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onQuickCreate("sections")}
            className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <LayoutDashboard className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Nuevo capítulo</div>
              <div className="text-xs text-muted-foreground">Estructurar partes y secciones</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("matrix")}
            className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
          >
            <ShieldAlert className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">Ver matriz</div>
              <div className="text-xs text-muted-foreground">Cruzar fuentes y conceptos</div>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-10 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Sintaxis rápida</p>
        <ul className="mt-2 space-y-1">
          <li><code className="font-mono text-xs">[[Título de nota]]</code> — enlace entre notas.</li>
          <li><code className="font-mono text-xs">@citekey</code> — cita una fuente.</li>
          <li><code className="font-mono text-xs">!@citekey#p. 45</code> — inserta el texto de una cita.</li>
        </ul>
      </div>
    </div>
  );
};

export function App() {
  const [page, setPage] = useState("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [newSignal, setNewSignal] = useState<{ page: string; n: number }>({
    page: "",
    n: 0,
  });

  // Aplica el tema guardado antes de renderizar el resto de la interfaz.
  useEffect(() => {
    const theme = window.localStorage.getItem("tesista:theme");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);

  const navigate = (target: string) => setPage(target);

  const quickCreate = (target: string) => {
    setPage(target);
    setNewSignal((prev) => ({ page: target, n: prev.n + 1 }));
  };

  const signalFor = (target: string) =>
    newSignal.page === target ? newSignal.n : 0;

  return (
    <div className="flex h-full min-h-0 bg-background">
      <Sidebar activePage={page} onPageChange={navigate} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-6">
          <h1 className="text-xl font-bold tracking-tight">
            {PAGE_TITLES[page] ?? "Tesista"}
          </h1>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="Volver a cargar los datos de esta página"
          >
            Recargar
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <div key={`${page}-${refreshKey}`} className="h-full">
            {page === "dashboard" && (
              <DashboardPage onNavigate={navigate} onQuickCreate={quickCreate} />
            )}
            {page === "sources" && <SourcesPage newSignal={signalFor("sources")} />}
            {page === "notes" && <NotesPage newSignal={signalFor("notes")} />}
            {page === "sections" && <SectionsPage newSignal={signalFor("sections")} />}
            {page === "matrix" && <MatrixPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
