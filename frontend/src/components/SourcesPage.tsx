import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, X, Download, Pencil, Quote } from "lucide-react";
import {
  Excerpt,
  NewSource,
  Source,
  errorMessage,
  excerptsApi,
  itemTagsApi,
  sourcesApi,
} from "../api";

const splitList = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Los autores se separan con punto y coma para permitir el formato
 * «Apellido, Nombre» dentro de cada autor.
 */
const splitAuthors = (raw: string) =>
  raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

const READ_STATUS_LABELS: Record<Source["readStatus"], string> = {
  unread: "No leído",
  reading: "Leyendo",
  read: "Leído",
  filed: "Archivado",
};

const emptySourceForm = (): NewSource => ({
  title: "",
  authors: [],
  year: undefined,
  doi: undefined,
  isbn: undefined,
  publisher: undefined,
  containerTitle: undefined,
  bibtexType: "article",
  readStatus: "unread",
  notes: undefined,
});

export const SourcesPage = ({ newSignal = 0 }: { newSignal?: number }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<Source | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [loadingExcerpts, setLoadingExcerpts] = useState(false);
  const [excerptForm, setExcerptForm] = useState({
    text: "",
    locator: "",
    context: "",
    tags: "",
  });
  const [editingExcerptId, setEditingExcerptId] = useState<number | null>(null);
  const [savingExcerpt, setSavingExcerpt] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [form, setForm] = useState<NewSource>(emptySourceForm());
  const [authorsText, setAuthorsText] = useState("");
  const [saving, setSaving] = useState(false);

  const [openDoi, setOpenDoi] = useState(false);
  const [doi, setDoi] = useState("");
  const [importing, setImporting] = useState(false);

  const lastSignal = useRef(newSignal);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.citekey.toLowerCase().includes(q) ||
        (s.doi ?? "").toLowerCase().includes(q) ||
        s.authors.some((a) => a.toLowerCase().includes(q))
    );
  }, [sources, query]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSources(await sourcesApi.list());
    } catch (err: any) {
      setError(errorMessage(err, "No se pudieron cargar las fuentes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (newSignal !== lastSignal.current) {
      lastSignal.current = newSignal;
      openNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSignal]);

  const loadTags = useCallback(async (source: Source) => {
    if (!source.id) {
      setSelectedTags([]);
      return;
    }
    try {
      const tags = await itemTagsApi.list("source", source.id);
      setSelectedTags(tags.map((t) => t.name));
    } catch {
      setSelectedTags([]);
    }
  }, []);

  const loadExcerpts = useCallback(async (source: Source) => {
    if (!source.id) {
      setExcerpts([]);
      return;
    }
    setLoadingExcerpts(true);
    try {
      setExcerpts(await excerptsApi.list(source.id));
    } catch (err: any) {
      setError(errorMessage(err, "No se pudieron cargar las citas."));
    } finally {
      setLoadingExcerpts(false);
    }
  }, []);

  const selectSource = (source: Source) => {
    setSelected(source);
    setError(null);
    setMessage(null);
    setEditingExcerptId(null);
    setExcerptForm({ text: "", locator: "", context: "", tags: "" });
    void loadTags(source);
    void loadExcerpts(source);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptySourceForm());
    setAuthorsText("");
    setOpenForm(true);
  };

  const openEdit = (source: Source) => {
    setEditing(source);
    setForm({
      title: source.title,
      authors: source.authors,
      year: source.year,
      doi: source.doi,
      isbn: source.isbn,
      publisher: source.publisher,
      containerTitle: source.containerTitle,
      bibtexType: source.bibtexType ?? "article",
      readStatus: source.readStatus,
      notes: source.notes,
      citekey: source.citekey,
    });
    setAuthorsText(source.authors.join("; "));
    setOpenForm(true);
  };

  const saveSource = async () => {
    const payload: NewSource = {
      ...form,
      title: form.title.trim(),
      authors: splitAuthors(authorsText),
      year: form.year ? Number(form.year) : undefined,
      doi: form.doi?.trim() || undefined,
      citekey: form.citekey?.trim() || undefined,
    };
    if (!payload.title) {
      setError("El título es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = editing
        ? await sourcesApi.update(editing.id!, payload)
        : await sourcesApi.create(payload);
      setOpenForm(false);
      await loadSources();
      selectSource(saved);
      setMessage(editing ? "Fuente actualizada." : "Fuente creada.");
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo guardar la fuente."));
    } finally {
      setSaving(false);
    }
  };

  const deleteSource = async (source: Source) => {
    if (
      !window.confirm(
        `¿Eliminar "${source.title}"? También se eliminarán sus citas y vínculos.`
      )
    )
      return;
    try {
      await sourcesApi.delete(source.id!);
      if (selected?.id === source.id) {
        setSelected(null);
        setExcerpts([]);
        setSelectedTags([]);
      }
      await loadSources();
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo eliminar la fuente."));
    }
  };

  const importDoi = async () => {
    if (!doi.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const result = await sourcesApi.importDoi(doi.trim());
      setOpenDoi(false);
      setDoi("");
      await loadSources();
      selectSource(result.source);
      setMessage(
        result.existing
          ? "Esa fuente ya existía; se abrió su ficha."
          : "Fuente importada desde el DOI."
      );
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo importar el DOI."));
    } finally {
      setImporting(false);
    }
  };

  const saveTags = async (tags: string[]) => {
    if (!selected?.id) return;
    try {
      const saved = await itemTagsApi.set("source", selected.id, tags);
      const names = saved.map((t) => t.name);
      setSelectedTags(names);
      setSources((prev) =>
        prev.map((s) => (s.id === selected.id ? { ...s, tags: names } : s))
      );
    } catch (err: any) {
      setError(errorMessage(err, "No se pudieron guardar las etiquetas."));
    }
  };

  const addTag = () => {
    const clean = tagInput.trim();
    if (!clean) return;
    if (selectedTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setTagInput("");
      return;
    }
    const next = [...selectedTags, clean];
    setTagInput("");
    void saveTags(next);
  };

  const startEditExcerpt = (excerpt: Excerpt) => {
    setEditingExcerptId(excerpt.id ?? null);
    setExcerptForm({
      text: excerpt.text,
      locator: excerpt.locator,
      context: excerpt.context ?? "",
      tags: (excerpt.tags ?? []).join(", "),
    });
  };

  const saveExcerpt = async () => {
    if (!selected?.id) return;
    if (!excerptForm.text.trim() || !excerptForm.locator.trim()) {
      setError("El texto y el localizador de la cita son obligatorios.");
      return;
    }
    setSavingExcerpt(true);
    setError(null);
    try {
      const payload = {
        sourceId: selected.id,
        text: excerptForm.text.trim(),
        locator: excerptForm.locator.trim(),
        context: excerptForm.context.trim() || undefined,
        tags: splitList(excerptForm.tags),
      };
      if (editingExcerptId) {
        await excerptsApi.update(editingExcerptId, payload);
        setMessage("Cita actualizada.");
      } else {
        await excerptsApi.create(payload);
        setMessage("Cita agregada.");
      }
      setEditingExcerptId(null);
      setExcerptForm({ text: "", locator: "", context: "", tags: "" });
      await loadExcerpts(selected);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo guardar la cita."));
    } finally {
      setSavingExcerpt(false);
    }
  };

  const deleteExcerpt = async (excerpt: Excerpt) => {
    if (!window.confirm("¿Eliminar esta cita?")) return;
    try {
      await excerptsApi.delete(excerpt.id!);
      if (selected) await loadExcerpts(selected);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo eliminar la cita."));
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, autor, clave o DOI…"
                className="!w-72 !py-1.5 !pl-7"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filtered.length} de {sources.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpenDoi(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" /> Importar DOI
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva fuente
            </button>
          </div>
        </div>

        {(error || message) && (
          <div
            className={`shrink-0 border-b px-4 py-2 text-sm ${
              error
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {error ?? message}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Citekey</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Autores</th>
                <th className="px-3 py-2">Año</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((source) => (
                <tr
                  key={source.id}
                  className={`border-b border-border/60 ${
                    selected?.id === source.id ? "bg-accent/60" : "hover:bg-muted/50"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{source.citekey}</td>
                  <td className="max-w-[320px] truncate px-3 py-2">{source.title}</td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">
                    {source.authors.join("; ")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{source.year ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {READ_STATUS_LABELS[source.readStatus] ?? source.readStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => selectSource(source)}
                        className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                      >
                        Citas
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(source)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSource(source)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {sources.length === 0
                      ? "Todavía no hay fuentes. Creá una o importá un DOI."
                      : "Ninguna fuente coincide con la búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel de detalle */}
      <aside className="flex w-96 shrink-0 flex-col border-l border-border">
        {selected ? (
          <>
            <div className="shrink-0 border-b border-border p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold leading-snug">{selected.title}</h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                  aria-label="Cerrar panel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{selected.citekey}</span>
                {selected.year ? ` · ${selected.year}` : ""}
                {selected.containerTitle ? ` · ${selected.containerTitle}` : ""}
              </div>
              {selected.doi && (
                <div className="mt-1 break-all text-xs text-muted-foreground">
                  DOI: {selected.doi}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() =>
                        void saveTags(selectedTags.filter((t) => t !== tag))
                      }
                      className="text-muted-foreground hover:text-foreground"
                      title="Quitar etiqueta"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder="Etiqueta…"
                  className="!w-28 !border-0 !px-1 !py-0.5 !text-xs focus:!shadow-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Quote className="h-3.5 w-3.5" /> Citas ({excerpts.length})
              </h3>

              {loadingExcerpts ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  Cargando…
                </div>
              ) : excerpts.length === 0 ? (
                <div className="mb-3 rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Sin citas todavía.
                </div>
              ) : (
                <ul className="mb-4 space-y-2">
                  {excerpts.map((excerpt) => (
                    <li key={excerpt.id} className="rounded border border-border p-2">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {excerpt.locator}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => startEditExcerpt(excerpt)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                            title="Editar cita"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteExcerpt(excerpt)}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Eliminar cita"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">
                        {excerpt.text}
                      </p>
                      {(excerpt.tags ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(excerpt.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <h4 className="mb-2 text-xs font-semibold">
                  {editingExcerptId ? "Editar cita" : "Nueva cita"}
                </h4>
                <div className="space-y-2">
                  <textarea
                    value={excerptForm.text}
                    onChange={(e) =>
                      setExcerptForm({ ...excerptForm, text: e.target.value })
                    }
                    rows={3}
                    placeholder="Texto exacto de la cita"
                    className="!text-xs"
                  />
                  <input
                    value={excerptForm.locator}
                    onChange={(e) =>
                      setExcerptForm({ ...excerptForm, locator: e.target.value })
                    }
                    placeholder="Localizador (p. 45)"
                    className="!py-1 !text-xs"
                  />
                  <input
                    value={excerptForm.context}
                    onChange={(e) =>
                      setExcerptForm({ ...excerptForm, context: e.target.value })
                    }
                    placeholder="Contexto (opcional)"
                    className="!py-1 !text-xs"
                  />
                  <input
                    value={excerptForm.tags}
                    onChange={(e) =>
                      setExcerptForm({ ...excerptForm, tags: e.target.value })
                    }
                    placeholder="Etiquetas separadas por comas"
                    className="!py-1 !text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    {editingExcerptId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingExcerptId(null);
                          setExcerptForm({
                            text: "",
                            locator: "",
                            context: "",
                            tags: "",
                          });
                        }}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveExcerpt()}
                      disabled={
                        savingExcerpt ||
                        !excerptForm.text.trim() ||
                        !excerptForm.locator.trim()
                      }
                      className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingExcerpt
                        ? "Guardando…"
                        : editingExcerptId
                          ? "Guardar cita"
                          : "Agregar cita"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Seleccioná una fuente para ver y editar sus citas y etiquetas.
          </div>
        )}
      </aside>

      {/* Modal fuente */}
      {openForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setOpenForm(false)} />
          <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? "Editar fuente" : "Nueva fuente"}
              </h2>
              <button
                type="button"
                onClick={() => setOpenForm(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveSource();
              }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">Título</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Autores (separados por punto y coma)
                </label>
                <input
                  value={authorsText}
                  onChange={(e) => setAuthorsText(e.target.value)}
                  placeholder="Pérez, Ana; Gómez, Luis"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Año</label>
                  <input
                    type="number"
                    value={form.year ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        year: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">DOI</label>
                  <input
                    value={form.doi ?? ""}
                    onChange={(e) => setForm({ ...form, doi: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Revista / Libro</label>
                  <input
                    value={form.containerTitle ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, containerTitle: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Editorial</label>
                  <input
                    value={form.publisher ?? ""}
                    onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo BibTeX</label>
                  <select
                    value={form.bibtexType ?? "article"}
                    onChange={(e) =>
                      setForm({ ...form, bibtexType: e.target.value })
                    }
                  >
                    <option value="article">article</option>
                    <option value="book">book</option>
                    <option value="inproceedings">inproceedings</option>
                    <option value="thesis">thesis</option>
                    <option value="inbook">inbook</option>
                    <option value="misc">misc</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Estado</label>
                  <select
                    value={form.readStatus}
                    onChange={(e) =>
                      setForm({ ...form, readStatus: e.target.value })
                    }
                  >
                    <option value="unread">No leído</option>
                    <option value="reading">Leyendo</option>
                    <option value="read">Leído</option>
                    <option value="filed">Archivado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Citekey (opcional)
                </label>
                <input
                  value={form.citekey ?? ""}
                  onChange={(e) => setForm({ ...form, citekey: e.target.value })}
                  placeholder="Se genera automáticamente si se deja vacío"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Notas</label>
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenForm(false)}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.title.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal DOI */}
      {openDoi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setOpenDoi(false)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Importar por DOI</h2>
              <button
                type="button"
                onClick={() => setOpenDoi(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void importDoi();
              }}
              className="space-y-3"
            >
              <p className="text-sm text-muted-foreground">
                Se consultan CrossRef y OpenAlex. Si el DOI ya existe, se abre la
                fuente existente.
              </p>
              <input
                autoFocus
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="10.1000/xyz123"
                className="font-mono"
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpenDoi(false)}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !doi.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing ? "Consultando…" : "Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
