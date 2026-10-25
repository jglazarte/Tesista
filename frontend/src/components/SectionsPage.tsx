import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileDown,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Excerpt,
  GapReport,
  Note,
  SectionEvidence,
  SectionTreeNode,
  SectionType,
  evidencesApi,
  excerptsApi,
  exportApi,
  gapReportApi,
  notesApi,
  sectionsApi,
  wordCountApi,
  WordCountBreakdown,
  errorMessage,
} from "../api";

const TYPE_LABELS: Record<SectionType, string> = {
  part: "Parte",
  chapter: "Capítulo",
  section: "Sección",
  subsection: "Subsección",
};

const TYPE_BADGES: Record<SectionType, string> = {
  part: "bg-purple-100 text-purple-700",
  chapter: "bg-blue-100 text-blue-700",
  section: "bg-green-100 text-green-700",
  subsection: "bg-orange-100 text-orange-700",
};

const CITATION_STYLES = [
  { id: "apa", label: "APA 7" },
  { id: "chicago-author-date", label: "Chicago (autor-fecha)" },
  { id: "ieee", label: "IEEE" },
  { id: "mla", label: "MLA 9" },
  { id: "nature", label: "Nature" },
];

const EXPORT_FORMATS = [
  { id: "markdown", label: "Markdown (.md)" },
  { id: "latex", label: "LaTeX (.tex)" },
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "Word (.docx)" },
  { id: "typst", label: "Typst (.typ)" },
];

interface ExportResult {
  sectionId: number;
  sectionTitle: string;
  content: string;
  bibliography: { citekeys: string[]; sources: unknown[]; bibtexContent: string };
  exportFormat: string;
  outputPath?: string;
}

interface FlatNode {
  node: SectionTreeNode;
  depth: number;
  parentId?: number | null;
}

/** Aplana el árbol respetando el orden de los padres. */
function flatten(
  nodes: SectionTreeNode[],
  depth = 0,
  parentId: number | null = null
): FlatNode[] {
  const out: FlatNode[] = [];
  for (const node of nodes) {
    out.push({ node, depth, parentId });
    if (node.children?.length) {
      out.push(...flatten(node.children, depth + 1, node.id ?? null));
    }
  }
  return out;
}

function collectIds(node: SectionTreeNode): number[] {
  return [node.id!, ...(node.children ?? []).flatMap(collectIds)];
}

function findNode(nodes: SectionTreeNode[], id: number | null): SectionTreeNode | null {
  if (id === null) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children ?? [], id);
    if (child) return child;
  }
  return null;
}

