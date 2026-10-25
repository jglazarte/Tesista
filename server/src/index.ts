/**
 * Tesista Server - API REST
 * Expone la capa de datos TesistaDB mediante endpoints REST para el frontend.
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { TesistaDB } from "../../src/db.js";
import { renameNoteCascade } from "../../src/cascade.js";
import { renameCitekeyCascade } from "../../src/cascade.js";
import { searchFullText } from "../../src/fts.js";
import { getIntegrityReport } from "../../src/integrity.js";
import { createBackup, isBackupAvailable } from "../../src/backup.js";
import { exportChapter } from "../../src/export.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Instancia de la base de datos (usar ruta absoluta para evitar problemas)
const dbPath = path.resolve(process.cwd(), "../data/tesista.db");
const db = new TesistaDB(dbPath);

// Middleware de logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Middleware de manejo de errores
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: err.message || "Error interno del servidor" });
});

// ===================== SOURCES =====================

// Listar todas las fuentes
app.get("/api/sources", (_req: Request, res: Response) => {
  try {
    const sources = db.listSources();
    res.json(sources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una fuente por ID
app.get("/api/sources/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const source = db.getSource(id);
    if (!source) {
      return res.status(404).json({ error: "Fuente no encontrada" });
    }
    res.json(source);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una fuente por citekey
app.get("/api/sources/citekey/:citekey", (req: Request, res: Response) => {
  try {
    const source = db.getSourceByCitekey(req.params.citekey);
    if (!source) {
      return res.status(404).json({ error: "Fuente no encontrada" });
    }
    res.json(source);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crear una nueva fuente
app.post("/api/sources", (req: Request, res: Response) => {
  try {
    const source = db.createSource(req.body);
    res.status(201).json(source);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Actualizar una fuente
app.put("/api/sources/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const source = db.updateSource(id, req.body);
    if (!source) {
      return res.status(404).json({ error: "Fuente no encontrada" });
    }
    res.json(source);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar una fuente
app.delete("/api/sources/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.deleteSource(id);
    if (!deleted) {
      return res.status(404).json({ error: "Fuente no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== EXCERPTS =====================

// Listar todas las citas o filtrar por fuente
app.get("/api/excerpts", (req: Request, res: Response) => {
  try {
    const sourceId = req.query.sourceId ? parseInt(req.query.sourceId as string, 10) : undefined;
    let excerpts;
    if (sourceId !== undefined) {
      excerpts = db.listExcerptsBySource(sourceId);
    } else {
      excerpts = db.listExcerpts();
    }
    res.json(excerpts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una cita por ID
app.get("/api/excerpts/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const excerpt = db.getExcerpt(id);
    if (!excerpt) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }
    res.json(excerpt);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crear una nueva cita
app.post("/api/excerpts", (req: Request, res: Response) => {
  try {
    const excerpt = db.createExcerpt(req.body);
    res.status(201).json(excerpt);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Actualizar una cita
app.put("/api/excerpts/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const excerpt = db.updateExcerpt(id, req.body);
    if (!excerpt) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }
    res.json(excerpt);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar una cita
app.delete("/api/excerpts/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.deleteExcerpt(id);
    if (!deleted) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== NOTES =====================

// Listar todas las notas
app.get("/api/notes", (_req: Request, res: Response) => {
  try {
    const notes = db.listNotes();
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una nota por ID
app.get("/api/notes/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const note = db.getNote(id);
    if (!note) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }
    res.json(note);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crear una nueva nota
app.post("/api/notes", (req: Request, res: Response) => {
  try {
    const note = db.createNote(req.body);
    res.status(201).json(note);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Actualizar una nota
app.put("/api/notes/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const note = db.updateNote(id, req.body);
    if (!note) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }
    res.json(note);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar una nota
app.delete("/api/notes/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.deleteNote(id);
    if (!deleted) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Enlaces salientes de una nota
app.get("/api/notes/:id/outgoing", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const links = db.getOutgoingLinksResolved(id);
    res.json(links);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backlinks de una nota
app.get("/api/notes/:id/backlinks", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const backlinks = db.getBacklinks(id);
    res.json(backlinks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Menciones no enlazadas de una nota
app.get("/api/notes/:id/unlinked", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mentions = db.findUnlinkedMentions(id);
    res.json(mentions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Buscar notas
app.get("/api/notes/search", (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      return res.status(400).json({ error: "Parámetro 'q' requerido" });
    }
    const notes = db.searchNotes(q);
    res.json(notes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Resolver transclusión
app.get("/api/notes/transclude", (req: Request, res: Response) => {
  try {
    const citekey = req.query.citekey as string;
    const locator = req.query.locator as string;
    if (!citekey || !locator) {
      return res.status(400).json({ error: "Parámetros 'citekey' y 'locator' requeridos" });
    }
    const excerpt = db.resolveTransclusion(citekey, locator);
    if (!excerpt) {
      return res.status(404).json({ error: "Transclusión no encontrada" });
    }
    res.json(excerpt);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== TAGS =====================

// Listar etiquetas
app.get("/api/tags", (req: Request, res: Response) => {
  try {
    const type = req.query.type as any;
    const tags = db.listTags(type);
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crear etiqueta
app.post("/api/tags", (req: Request, res: Response) => {
  try {
    const tag = db.createTag(req.body);
    res.status(201).json(tag);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Vincular etiqueta a ítem
app.post("/api/item-tags", (req: Request, res: Response) => {
  try {
    const link = db.addTagToItem(req.body);
    res.status(201).json(link);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Obtener etiquetas de un ítem
app.get("/api/items/:itemType/:itemId/tags", (req: Request, res: Response) => {
  try {
    const { itemType, itemId } = req.params;
    const tags = db.getTagsForItem(itemType as any, parseInt(itemId, 10));
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== SECTIONS =====================

// Listar todas las secciones
app.get("/api/sections", (_req: Request, res: Response) => {
  try {
    const sections = db.listSections();
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener árbol de secciones
app.get("/api/sections/tree", (_req: Request, res: Response) => {
  try {
    const tree = db.getSectionTree();
    res.json(tree);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Crear sección
app.post("/api/sections", (req: Request, res: Response) => {
  try {
    const section = db.createSection(req.body);
    res.status(201).json(section);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Obtener sección por ID
app.get("/api/sections/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const section = db.getSection(id);
    if (!section) {
      return res.status(404).json({ error: "Sección no encontrada" });
    }
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizar sección
app.put("/api/sections/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const section = db.updateSection(id, req.body);
    if (!section) {
      return res.status(404).json({ error: "Sección no encontrada" });
    }
    res.json(section);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Reordenar sección
app.post("/api/sections/:id/reorder", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { parentId, position } = req.body;
    const ok = db.reorderSection(id, { parentId, position });
    if (!ok) {
      return res.status(404).json({ error: "Sección no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar sección
app.delete("/api/sections/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.deleteSection(id);
    if (!deleted) {
      return res.status(404).json({ error: "Sección no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== EVIDENCIAS =====================

// Vincular evidencia a sección
app.post("/api/evidences", (req: Request, res: Response) => {
  try {
    const evidence = db.addEvidenceToSection(req.body);
    res.status(201).json(evidence);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Listar evidencias de una sección
app.get("/api/sections/:sectionId/evidences", (req: Request, res: Response) => {
  try {
    const sectionId = parseInt(req.params.sectionId, 10);
    const evidences = db.getSectionEvidences(sectionId);
    res.json(evidences);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar evidencia
app.delete("/api/evidences/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = db.removeEvidenceFromSection(id);
    if (!deleted) {
      return res.status(404).json({ error: "Evidencia no encontrada" });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== WORD COUNT =====================

app.get("/api/sections/:id/word-count", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const breakdown = db.countSectionWords(id);
    res.json(breakdown);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== GAP REPORT =====================

app.get("/api/gap-report", (_req: Request, res: Response) => {
  try {
    const report = db.getGapReport();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== MATRIZ DE SÍNTESIS =====================

app.post("/api/matrix", (req: Request, res: Response) => {
  try {
    const { filter, tagType, rowLimit } = req.body;
    const matrix = db.buildMatrix({ filter, tagType, rowLimit });
    res.json(matrix);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== VISTAS GUARDADAS =====================

app.get("/api/views", (_req: Request, res: Response) => {
  try {
    const views = db.listSavedViews();
    res.json(views);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/views", (req: Request, res: Response) => {
  try {
    const view = db.saveView(req.body);
    res.status(201).json(view);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== CASCADA =====================

app.post("/api/cascade/note-title", (req: Request, res: Response) => {
  try {
    const { id, newTitle } = req.body;
    const result = renameNoteCascade(db, id, newTitle);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/cascade/citekey", (req: Request, res: Response) => {
  try {
    const { id, newCitekey } = req.body;
    const result = renameCitekeyCascade(db, id, newCitekey);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ===================== BÚSQUEDA FTS =====================

app.post("/api/search/fts", (req: Request, res: Response) => {
  try {
    const { query, entity, fuzzy, limit, offset } = req.body;
    const results = searchFullText(db, query, { entity, fuzzy, limit, offset });
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== INTEGRIDAD =====================

app.get("/api/integrity", (_req: Request, res: Response) => {
  try {
    const report = getIntegrityReport(db);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== RESPALDOS =====================

app.post("/api/backup", (req: Request, res: Response) => {
  try {
    const { outputPath } = req.body;
    if (!isBackupAvailable()) {
      return res.status(500).json({ error: "Backup no disponible (falta tar)" });
    }
    const result = createBackup(db, outputPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== EXPORTACIÓN =====================

app.post("/api/export/chapter", (req: Request, res: Response) => {
  try {
    const { sectionId, metadata, styleId, includeBibliography, bibliographyPath } = req.body;
    const result = exportChapter(db, sectionId, {
      metadata,
      styleId,
      includeBibliography,
      bibliographyPath,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Tesista Server escuchando en http://localhost:${PORT}`);
  console.log(`Base de datos: ${dbPath}`);
});

export { app };
