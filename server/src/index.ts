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
import { exportChapter, saveAndConvert } from "../../src/export.js";
import { resolveSourceFromCrossRef } from "../../src/crossref.js";
import { fetchOpenAlexByDoi } from "../../src/openalex.js";
import {
  isGitAvailable,
  gitStatus,
  gitLog,
  gitCommit,
  gitDiff,
  ensureGitRepo,
  ensureGitUser,
} from "../../src/git.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Instancia de la base de datos. TESISTA_DB permite fijar una ruta explícita.
const dbPath = process.env.TESISTA_DB
  ? path.resolve(process.env.TESISTA_DB)
  : path.resolve(process.cwd(), "../data/tesista.db");
const db = new TesistaDB(dbPath);

// Directorio raíz del proyecto (para Git y respaldos)
const projectRoot = path.resolve(process.cwd(), "..");

// Middleware de logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/** Convierte un parámetro de ruta en entero positivo; responde 400 si es inválido. */
function parseId(value: string, res: Response): number | null {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: `Identificador inválido: "${value}".` });
    return null;
  }
  return id;
}

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

// Obtener una nota por ID (solo numérico, para no tapar /search y /transclude)
app.get("/api/notes/:id(\\d+)", (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
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

// Crear (o recuperar, si ya existe por nombre) una etiqueta
app.post("/api/tags", (req: Request, res: Response) => {
  try {
    const { name, type } = req.body ?? {};
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "El nombre de la etiqueta es obligatorio." });
    }
    const tag = db.ensureTag(name, type);
    res.status(201).json(tag);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Actualizar una etiqueta
app.put("/api/tags/:id", (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const tag = db.updateTag(id, req.body);
    if (!tag) return res.status(404).json({ error: "Etiqueta no encontrada" });
    res.json(tag);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar una etiqueta (y sus vínculos)
app.delete("/api/tags/:id", (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const deleted = db.deleteTag(id);
    if (!deleted) return res.status(404).json({ error: "Etiqueta no encontrada" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vincular etiqueta a ítem mediante tagId
app.post("/api/item-tags", (req: Request, res: Response) => {
  try {
    const link = db.addTagToItem(req.body);
    res.status(201).json(link);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Quitar un vínculo ítem-etiqueta por su id
app.delete("/api/item-tags/:id", (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id, res);
    if (id === null) return;
    const link = db.getItemTag(id);
    if (!link) return res.status(404).json({ error: "Vínculo no encontrado" });
    const removed = db.removeTagFromItem(link.itemType, link.itemId, link.tagId);
    if (!removed) return res.status(404).json({ error: "Vínculo no encontrado" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener etiquetas de un ítem
app.get("/api/items/:itemType/:itemId/tags", (req: Request, res: Response) => {
  try {
    const { itemType } = req.params;
    const itemId = parseId(req.params.itemId, res);
    if (itemId === null) return;
    const tags = db.getTagsForItem(itemType as any, itemId);
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reemplazar el conjunto completo de etiquetas de un ítem (por nombre)
app.put("/api/items/:itemType/:itemId/tags", (req: Request, res: Response) => {
  try {
    const { itemType } = req.params;
    const itemId = parseId(req.params.itemId, res);
    if (itemId === null) return;
    const names = req.body?.tags;
    if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
      return res.status(400).json({ error: "Se esperaba { tags: string[] }." });
    }
    const tags = db.setTagsForItem(itemType as any, itemId, names);
    res.json(tags);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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

// ===================== ESTADÍSTICAS =====================

app.get("/api/stats", (_req: Request, res: Response) => {
  try {
    res.json(db.getStats());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== RESPALDOS =====================

app.post("/api/backup", (req: Request, res: Response) => {
  try {
    if (!isBackupAvailable()) {
      return res.status(500).json({ error: "Backup no disponible (falta tar)" });
    }
    // Ruta por defecto: backups/tesista-<fecha>.tar.gz dentro del proyecto.
    const requested = req.body?.outputPath;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath =
      typeof requested === "string" && requested.trim().length > 0
        ? path.resolve(requested)
        : path.join(projectRoot, "backups", `tesista-${stamp}.tar.gz`);
    const result = createBackup(db, outputPath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== EXPORTACIÓN =====================

app.post("/api/export/chapter", async (req: Request, res: Response) => {
  try {
    const {
      sectionId,
      metadata,
      styleId,
      includeBibliography,
      bibliographyPath,
      save = false,
      outputDir,
      format = "markdown",
    } = req.body ?? {};

    const id = Number.parseInt(String(sectionId), 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "sectionId inválido." });
    }

    const result = exportChapter(db, id, {
      metadata,
      styleId,
      includeBibliography,
      bibliographyPath,
    });

    let outputPath: string | undefined;
    if (save) {
      const dir =
        typeof outputDir === "string" && outputDir.trim().length > 0
          ? path.resolve(outputDir)
          : path.join(projectRoot, "export");
      outputPath = await saveAndConvert(result, dir, format);
    }

    res.json({ ...result, outputPath: outputPath ?? result.outputPath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== GIT =====================

app.get("/api/git/status", (_req: Request, res: Response) => {
  try {
    res.json({
      available: isGitAvailable(),
      ...gitStatus(projectRoot),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/git/log", (req: Request, res: Response) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
      200
    );
    res.json(gitLog(projectRoot, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/git/diff", (req: Request, res: Response) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const file = req.query.file as string | undefined;
    res.json({ diff: gitDiff(projectRoot, { from, to, file }) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/commit", (req: Request, res: Response) => {
  try {
    const message =
      typeof req.body?.message === "string" && req.body.message.trim().length > 0
        ? req.body.message.trim()
        : `Tesista: instantánea ${new Date().toISOString()}`;
    ensureGitUser(projectRoot);
    const result = gitCommit(projectRoot, message);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/init", (_req: Request, res: Response) => {
  try {
    if (!isGitAvailable()) {
      return res.status(500).json({ error: "Git no está instalado en el sistema." });
    }
    ensureGitRepo(projectRoot);
    res.json({ success: true, ...gitStatus(projectRoot) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== IMPORTACIÓN POR DOI =====================

app.post("/api/sources/import-doi", async (req: Request, res: Response) => {
  try {
    const raw = req.body?.doi;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return res.status(400).json({ error: "Se requiere un DOI." });
    }
    const doi = raw
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim();

    // Si ya existe una fuente con ese DOI, no se duplica.
    const existing = db.getSourceByDoi(doi);
    if (existing) {
      return res.status(200).json({ source: existing, existing: true });
    }

    // 1) CrossRef; 2) OpenAlex como respaldo.
    let partial = await resolveSourceFromCrossRef(doi);
    if (!partial || !partial.title) {
      partial = (await fetchOpenAlexByDoi(doi)) as typeof partial;
    }
    if (!partial || !partial.title) {
      return res.status(404).json({
        error: "No se encontraron metadatos para ese DOI. Podés cargar la fuente manualmente.",
      });
    }

    const source = db.createSource({
      title: partial.title,
      authors: partial.authors ?? [],
      year: partial.year,
      doi,
      isbn: partial.isbn,
      publisher: partial.publisher,
      containerTitle: partial.containerTitle,
      bibtexType: partial.bibtexType ?? "article",
      readStatus: "unread",
      notes: partial.notes,
    });
    res.status(201).json({ source, existing: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== MANTENIMIENTO =====================

app.post("/api/maintenance/vacuum", (_req: Request, res: Response) => {
  try {
    db.vacuum();
    res.json({ success: true, ...db.getStats() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== 404 Y MANEJO DE ERRORES =====================

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err?.message ?? err);
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message || "Error interno del servidor" });
});

// Iniciar servidor
const server = app.listen(PORT, HOST, () => {
  console.log(`Tesista Server escuchando en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Raíz del proyecto: ${projectRoot}`);
});

function shutdown(signal: string): void {
  console.log(`\n${signal} recibido: cerrando servidor...`);
  server.close(() => {
    try {
      db.close();
    } catch (err: any) {
      console.error("Error al cerrar la base de datos:", err?.message ?? err);
    }
    process.exit(0);
  });
  // Si el cierre ordenado tarda demasiado, forzar salida.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { app };