export const SectionsPage = ({ newSignal = 0 }: { newSignal?: number }) => {
  const [tree, setTree] = useState<SectionTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    title: "",
    type: "chapter" as SectionType,
    parentId: "" as string,
    wordGoal: "",
    ownContent: "",
  });
  const [dirty, setDirty] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);

  const [evidences, setEvidences] = useState<SectionEvidence[]>([]);
  const [counts, setCounts] = useState<WordCountBreakdown | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [evidenceChoice, setEvidenceChoice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "chapter" as SectionType,
    parentId: "" as string,
  });
  const [creating, setCreating] = useState(false);

  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<GapReport | null>(null);

  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportForm, setExportForm] = useState({
    title: "",
    author:
      (typeof window !== "undefined" &&
        window.localStorage.getItem("tesista:author")) ||
      "",
    date: new Date().toISOString().slice(0, 10),
    abstract: "",
    styleId: "apa",
    includeBibliography: true,
    save: true,
    format: "markdown" as "markdown" | "latex" | "pdf" | "docx" | "typst",
    outputDir: "",
  });

  const lastSignal = useRef(newSignal);

  const flat = useMemo(() => flatten(tree), [tree]);
  const selected = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    const matches = flat.filter((f) => f.node.title.toLowerCase().includes(q));
    // Incluir ancestros para conservar el contexto jerárquico.
    const ids = new Set<number>();
    for (const match of matches) {
      ids.add(match.node.id!);
      let current: FlatNode | undefined = match;
      while (current && current.parentId != null) {
        ids.add(current.parentId);
        current = flat.find((f) => f.node.id === current!.parentId);
      }
    }
    return flat.filter((f) => ids.has(f.node.id!));
  }, [flat, query]);

  const loadTree = useCallback(
    async (keepSelection = true) => {
      setLoading(true);
      setError(null);
      try {
        const data = await sectionsApi.tree();
        setTree(data);
        setExpanded((prev) => {
          if (prev.size > 0) return prev;
          const initial = new Set<number>();
          for (const item of flatten(data)) {
            if (item.node.children?.length) initial.add(item.node.id!);
          }
          return initial;
        });
        const stillThere =
          keepSelection && selectedId !== null
            ? findNode(data, selectedId)
            : null;
        if (!stillThere && data.length > 0 && selectedId !== null) {
          setSelectedId(null);
        }
        return data;
      } catch (err: any) {
        setError(errorMessage(err, "No se pudo cargar la estructura."));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [selectedId]
  );

  useEffect(() => {
    void loadTree(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (newSignal !== lastSignal.current) {
      lastSignal.current = newSignal;
      setShowForm(true);
    }
  }, [newSignal]);

  useEffect(() => {
    notesApi.list().then(setNotes).catch(() => setNotes([]));
    excerptsApi.list().then(setExcerpts).catch(() => setExcerpts([]));
  }, []);

  const syncDraftFromNode = useCallback((node: SectionTreeNode | null) => {
    if (!node) {
      setDraft({
        title: "",
        type: "chapter",
        parentId: "",
        wordGoal: "",
        ownContent: "",
      });
      return;
    }
    setDraft({
      title: node.title,
      type: node.type,
      parentId: node.parentId ? String(node.parentId) : "",
      wordGoal: node.wordGoal ? String(node.wordGoal) : "",
      ownContent: node.ownContent ?? "",
    });
    setDirty(false);
  }, []);

  const loadEvidences = useCallback(async (sectionId: number) => {
    try {
      const [evs, wc] = await Promise.all([
        evidencesApi.listBySection(sectionId),
        wordCountApi.get(sectionId),
      ]);
      setEvidences(evs);
      setCounts(wc);
    } catch {
      setEvidences([]);
      setCounts(null);
    }
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setEvidences([]);
      setCounts(null);
      syncDraftFromNode(null);
      return;
    }
    const node = findNode(tree, selectedId);
    syncDraftFromNode(node);
    void loadEvidences(selectedId);
    // Sincroniza cuando cambia la selección o se recarga el árbol.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tree, loadEvidences, syncDraftFromNode]);

  const selectNode = (id: number) => {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    setSelectedId(id);
    setEditingMeta(false);
    setError(null);
    setMessage(null);
  };

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSection = async () => {
    if (!selected || selectedId === null) return;
    if (!draft.title.trim()) {
      setError("El título no puede estar vacío.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await sectionsApi.update(selectedId, {
        title: draft.title.trim(),
        type: draft.type,
        parentId: draft.parentId ? Number(draft.parentId) : null,
        wordGoal: draft.wordGoal ? Number(draft.wordGoal) : null,
        ownContent: draft.ownContent,
      });
      setDirty(false);
      setEditingMeta(false);
      setMessage("Sección guardada.");
      await loadTree(true);
      await loadEvidences(selectedId);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo guardar la sección."));
    } finally {
      setSaving(false);
    }
  };

  const deletes = async (id: number) => {
    if (
      !window.confirm(
        "¿Eliminar esta sección y todas sus subsecciones? Las notas y citas no se eliminan."
      )
    )
      return;
    try {
      await sectionsApi.delete(id);
      if (selectedId === id) setSelectedId(null);
      await loadTree(false);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo eliminar la sección."));
    }
  };

  const move = async (direction: -1 | 1) => {
    if (!selected || selectedId === null) return;
    const parentKey = selected.parentId ?? null;
    const siblings = flat.filter((f) => f.parentId === parentKey);
    const index = siblings.findIndex((f) => f.node.id === selectedId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    try {
      await sectionsApi.reorder(selectedId, parentKey, target);
      await loadTree(true);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo reordenar la sección."));
    }
  };

  const createSection = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await sectionsApi.create({
        title: form.title.trim(),
        type: form.type,
        parentId: form.parentId ? Number(form.parentId) : undefined,
      });
      setShowForm(false);
      setForm({ title: "", type: "chapter", parentId: "" });
      if (form.parentId) {
        setExpanded((prev) => new Set(prev).add(Number(form.parentId)));
      }
      await loadTree(false);
      if (created.id) setSelectedId(created.id);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo crear la sección."));
    } finally {
      setCreating(false);
    }
  };

  const addEvidence = async () => {
    if (!selectedId || !evidenceChoice) return;
    const [type, rawId] = evidenceChoice.split(":");
    try {
      await evidencesApi.create({
        sectionId: selectedId,
        evidenceType: type as "note" | "excerpt",
        evidenceId: Number(rawId),
      });
      setEvidenceChoice("");
      await loadEvidences(selectedId);
      await loadTree(true);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo vincular la evidencia."));
    }
  };

  const removeEvidence = async (id?: number) => {
    if (!id || !selectedId) return;
    try {
      await evidencesApi.delete(id);
      await loadEvidences(selectedId);
      await loadTree(true);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo quitar la evidencia."));
    }
  };

  const openReport = async () => {
    setShowReport(true);
    setReport(null);
    try {
      setReport(await gapReportApi.get());
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo generar el reporte."));
      setShowReport(false);
    }
  };

  const openExport = () => {
    if (!selected) return;
    setExportResult(null);
    setExportError(null);
    setExportForm((prev) => ({
      ...prev,
      title: selected.title,
    }));
    setShowExport(true);
  };

  const runExport = async () => {
    if (!selected?.id) return;
    if (!exportForm.title.trim()) {
      setExportError("El título del documento es obligatorio.");
      return;
    }
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const author = exportForm.author.trim();
      if (author) window.localStorage.setItem("tesista:author", author);
      const result = (await exportApi.chapter(selected.id, {
        title: exportForm.title.trim(),
        author: author || "Autor",
        date: exportForm.date || undefined,
        abstract: exportForm.abstract.trim() || undefined,
        language: "es",
      }, {
        styleId: exportForm.styleId,
        includeBibliography: exportForm.includeBibliography,
        save: exportForm.save,
        outputDir: exportForm.outputDir.trim() || undefined,
        format: exportForm.format,
      })) as ExportResult;
      setExportResult(result);
    } catch (err: any) {
      setExportError(errorMessage(err, "No se pudo exportar el capítulo."));
    } finally {
      setExporting(false);
    }
  };

  const downloadMarkdown = () => {
    if (!exportResult) return;
    const blob = new Blob([exportResult.content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle =
      exportResult.sectionTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "capitulo";
    link.href = url;
    link.download = `${safeTitle}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const parentOptions = useMemo(() => {
    if (!selected) return flat;
    const excluded = new Set(collectIds(selected));
    return flat.filter((f) => !excluded.has(f.node.id!));
  }, [flat, selected]);

  const renderNodes = (nodes: SectionTreeNode[]): ReactNode =>
    nodes.map((node) => {
      const hasChildren = (node.children?.length ?? 0) > 0;
      const isOpen = expanded.has(node.id!);
      const isSelected = selectedId === node.id;
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 border-b border-border/50 px-2 py-1.5 ${
              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(node.id!)}
              className={`rounded p-0.5 text-muted-foreground hover:text-foreground ${
                hasChildren ? "" : "invisible"
              }`}
              aria-label={isOpen ? "Contraer" : "Expandir"}
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => selectNode(node.id!)}
              className="min-w-0 flex-1 truncate py-0.5 text-left text-sm"
              title={node.title}
            >
              <span className="mr-1 text-xs text-muted-foreground">
                {TYPE_LABELS[node.type]}
              </span>
              {node.title}
            </button>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {node.totalWordCount}
            </span>
          </div>
          {isOpen && hasChildren && (
            <div className="ml-4 border-l border-border/50">
              {renderNodes(node.children)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="flex h-full min-h-0">
      {/* Árbol */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="shrink-0 space-y-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar secciones…"
                className="!py-1.5 !pl-7"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{flat.length} secciones</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void loadTree(true)}
                className="rounded p-1 hover:bg-muted"
                title="Recargar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void openReport()}
                className="rounded p-1 hover:bg-muted"
                title="Reporte de cobertura"
              >
                <AlertCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tree.length === 0 && !loading && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Todavía no hay secciones. Creá una parte o un capítulo.
            </div>
          )}
          {tree.length > 0 && !query.trim() && renderNodes(tree)}
          {tree.length > 0 &&
            query.trim().length > 0 &&
            filtered.map((entry) => (
              <button
                key={entry.node.id}
                type="button"
                onClick={() => selectNode(entry.node.id!)}
                className={`flex w-full items-center gap-2 border-b border-border/50 py-1.5 pr-2 text-left text-sm ${
                  selectedId === entry.node.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60"
                }`}
                style={{ paddingLeft: `${8 + entry.depth * 16}px` }}
              >
                <span className="text-xs text-muted-foreground">
                  {TYPE_LABELS[entry.node.type]}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.node.title}</span>
              </button>
            ))}
          {query.trim().length > 0 && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Ninguna sección coincide.
            </div>
          )}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_BADGES[selected.type]}`}>
                  {TYPE_LABELS[selected.type]}
                </span>
                <h2 className="truncate text-lg font-semibold">{selected.title}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void move(-1)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  title="Subir"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(1)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  title="Bajar"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMeta((v) => !v)}
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {editingMeta ? "Cerrar" : "Editar datos"}
                </button>
                <button
                  type="button"
                  onClick={openExport}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                  title="Exportar esta sección y sus subsecciones"
                >
                  <FileDown className="h-3.5 w-3.5" /> Exportar
                </button>
                <button
                  type="button"
                  onClick={() => void deletes(selected.id!)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
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
              {editingMeta && (
                <div className="mb-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Título</label>
                    <input
                      value={draft.title}
                      onChange={(e) => {
                        setDraft({ ...draft, title: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
                    <select
                      value={draft.type}
                      onChange={(e) => {
                        setDraft({ ...draft, type: e.target.value as SectionType });
                        setDirty(true);
                      }}
                    >
                      {Object.entries(TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Sección padre</label>
                    <select
                      value={draft.parentId}
                      onChange={(e) => {
                        setDraft({ ...draft, parentId: e.target.value });
                        setDirty(true);
                      }}
                    >
                      <option value="">Sin padre (raíz)</option>
                      {parentOptions.map((f) => (
                        <option key={f.node.id} value={f.node.id}>
                          {"— ".repeat(f.depth)}
                          {f.node.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Objetivo de palabras
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={draft.wordGoal}
                      onChange={(e) => {
                        setDraft({ ...draft, wordGoal: e.target.value });
                        setDirty(true);
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Palabras propias</div>
                  <div className="text-xl font-semibold tabular-nums">{counts?.ownWords ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Palabras de evidencias</div>
                  <div className="text-xl font-semibold tabular-nums">{counts?.evidenceWords ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-xl font-semibold tabular-nums">{counts?.totalWords ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Objetivo</div>
                  <div className="text-xl font-semibold tabular-nums">
                    {selected.wordGoal ?? "—"}
                  </div>
                </div>
              </div>

              {selected.wordGoal ? (
                <div className="mb-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            ((counts?.totalWords ?? 0) / (selected.wordGoal || 1)) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Math.min(
                      100,
                      Math.round(
                        ((counts?.totalWords ?? 0) / (selected.wordGoal || 1)) * 100
                      )
                    )}
                    % del objetivo
                  </div>
                </div>
              ) : null}

              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Contenido propio</h3>
                  <button
                    type="button"
                    onClick={() => void saveSection()}
                    disabled={saving || !dirty}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
                <textarea
                  value={draft.ownContent}
                  onChange={(e) => {
                    setDraft({ ...draft, ownContent: e.target.value });
                    setDirty(true);
                  }}
                  rows={12}
                  placeholder="Escribí acá el texto de esta sección. Las citas y notas se agregan como evidencias."
                  className="font-mono text-sm leading-relaxed"
                />
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Evidencias vinculadas ({evidences.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={evidenceChoice}
                      onChange={(e) => setEvidenceChoice(e.target.value)}
                      className="!w-72 !py-1.5 text-sm"
                    >
                      <option value="">Elegir nota o cita…</option>
                      {notes.length > 0 && (
                        <optgroup label="Notas">
                          {notes.map((n) => (
                            <option key={`note-${n.id}`} value={`note:${n.id}`}>
                              {n.title}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {excerpts.length > 0 && (
                        <optgroup label="Citas">
                          {excerpts.map((e) => (
                            <option key={`excerpt-${e.id}`} value={`excerpt:${e.id}`}>
                              {e.text.slice(0, 60)}… ({e.locator})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => void addEvidence()}
                      disabled={!evidenceChoice}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> Agregar
                    </button>
                  </div>
                </div>

                {evidences.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    Esta sección todavía no tiene evidencias.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {evidences.map((ev) => (
                      <li
                        key={ev.id}
                        className="group rounded-lg border border-border p-3"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {ev.evidenceType === "note" ? "Nota: " : "Cita: "}
                              {ev.evidenceTitle ?? `#${ev.evidenceId}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ev.citekey ? `${ev.citekey}` : ""}
                              {ev.locator ? ` · ${ev.locator}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeEvidence(ev.id)}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            title="Quitar evidencia"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                          {ev.evidenceText}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm">Seleccioná una sección del árbol para verla y editarla.</p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva sección
            </button>
          </div>
        )}
      </div>

      {/* Modal nueva sección */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Nueva sección</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createSection();
              }}
              className="space-y-4"
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as SectionType })
                    }
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Padre</label>
                  <select
                    value={form.parentId}
                    onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  >
                    <option value="">Sin padre (raíz)</option>
                    {flat.map((f) => (
                      <option key={f.node.id} value={f.node.id}>
                        {"— ".repeat(f.depth)}
                        {f.node.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !form.title.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal exportar */}
      {showExport && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setShowExport(false)}
          />
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h2 className="text-lg font-bold">Exportar capítulo</h2>
                <p className="text-xs text-muted-foreground">
                  Incluye el texto propio y las evidencias de esta sección y sus
                  subsecciones.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExport(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Título del documento
                  </label>
                  <input
                    value={exportForm.title}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Autor
                  </label>
                  <input
                    value={exportForm.author}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, author: e.target.value })
                    }
                    placeholder="Nombre y apellido"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={exportForm.date}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Estilo de cita
                  </label>
                  <select
                    value={exportForm.styleId}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, styleId: e.target.value })
                    }
                  >
                    {CITATION_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Resumen (opcional)
                </label>
                <textarea
                  value={exportForm.abstract}
                  onChange={(e) =>
                    setExportForm({ ...exportForm, abstract: e.target.value })
                  }
                  rows={3}
                  placeholder="Se incluye en el frontmatter YAML."
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exportForm.includeBibliography}
                    onChange={(e) =>
                      setExportForm({
                        ...exportForm,
                        includeBibliography: e.target.checked,
                      })
                    }
                  />
                  Incluir bibliografía podada
                </label>
                <label className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exportForm.save}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, save: e.target.checked })
                    }
                  />
                  Guardar el archivo en el servidor
                </label>
              </div>

              {exportForm.save && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Formato
                    </label>
                    <select
                      value={exportForm.format}
                      onChange={(e) =>
                        setExportForm({
                          ...exportForm,
                          format: e.target.value as typeof exportForm.format,
                        })
                      }
                    >
                      {EXPORT_FORMATS.map((format) => (
                        <option key={format.id} value={format.id}>
                          {format.label}
                        </option>
                      ))}
                    </select>
                    {exportForm.format !== "markdown" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Los demás formatos requieren Pandoc instalado.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Carpeta de salida (opcional)
                    </label>
                    <input
                      value={exportForm.outputDir}
                      onChange={(e) =>
                        setExportForm({
                          ...exportForm,
                          outputDir: e.target.value,
                        })
                      }
                      placeholder="Por defecto: export/"
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              {exportError && (
                <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {exportError}
                </div>
              )}

              {exportResult && (
                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <div className="font-medium">
                    «{exportResult.sectionTitle}» exportado.
                  </div>
                  <div className="text-xs">
                    {exportResult.bibliography.sources.length} fuente(s) en la
                    bibliografía.
                  </div>
                  {exportResult.outputPath && (
                    <div className="break-all font-mono text-xs">
                      {exportResult.outputPath}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={downloadMarkdown}
                      className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar Markdown
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 font-mono text-[11px] text-foreground">
                    {exportResult.content.slice(0, 4000)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
              <button
                type="button"
                onClick={() => setShowExport(false)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => void runExport()}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                {exporting ? "Exportando…" : "Exportar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal reporte */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowReport(false)} />
          <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-bold">Reporte de cobertura</h2>
              <button
                type="button"
                onClick={() => setShowReport(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!report ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Calculando reporte…
                </div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="text-xs font-semibold text-red-700">Secciones huérfanas</div>
                      <div className="text-2xl font-bold">{report.orphanSections.length}</div>
                    </div>
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                      <div className="text-xs font-semibold text-orange-700">Fuentes sin citas</div>
                      <div className="text-2xl font-bold">{report.uncitedSources.length}</div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="text-xs font-semibold text-blue-700">Capítulos</div>
                      <div className="text-2xl font-bold">{report.chapterBalance.length}</div>
                    </div>
                  </div>

                  {report.orphanSections.length > 0 && (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold">Secciones sin contenido ni evidencias</h3>
                      <ul className="space-y-1 text-sm">
                        {report.orphanSections.map((s) => (
                          <li key={s.id} className="text-muted-foreground">
                            {s.path} <span className="text-xs">({s.type})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.uncitedSources.length > 0 && (
                    <div className="mb-4">
                      <h3 className="mb-2 text-sm font-semibold">Fuentes sin citas registradas</h3>
                      <ul className="space-y-1 text-sm">
                        {report.uncitedSources.map((s) => (
                          <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                            <span className="truncate">{s.title}</span>
                            <span className="font-mono text-xs">{s.citekey}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Balance por capítulo</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2">Capítulo</th>
                          <th className="py-2 text-right">Propias</th>
                          <th className="py-2 text-right">Evidencias</th>
                          <th className="py-2 text-right">Total</th>
                          <th className="py-2 text-right">Objetivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.chapterBalance.map((c) => (
                          <tr key={c.id} className="border-b border-border/50">
                            <td className="py-1.5">{c.title}</td>
                            <td className="py-1.5 text-right tabular-nums">{c.ownWords}</td>
                            <td className="py-1.5 text-right tabular-nums">{c.evidenceWords}</td>
                            <td className="py-1.5 text-right tabular-nums">{c.totalWords}</td>
                            <td className="py-1.5 text-right tabular-nums">
                              {c.progressPct != null ? `${c.progressPct}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
