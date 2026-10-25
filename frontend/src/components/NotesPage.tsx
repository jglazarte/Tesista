import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2, X, Link2, Quote, CornerDownLeft } from "lucide-react";
import { Note, errorMessage, notesApi } from "../api";

interface Draft {
  title: string;
  content: string;
  tags: string[];
}

const splitTags = (raw: string): string[] =>
  raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

const NoteTags = ({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) => {
  const [input, setInput] = useState("");

  const addTags = (raw: string) => {
    const candidates = splitTags(raw);
    if (candidates.length === 0) return;
    const next = [...tags];
    for (const candidate of candidates) {
      if (!next.some((t) => t.toLowerCase() === candidate.toLowerCase())) {
        next.push(candidate);
      }
    }
    onChange(next);
    setInput("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-muted-foreground hover:text-foreground"
            title={`Quitar ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTags(input);
          } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => addTags(input)}
        placeholder={tags.length === 0 ? "Agregar etiquetas…" : "Otra etiqueta…"}
        className="!w-40 !border-0 !px-1 !py-0.5 !text-xs focus:!shadow-none"
      />
    </div>
  );
};

export const NotesPage = ({ newSignal = 0 }: { newSignal?: number }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [backlinks, setBacklinks] = useState<any[]>([]);

  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [creating, setCreating] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSignal = useRef(newSignal);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId]
  );

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        (n.content ?? "").toLowerCase().includes(q) ||
        (n.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [notes, query]);

  const autosave =
    typeof window !== "undefined" &&
    window.localStorage.getItem("tesista:autosave") === "1";

  const loadBacklinks = useCallback(async (id: number | null) => {
    if (id === null) {
      setBacklinks([]);
      return;
    }
    try {
      setBacklinks(await notesApi.backlinks(id));
    } catch {
      setBacklinks([]);
    }
  }, []);

  const applySelection = useCallback(
    (note: Note | null) => {
      setSelectedId(note?.id ?? null);
      setDraft(
        note
          ? {
              title: note.title,
              content: note.content ?? "",
              tags: [...(note.tags ?? [])],
            }
          : null
      );
      setDirty(false);
      void loadBacklinks(note?.id ?? null);
    },
    [loadBacklinks]
  );

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notesApi.list();
      setNotes(data);
      const current = selectedId !== null ? data.find((n) => n.id === selectedId) : null;
      if (current) {
        setDraft({
          title: current.title,
          content: current.content ?? "",
          tags: [...(current.tags ?? [])],
        });
      } else if (data.length > 0) {
        applySelection(data[0]);
      } else {
        applySelection(null);
      }
    } catch (err: any) {
      setError(errorMessage(err, "No se pudieron cargar las notas."));
    } finally {
      setLoading(false);
    }
  }, [applySelection, selectedId]);

  useEffect(() => {
    void loadNotes();
    // Carga inicial únicamente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (newSignal !== lastSignal.current) {
      lastSignal.current = newSignal;
      setShowNew(true);
    }
  }, [newSignal]);

  const selectNote = (note: Note) => {
    if (note.id === selectedId) return;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    applySelection(note);
  };

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setMessage(null);
  };

  const persist = useCallback(
    async (showFeedback: boolean) => {
      if (!draft || selectedId === null) return;
      if (!draft.title.trim()) {
        setError("El título de la nota no puede estar vacío.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const updated = await notesApi.update(selectedId, {
          title: draft.title.trim(),
          content: draft.content,
          tags: draft.tags,
        });
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        setDraft({
          title: updated.title,
          content: updated.content ?? "",
          tags: [...(updated.tags ?? [])],
        });
        setDirty(false);
        if (showFeedback) setMessage("Nota guardada.");
        void loadBacklinks(updated.id ?? null);
      } catch (err: any) {
        setError(errorMessage(err, "No se pudo guardar la nota."));
      } finally {
        setSaving(false);
      }
    },
    [draft, loadBacklinks, selectedId]
  );

  // Autoguardado opcional (se configura en Ajustes).
  useEffect(() => {
    if (!autosave || !dirty || !draft) return;
    const timer = window.setTimeout(() => {
      void persist(false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autosave, dirty, draft, persist]);

  // Ctrl/Cmd + S guarda la nota actual.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (selectedId !== null) void persist(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [persist, selectedId]);

  const createNote = async () => {
    if (!newTitle.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const note = await notesApi.create({
        title: newTitle.trim(),
        content: newContent,
        tags: splitTags(newTags),
      });
      setNotes((prev) => [note, ...prev]);
      setShowNew(false);
      setNewTitle("");
      setNewContent("");
      setNewTags("");
      applySelection(note);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo crear la nota."));
    } finally {
      setCreating(false);
    }
  };

  const deleteNote = async () => {
    if (selectedId === null) return;
    if (!window.confirm("¿Eliminar esta nota definitivamente?")) return;
    try {
      await notesApi.delete(selectedId);
      const rest = notes.filter((n) => n.id !== selectedId);
      setNotes(rest);
      applySelection(rest[0] ?? null);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo eliminar la nota."));
    }
  };

  const insertText = (text: string) => {
    if (!draft) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.content.length;
    const end = textarea?.selectionEnd ?? draft.content.length;
    const next = draft.content.slice(0, start) + text + draft.content.slice(end);
    updateDraft({ content: next });
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const pos = start + text.length;
      textareaRef.current.selectionStart = pos;
      textareaRef.current.selectionEnd = pos;
    });
  };

  const insertWikilink = () => {
    const target = window.prompt("Título de la nota a vincular:");
    if (target?.trim()) insertText(`[[${target.trim()}]]`);
  };

  const insertCiteMention = () => {
    const citekey = window.prompt("Clave BibTeX (@clave):");
    if (citekey?.trim()) insertText(`@${citekey.trim()}`);
  };

  const insertTransclusion = () => {
    const citekey = window.prompt("Clave BibTeX:");
    if (!citekey?.trim()) return;
    const locator = window.prompt("Localizador (página, párrafo…):");
    if (!locator?.trim()) return;
    insertText(`!@${citekey.trim()}#${locator.trim()}`);
  };

  const wordCount = draft
    ? draft.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="flex h-full min-h-0">
      {/* Lista de notas */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, contenido o etiqueta…"
              className="!py-1.5"
            />
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {filteredNotes.length} de {notes.length} notas
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">Cargando…</div>
          )}
          {!loading && filteredNotes.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {notes.length === 0 ? "Todavía no hay notas." : "Ninguna nota coincide."}
            </div>
          )}
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => selectNote(note)}
              className={`w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors ${
                selectedId === note.id
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/60"
              }`}
            >
              <div className="truncate text-sm font-medium">{note.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {(note.content ?? "").replace(/\s+/g, " ").slice(0, 90) || "Sin contenido"}
              </div>
              {(note.tags ?? []).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(note.tags ?? []).slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {draft && selectedNote ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className="text-xs text-muted-foreground">
                {dirty ? (
                  <span className="text-amber-600">Cambios sin guardar</span>
                ) : (
                  <span>Guardado · {wordCount} palabras</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void persist(true)}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteNote()}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Eliminar
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

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto flex h-full max-w-3xl flex-col gap-3">
                <input
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  placeholder="Título de la nota"
                  className="!border-0 !px-0 !text-2xl !font-bold focus:!shadow-none"
                />
                <NoteTags
                  tags={draft.tags}
                  onChange={(tags) => updateDraft({ tags })}
                />
                <textarea
                  ref={textareaRef}
                  key={selectedNote.id}
                  value={draft.content}
                  onChange={(e) => updateDraft({ content: e.target.value })}
                  placeholder={
                    "Escribe la nota…\n\nUsa [[Otra nota]] para enlazar, @citekey para citar y !@citekey#p. 45 para transcluir una cita."
                  }
                  spellCheck
                  className="note-editor min-h-[320px] flex-1 !border-0 !px-0 focus:!shadow-none"
                />
              </div>
            </div>

            <div className="shrink-0 border-t border-border">
              <div className="flex flex-wrap items-center gap-1 px-4 py-2">
                <button
                  type="button"
                  onClick={insertWikilink}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Insertar wikilink"
                >
                  <Link2 className="h-3.5 w-3.5" /> [[Nota]]
                </button>
                <button
                  type="button"
                  onClick={insertCiteMention}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Insertar mención a una fuente"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" /> @citekey
                </button>
                <button
                  type="button"
                  onClick={insertTransclusion}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Insertar transclusión"
                >
                  <Quote className="h-3.5 w-3.5" /> !@citekey#loc
                </button>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  Ctrl/⌘ + S para guardar
                </span>
              </div>

              {backlinks.length > 0 && (
                <div className="max-h-32 overflow-y-auto border-t border-border/60 bg-muted/30 px-4 py-2">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    Enlazada desde {backlinks.length} nota(s)
                  </div>
                  <ul className="space-y-0.5">
                    {backlinks.map((link: any) => (
                      <li key={link.id} className="truncate text-xs">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => {
                            const target = notes.find(
                              (n) => n.id === link.sourceNoteId
                            );
                            if (target) selectNote(target);
                          }}
                        >
                          {link.sourceNote?.title ??
                            link.sourceNoteTitle ??
                            `Nota ${link.sourceNoteId}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm">Seleccioná una nota o creá una nueva.</p>
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva nota
            </button>
          </div>
        )}

        {!draft && (error || message) && (
          <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error ?? message}
          </div>
        )}
      </div>

      {/* Modal nueva nota */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setShowNew(false)}
          />
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Nueva nota atómica</h2>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createNote();
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">Título</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Una idea, una nota"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Contenido</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={8}
                  placeholder="Markdown plano. Podés usar [[enlaces]], @citekeys y !@citekey#página"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Etiquetas (separadas por comas)
                </label>
                <input
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="concepto, metodología, ética"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creando…" : "Crear nota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
