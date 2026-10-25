"use client";

import { useState, useEffect } from "react";
import { sectionsApi, Section } from "../api";

type SectionNode = Section & { children: SectionNode[]; expanded: boolean };

// Simple inline SVG icons
const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
  </svg>
);
const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const EditIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.414a1 1 0 00-1-1V4a1 1 0 011-1h2.586l.123.123" />
  </svg>
);
const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
  </svg>
);
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);
const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const AlertCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4.938.192.192a1 1 0 001.414 1.414l1.414 1.414a1 1 0 001.414 1.414l1.414 1.414a1 1 0 001.414 1.414l1.414 1.414a1 1 0 001.414 1.414z" />
  </svg>
);
const LayoutListIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const SectionsPage = () => {
  const [tree, setTree] = useState<SectionNode[]>([]);
  const [selected, setSelected] = useState<Section | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [form, setForm] = useState({ title: "", type: "chapter" as const, parentId: undefined as number | undefined });
  const [showForm, setShowForm] = useState(false);
  const [report] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadTree = async () => {
    setLoading(true);
    try {
      const data = await sectionsApi.tree();
      const build = (sections: Section[], pid: number | undefined): SectionNode[] =>
        sections.filter((s) => s.parentId === pid).map((s) => ({ ...s, children: build(sections, s.id), expanded: s.type === "part" }));
      setTree(build(data, null));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTree(); }, []);

  const createSection = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await sectionsApi.create({ title: form.title, type: form.type, parentId: form.parentId });
      setShowForm(false);
      setForm({ title: "", type: "chapter", parentId: undefined });
      await loadTree();
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setLoading(false); }
  };

  const deleteSection = async (id: number) => {
    if (!confirm("¿Eliminar sección y todas sus hijas?")) return;
    setLoading(true);
    try {
      await sectionsApi.delete(id);
      await loadTree();
      if (selected?.id === id) setSelected(null);
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setLoading(false); }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      await sectionsApi.update(editingId, { title: editTitle });
      await loadTree();
      if (selected?.id === editingId) setSelected({ ...selected, title: editTitle } as Section);
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setLoading(false); setEditingId(null); }
  };

  const renderTree = (nodes: SectionNode[]) => (
    nodes.map((node) => (
      <div key={node.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 cursor-pointer hover:bg-muted/50" onClick={() => setSelected(node)}>
        <button onClick={(e) => { e.stopPropagation(); node.expanded = !node.expanded; setTree([...tree]); }} className="p-1 text-muted-foreground hover:text-foreground">
          {node.children.length > 0 ? (node.expanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />) : <div className="w-4 h-4" />}
        </button>
        <div className={`flex-1 truncate ${selected?.id === node.id ? "bg-accent text-accent-foreground px-2 py-1 rounded" : "text-foreground hover:bg-muted"}`}>
          {node.type === "part" && "▸ "}{node.title}
          {node.children.length > 0 && ` (${node.children.length})`}
        </div>
        <button onClick={(e) => { e.stopPropagation(); setEditingId(node.id); setEditTitle(node.title); }} className="p-1 text-muted-foreground hover:text-foreground"><EditIcon className="w-4 h-4" /></button>
      </div>
    ))
  );

  return (
    <div className="h-full flex flex-col">
      <header className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
        <div className="flex items-center gap-3"><h1 className="text-xl font-bold">Estructura de Capítulos</h1><span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-medium">Jerárquico</span></div>
        <div className="flex items-center gap-2">
          <button onClick={loadTree} className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground" title="Refrescar"><LayoutListIcon className="w-4 h-4" /></button>
          <button onClick={() => setShowReport(true)} className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground" title="Reporte"><AlertCircleIcon className="w-4 h-4" /></button>
          <button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 disabled:opacity-50" disabled={loading}><PlusIcon className="w-3 h-3 mr-2" /> Nueva Sección</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-2/5 border-r border-border flex flex-col min-w-0">
          <div className="p-3 border-b border-border"><div className="flex items-center gap-2 mb-2"><SearchIcon className="w-4 h-4 text-muted-foreground" /><input className="w-full border border-input rounded-md px-2 py-1 text-sm bg-transparent focus:ring-0" placeholder="Buscar secciones..." /></div></div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-4 text-center text-muted-foreground">Cargando...</div> : tree.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm">No hay secciones. Crea una Parte o Capítulo para comenzar.</div> : renderTree(tree)}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2"><h2 className="text-2xl font-bold">{selected.title}</h2><span className={`px-2 py-1 rounded text-xs font-medium ${selected.type === 'part' ? 'bg-purple-100 text-purple-700' : selected.type === 'chapter' ? 'bg-blue-100 text-blue-700' : selected.type === 'section' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{selected.type}</span></div>
                <p className="text-muted-foreground text-sm">ID: {selected.id} • Posición: {selected.position ?? 0} • Padre: {selected.parentId ?? "Ninguno (raíz)"}</p>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <button onClick={() => setEditingId(selected.id)} className="flex items-center gap-2 px-4 py-2 text-sm text-primary border border-primary/20 rounded-md hover:bg-primary/5"><EditIcon className="w-4 h-4" /> Editar sección</button>
                  <button onClick={() => deleteSection(selected.id!)} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-600/20 rounded-md hover:bg-red-50"><TrashIcon className="w-4 h-4" /> Eliminar sección</button>
                </div>
                {editingId === selected.id && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border/50">
                    <label className="block text-xs font-medium text-muted-foreground mb-2">Nuevo título</label>
                    <input className="w-full border border-input rounded-md px-3 py-2 text-sm" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    <div className="mt-2 flex gap-2">
                      <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Guardar</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-md">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8"><h3 className="text-lg font-semibold mb-3">Evidencias vinculadas</h3><div className="flex items-center justify-between mb-3"><span className="text-sm font-medium text-muted-foreground">Citas y notas asignadas a esta sección</span><button onClick={() => alert("Selector en desarrollo")} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"><PlusIcon className="w-3 h-3 mr-2" /> Agregar evidencia</button></div><div className="space-y-2"><div className="p-4 text-center text-muted-foreground text-sm border border-border/50 rounded">Selecciona una sección para ver y gestionar sus evidencias.</div></div></div>
              <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border/50"><h4 className="text-sm font-medium text-muted-foreground mb-3">Contador de palabras</h4><div className="flex items-center justify-between"><span className="text-sm">Palabras totales:</span><span className="font-mono text-sm">0</span></div><div className="flex items-center justify-between mt-1"><span className="text-sm">Palabras propias:</span><span className="font-mono text-sm">0</span></div><div className="flex items-center justify-between mt-1"><span className="text-sm">Palabras de evidencias:</span><span className="font-mono text-sm">0</span></div></div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><LayoutListIcon className="w-12 h-12 mb-4 opacity-20" /><p>Selecciona una sección del árbol para ver sus detalles</p></div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <div className="bg-card p-6 rounded-lg shadow-lg max-w-md w-full border border-border">
              <h2 className="text-lg font-bold mb-4">Nueva Sección</h2>
              <form onSubmit={(e) => { e.preventDefault(); createSection(); }} className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">Título</label><input className="w-full border border-input rounded-md px-3 py-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">Tipo</label><select className="w-full border border-input rounded-md px-3 py-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}><option value="part">Parte</option><option value="chapter">Capítulo</option><option value="section">Sección</option><option value="subsection">Subsección</option></select></div>
                  <div><label className="block text-sm font-medium mb-1">Padre</label><select className="w-full border border-input rounded-md px-3 py-2" value={form.parentId ?? ""} onChange={(e) => setForm({ ...form, parentId: e.target.value ? parseInt(e.target.value) : undefined })}><option value="">Ninguno (raíz)</option>{tree.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Cancelar</button>
                  <button type="submit" className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50" disabled={loading || !form.title.trim()}>{loading ? "Creando..." : "Crear"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showReport && report && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowReport(false)} />
            <div className="bg-card p-6 rounded-lg shadow-lg max-w-2xl w-full border border-border">
              <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold">Reporte de Cobertura</h2><button onClick={() => setShowReport(false)} className="p-1 text-muted-foreground hover:text-foreground"><span className="sr-only">Cerrar</span><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-3 bg-red-50 rounded-lg border border-red-100"><div className="text-xs text-red-600 font-semibold mb-1">Secciones huérfanas</div><div className="text-2xl font-bold">{report.orphanSections.length}</div></div>
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100"><div className="text-xs text-orange-600 font-semibold mb-1">Fuentes no citadas</div><div className="text-2xl font-bold">{report.uncitedSources.length}</div></div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100"><div className="text-xs text-blue-600 font-semibold mb-1">Capítulos</div><div className="text-2xl font-bold">{report.chapterBalance.length}</div></div>
              </div>
              {report.chapterBalance.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Balance por capítulo:</h4>
                  <table className="w-full text-sm"><thead><tr className="border-b border-border"><th className="text-left py-2">Capítulo</th><th className="text-right py-2">Palabras propias</th><th className="text-right py-2">Palabras evidencia</th><th className="text-right py-2">Total</th><th className="text-right py-2">Progreso</th></tr></thead><tbody>{report.chapterBalance.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50"><td className="py-2">{c.title}</td><td className="py-2 text-right">{c.ownWords}</td><td className="py-2 text-right">{c.evidenceWords}</td><td className="py-2 text-right">{c.totalWords}</td><td className="py-2 text-right">{c.progressPct != null ? c.progressPct + "%" : "-"}</td></tr>
                  ))}</tbody></table>
                </div>
              )}
              <button onClick={() => setShowReport(false)} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 w-full">Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
