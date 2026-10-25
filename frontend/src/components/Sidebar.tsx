import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  SquareKanban,
  ShieldAlert,
  Settings,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sources", label: "Biblioteca", icon: BookOpen },
  { id: "notes", label: "Notas Atómicas", icon: FileText },
  { id: "sections", label: "Capítulos", icon: SquareKanban },
  { id: "matrix", label: "Matriz de Síntesis", icon: ShieldAlert },
  { id: "settings", label: "Configuración", icon: Settings },
];

export const Sidebar = ({
  activePage,
  onPageChange,
}: {
  activePage: string;
  onPageChange: (page: string) => void;
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-card text-foreground transition-[width] duration-200 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {!collapsed && <h1 className="text-lg font-bold tracking-tight">Tesista</h1>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-2">
        {PAGES.map((page) => {
          const Icon = page.icon;
          const active = activePage === page.id;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => onPageChange(page.id)}
              title={page.label}
              className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              } ${collapsed ? "justify-center px-0" : ""}`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${collapsed ? "" : "mr-3"}`} />
              {!collapsed && <span className="truncate">{page.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3 text-xs text-muted-foreground">
        {collapsed ? "v1" : "Datos locales · SQLite"}
      </div>
    </aside>
  );
};
