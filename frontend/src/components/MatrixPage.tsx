import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Tag as TagIcon, Trash2, X, Pencil } from "lucide-react";
import {
  MatrixCell,
  MatrixQueryResult,
  Tag,
  TagType,
  errorMessage,
  matrixApi,
  tagsApi,
} from "../api";

const TAG_TYPES: { value: TagType; label: string }[] = [
  { value: "concept", label: "Conceptos" },
  { value: "methodology", label: "Metodologías" },
  { value: "stance", label: "Posturas" },
  { value: "custom", label: "Personalizadas" },
];

export const MatrixPage = () => {
  const [matrix, setMatrix] = useState<MatrixQueryResult | null>(null);
  const [tagType, setTagType] = useState<TagType>("concept");
  const [rowLimit, setRowLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCell, setActiveCell] = useState<{
    rowTitle: string;
    columnName: string;
    cell: MatrixCell;
  } | null>(null);

  const [showTags, setShowTags] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagType, setNewTagType] = useState<TagType>("concept");
  const [tagError, setTagError] = useState<string | null>(null);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await matrixApi.build({ tagType, rowLimit });
      setMatrix(data);
      setActiveCell(null);
    } catch (err: any) {
      setError(errorMessage(err, "No se pudo construir la matriz."));
    } finally {
      setLoading(false);
    }
  }, [rowLimit, tagType]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const loadTags = useCallback(async () => {
    try {
      setAllTags(await tagsApi.list());
    } catch (err: any) {
      setTagError(errorMessage(err, "No se pudieron cargar las etiquetas."));
    }
  }, []);

  useEffect(() => {
    if (showTags) void loadTags();
  }, [showTags, loadTags]);

  const createTag = async () => {
    if (!newTagName.trim()) return;
    setTagError(null);
    try {
      await tagsApi.create(newTagName.trim(), newTagType);
      setNewTagName("");
      await loadTags();
      await loadMatrix();
    } catch (err: any) {
      setTagError(errorMessage(err, "No se pudo crear la etiqueta."));
    }
  };

  const renameTag = async (tag: Tag) => {
    const name = window.prompt("Nuevo nombre de la etiqueta:", tag.name);
    if (!name?.trim() || name.trim() === tag.name) return;
    try {
      await tagsApi.update(tag.id!, { name: name.trim() });
      await loadTags();
      await loadMatrix();
    } catch (err: any) {
      setTagError(errorMessage(err, "No se pudo renombrar la etiqueta."));
    }
  };

  const deleteTag = async (tag: Tag) => {
    if (!window.confirm(`¿Eliminar la etiqueta "${tag.name}" de todos los ítems?`)) {
      return;
    }
    try {
      await tagsApi.delete(tag.id!);
      await loadTags();
      await loadMatrix();
    } catch (err: any) {
      setTagError(errorMessage(err, "No se pudo eliminar la etiqueta."));
    }
  };

  const columns = matrix?.columns ?? [];
  const rows = matrix?.rows ?? [];

  const cellFor = (rowId: number, tagId: number): MatrixCell | undefined =>
    matrix?.cells.find((c) => c.rowId === rowId && c.columnTagId === tagId);

  const totals = useMemo(() => {
    const map = new Map<number, number>();
    for (const cell of matrix?.cells ?? []) {
      map.set(cell.rowId, (map.get(cell.rowId) ?? 0) + cell.itemCount);
    }
    return map;
  }, [matrix]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-muted-foreground">Etiquetas:</label>
            <select
              value={tagType}
              onChange={(e) => setTagType(e.target.value as TagType)}
              className="!w-44 !py-1.5"
            >
              {TAG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="ml-2 text-muted-foreground">Máx. filas:</label>
            <input
              type="number"
              min={1}
              max={500}
              value={rowLimit}
              onChange={(e) => setRowLimit(Number(e.target.value) || 100)}
              className="!w-20 !py-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTags(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <TagIcon className="h-4 w-4" /> Etiquetas
            </button>
            <button
              type="button"
              onClick={() => void loadMatrix()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              {loading ? "Calculando…" : "Reconstruir"}
            </button>
          </div>
        </div>

        {error && (
          <div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {!matrix || rows.length === 0 || columns.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <p className="text-sm">
                {!matrix
                  ? "Construyendo la matriz…"
                  : rows.length === 0
                    ? "No hay fuentes para mostrar."
                    : `No hay etiquetas de tipo «${TAG_TYPES.find((t) => t.value === tagType)?.label}».`}
              </p>
              {matrix && columns.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowTags(true)}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
                >
                  Crear etiquetas
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                    Fuente
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="border-b border-border px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                      title={col.name}
                    >
                      {col.name}
                    </th>
                  ))}
                  <th className="border-b border-border px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="max-w-[280px] border-b border-border/60 px-3 py-2">
                      <div className="truncate font-medium">{row.title}</div>
                      {row.citekey && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.citekey}
                        </div>
                      )}
                    </td>
                    {columns.map((col) => {
                      const cell = cellFor(row.id, col.id!);
                      const count = cell?.itemCount ?? 0;
                      const isActive =
                        activeCell?.cell === cell && cell !== undefined;
                      return (
                        <td
                          key={col.id}
                          className={`border-b border-border/60 p-0 text-center ${
                            isActive ? "bg-primary/10" : ""
                          }`}
                        >
                          {count > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveCell({
                                  rowTitle: row.title,
                                  columnName: col.name,
                                  cell: cell!,
                                })
                              }
                              className="h-full w-full px-2 py-2 font-semibold text-primary hover:bg-primary/10"
                              title="Ver detalle"
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-border/60 px-2 py-2 text-center font-semibold tabular-nums">
                      {totals.get(row.id) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detalle de celda */}
      {activeCell && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-border">
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{activeCell.rowTitle}</div>
              <div className="text-xs text-muted-foreground">
                #{activeCell.columnName} · {activeCell.cell.itemCount} ítem(s)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveCell(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Cerrar detalle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {activeCell.cell.items.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="rounded border border-border p-2"
              >
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {item.type === "note" ? "Nota" : "Cita"}
                  </span>
                  {item.locator && <span className="font-mono">{item.locator}</span>}
                </div>
                {item.noteTitle && (
                  <div className="mb-1 text-xs font-medium">{item.noteTitle}</div>
                )}
                <p className="whitespace-pre-wrap text-xs leading-relaxed">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* Gestor de etiquetas */}
      {showTags && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowTags(false)} />
          <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-bold">Etiquetas</h2>
              <button
                type="button"
                onClick={() => setShowTags(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border p-4">
              {tagError && (
                <div className="mb-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {tagError}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createTag();
                }}
                className="flex items-end gap-2"
              >
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Nombre
                  </label>
                  <input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Ej. biopolítica"
                    className="!py-1.5"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Tipo
                  </label>
                  <select
                    value={newTagType}
                    onChange={(e) => setNewTagType(e.target.value as TagType)}
                    className="!w-40 !py-1.5"
                  >
                    {TAG_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!newTagName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Crear
                </button>
              </form>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {allTags.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  No hay etiquetas todavía.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {allTags.map((tag) => (
                    <li
                      key={tag.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium">#{tag.name}</span>
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {
                            TAG_TYPES.find((t) => t.value === tag.type)?.label ??
                              tag.type
                          }
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void renameTag(tag)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          title="Renombrar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTag(tag)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
