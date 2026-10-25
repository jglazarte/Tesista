import { useState } from "react";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  SquareKanban,
  ShieldAlert,
  Settings,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";

export const Sidebar = ({ activePage, onPageChange }: { activePage: string; onPageChange: (page: string) => void }) => {
  const [collapsed, setCollapsed] = useState(false);

  const pages = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "sources", label: "Biblioteca", icon: BookOpen },
    { id: "notes", label: "Notas Atómicas", icon: FileText },
    { id: "sections", label: "Capítulos", icon: SquareKanban },
    { id: "matrix", label: "Matriz de Síntesis", icon: ShieldAlert },
    { id: "settings", label: "Configuración", icon: Settings },
  ];

  return (
    <aside className={`fixed inset-y-0 z-50 w-64 bg-card text-foreground border-r border-border transition-all duration-300 ${
      collapsed ? "w-16" : ""
    }`}>
      <div className="flex h-16 items-center justify-between px-4">
        <h1 className={`text-lg font-bold ${
          collapsed ? "hidden" : ""
        }`}>Tesista</h1>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>
      <nav className="mt-4 space-y-1 px-2">
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => onPageChange(page.id)}
            className={`flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activePage === page.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <page.icon className={`mr-3 h-5 w-5 flex-shrink-0 ${
              collapsed ? "ml-1" : ""
            }`} />
            {!collapsed && <span>{page.label}</span>}
          </button>
        ))}
      </nav>
      <div className="mt-auto p-4 border-t border-border">
        <button
          onClick={() => onPageChange("settings")}
          className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <Settings className="mr-3 h-4 w-4" />
          Configuración
        </button>
      </div>
    </aside>
  );
};
