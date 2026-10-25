import { useState, useEffect } from "react";
import { sourcesApi, Source, NewSource } from "../api";

export const SourcesPage = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [form, setForm] = useState<NewSource>({
    title: "",
    authors: [""],
    year: undefined,
    doi: undefined,
    readStatus: "unread",
  });

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await sourcesApi.list();
      setSources(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await sourcesApi.update(editing.id!, form);
      } else {
        await sourcesApi.create(form);
      }
      setOpen(false);
      setEditing(null);
      setForm({ title: "", authors: [""], year: undefined, doi: undefined, readStatus: "unread" });
      await loadSources();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const authorsList = form.authors.filter((a) => a.trim());

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Biblioteca de Fuentes</h1>
        <button
          onClick={() => { setEditing(null); setForm({ title: "", authors: [""], year: undefined, doi: undefined, readStatus: "unread" }); setOpen(true); }}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          Nueva Fuente
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2">Citekey</th>
              <th className="py-2">Título</th>
              <th className="py-2">Autores</th>
              <th className="py-2">Año</th>
              <th className="py-2">DOI</th>
              <th className="py-2">Estado</th>
              <th className="py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-b border-border hover:bg-muted">
                <td className="py-2 font-mono text-sm">{s.citekey}</td>
                <td className="py-2">{s.title}</td>
                <td className="py-2">{s.authors.join(", ")}</td>
                <td className="py-2">{s.year || "-"}</td>
                <td className="py-2">{s.doi || "-"}</td>
                <td className="py-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    s.readStatus === "read" ? "bg-green-100 text-green-700" :
                    s.readStatus === "reading" ? "bg-blue-100 text-blue-700" :
                    s.readStatus === "filed" ? "bg-purple-100 text-purple-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {s.readStatus}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => {
                      setEditing(s);
                      setForm({ ...s, authors: s.authors });
                      setOpen(true);
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="bg-card p-6 rounded-lg shadow-lg max-w-lg w-full border border-border">
            <h2 className="text-lg font-bold mb-4">{editing ? "Editar Fuente" : "Nueva Fuente"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título</label>
                <input
                  className="w-full border border-input rounded-md px-3 py-2"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Autores (separados por coma)</label>
                <input
                  className="w-full border border-input rounded-md px-3 py-2"
                  value={authorsList.join(", ")}
                  onChange={(e) =>
                    setForm({ ...form, authors: e.target.value.split(",").map(a => a.trim()) })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Año</label>
                  <input
                    type="number"
                    className="w-full border border-input rounded-md px-3 py-2"
                    value={form.year || ""}
                    onChange={(e) => setForm({ ...form, year: e.target.value ? parseInt(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">DOI</label>
                  <input
                    className="w-full border border-input rounded-md px-3 py-2"
                    value={form.doi || ""}
                    onChange={(e) => setForm({ ...form, doi: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Estado de lectura</label>
                <select
                  className="w-full border border-input rounded-md px-3 py-2"
                  value={form.readStatus}
                  onChange={(e) => setForm({ ...form, readStatus: e.target.value })}
                >
                  <option value="unread">No leído</option>
                  <option value="reading">Leyendo</option>
                  <option value="read">Leído</option>
                  <option value="filed">Archivado</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
