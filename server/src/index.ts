/**
 * Tesista Server - API REST
 * Expone la capa de datos TesistaDB mediante endpoints REST para el frontend.
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { TesistaDB } from "../../src/db.js";
import { renameNoteCascade } from "../../src/cascade.js";
import { renameCitekeyCascade } from "../../src/cascade.js";
import { searchFullText } from "../../src/fts.js";
import { getIntegrityReport } from "../../src/integrity.js";
import { createBackup, isBackupAvailable, listBackups, restoreBackupToDatabase } from "../../src/backup.js";
import { exportChapter, saveAndConvert } from "../../src/export.js";
import { resolveSourceFromCrossRef } from "../../src/crossref.js";
import { fetchOpenAlexByDoi } from "../../src/openalex.js";
import {
  isGitAvailable,
  isGitRepo,
  gitStatus,
  gitLog,
  gitCommit,
  gitDiff,
  gitRemote,
  gitBranch,
  gitSetRemote,
  gitPush,
  gitPull,
  gitRestoreCommit,
  gitIsTracked,
  gitIsIgnored,
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
let db = new TesistaDB(dbPath);

// Directorio raíz de la aplicación (valor por defecto del workspace).
const projectRoot = path.resolve(process.cwd(), "..");

/* ===================== Workspace configurable ===================== */

type WorkspaceSource = "settings" | "env" | "default";

interface ResolvedWorkspace {
  /** Ruta efectiva usada para Git, respaldos y exportaciones. */
  path: string;
  /** De dónde proviene la ruta efectiva. */
  source: WorkspaceSource;
  /** Valor configurado desde la interfaz (aunque ya no exista). */
  configured: string | null;
  warning?: string;
}

/** Expande `~` y resuelve rutas relativas contra la raíz de la aplicación. */
function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(projectRoot, trimmed);
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isWritableDirectory(target: string): boolean {
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve el workspace efectivo con esta precedencia:
 *   1. Configuración guardada desde la interfaz (si la carpeta existe).
 *   2. Variable de entorno TESISTA_WORKSPACE.
 *   3. Carpeta de la aplicación.
 */
function resolveWorkspace(): ResolvedWorkspace {
  const configuredRaw = db.getSetting("workspace_path");
  if (configuredRaw) {
    const resolved = expandUserPath(configuredRaw);
    if (isDirectory(resolved)) {
      return { path: resolved, source: "settings", configured: resolved };
    }
    return {
      path: projectRoot,
      source: "default",
      configured: resolved,
      warning: `La carpeta configurada (${resolved}) no está disponible; se usa la carpeta de la aplicación.`,
    };
  }

  const envRaw = process.env.TESISTA_WORKSPACE;
  if (envRaw && envRaw.trim().length > 0) {
    const resolved = expandUserPath(envRaw);
    if (isDirectory(resolved)) {
      return { path: resolved, source: "env", configured: null };
    }
  }

  return { path: projectRoot, source: "default", configured: null };
}

/** Describe el workspace y el estado de su repositorio para la interfaz. */
function workspaceInfo() {
  const ws = resolveWorkspace();
  const exists = isDirectory(ws.path);
  const repo = exists && isGitRepo(ws.path);
  const configuredRemote = db.getSetting("git_remote");
  const repoRemote = repo ? gitRemote(ws.path) : null;

  return {
    path: ws.path,
    source: ws.source,
    configured: ws.configured,
    defaultPath: projectRoot,
    exists,
    writable: exists && isWritableDirectory(ws.path),
    isGitRepo: repo,
    gitAvailable: isGitAvailable(),
    branch: repo ? gitBranch(ws.path) : null,
    remote: repoRemote ?? configuredRemote ?? null,
    remoteConfigured: configuredRemote ?? null,
    remoteMatchesConfig:
      configuredRemote === null ? null : repoRemote === configuredRemote,
    backupsDir: path.join(ws.path, "backups"),
    exportDir: path.join(ws.path, "export"),
    warning: ws.warning ?? null,
  };
}

/**
 * Valida una URL de remoto. Devuelve `null` para "sin remoto",
 * `undefined` si el valor es inválido y el string limpio si es válido.
 */
function normalizeRemoteUrl(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  if (url.length === 0) return null;
  if (/[\r\n\t]/.test(url) || /\s/.test(url)) return undefined;
  if (url.startsWith("-")) return undefined;
  return url;
}

/** Resuelve una ruta de salida: absoluta tal cual, relativa al workspace. */
function resolveOutputPath(requested: string, workspace: string): string {
  return path.isAbsolute(requested)
    ? path.normalize(requested)
    : path.resolve(workspace, requested);
}

/** Texto legible para cualquier valor lanzado como error. */
function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Vuelca el WAL al archivo principal antes de un commit. Sin esto, un commit
 * podría guardar una versión desactualizada de la base SQLite.
 */
function checkpointDatabase(): void {
  try {
    db.getDb().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // Si falla, el commit sigue; solo se pierde precisión en la instantánea.
  }
}

/**
 * Ejecuta una operación que puede reemplazar archivos del workspace con la
 * base SQLite cerrada.
 *
 * Cerrar la base fuerza el checkpoint del WAL y evita que Git reemplace el
 * archivo mientras SQLite lo tiene abierto. Al terminar se reabre y se
 * conservan `workspace_path` y `git_remote`, que son específicos de cada
 * dispositivo y no deberían viajar al restaurar datos de otra máquina.
 */
function withDatabaseClosed<T>(action: () => T): T {
  let preserveWorkspace: string | null = null;
  let preserveRemote: string | null = null;
  try {
    preserveWorkspace = db.getSetting("workspace_path");
    preserveRemote = db.getSetting("git_remote");
  } catch {
    // Si no se pueden leer, se usan los valores de la base restaurada.
  }

  let actionResult: T | undefined;
  let actionError: unknown;
  try {
    db.close();
  } catch (err) {
    actionError = err;
  }

  if (!actionError) {
    try {
      actionResult = action();
    } catch (err) {
      actionError = err;
    }
  }

  let reopenError: unknown;
  try {
    db = new TesistaDB(dbPath);
    if (db.getSetting("workspace_path") !== preserveWorkspace) {
      db.setSetting("workspace_path", preserveWorkspace);
    }
    if (db.getSetting("git_remote") !== preserveRemote) {
      db.setSetting("git_remote", preserveRemote);
    }
  } catch (err) {
    reopenError = err;
  }

  if (reopenError) {
    const detail = actionError
      ? `Error original: ${errorText(actionError)}. `
      : "";
    throw new Error(
      `${detail}No se pudo reabrir la base de datos (${dbPath}): ${errorText(reopenError)}`
    );
  }
  if (actionError) throw actionError;
  return actionResult as T;
}

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

// ===================== WORKSPACE (repositorio de trabajo) =====================

app.get("/api/workspace", (_req: Request, res: Response) => {
  try {
    res.json(workspaceInfo());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/workspace", (req: Request, res: Response) => {
  try {
    const raw = req.body?.path;

    // `null` o cadena vacía: volver a la carpeta de la aplicación.
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
      db.setSetting("workspace_path", null);
      return res.json({ success: true, reset: true, ...workspaceInfo() });
    }

    if (typeof raw !== "string") {
      return res.status(400).json({ error: "La ruta debe ser una cadena de texto." });
    }
    if (/[\r\n]/.test(raw)) {
      return res.status(400).json({ error: "La ruta contiene caracteres inválidos." });
    }

    const resolved = expandUserPath(raw);
    if (!isDirectory(resolved)) {
      return res.status(400).json({
        error: `La carpeta no existe o no es un directorio: ${resolved}`,
      });
    }
    if (!isWritableDirectory(resolved)) {
      return res.status(400).json({
        error: `La carpeta no tiene permisos de escritura: ${resolved}`,
      });
    }

    db.setSetting("workspace_path", resolved);

    // Si ya hay un remoto configurado y la carpeta es un repositorio,
    // se aplica de inmediato para que el panel muestre el destino correcto.
    const configuredRemote = db.getSetting("git_remote");
    if (configuredRemote && isGitRepo(resolved)) {
      try {
        gitSetRemote(resolved, configuredRemote);
      } catch (err: any) {
        console.warn("No se pudo aplicar el remoto configurado:", err?.message ?? err);
      }
    }

    res.json({ success: true, ...workspaceInfo() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/workspace/remote", (req: Request, res: Response) => {
  try {
    const url = normalizeRemoteUrl(req.body?.url);
    if (url === undefined) {
      return res.status(400).json({
        error: "La URL del remoto no es válida. Ejemplo: https://github.com/usuario/repositorio.git",
      });
    }

    db.setSetting("git_remote", url);

    const ws = resolveWorkspace();
    let applied = false;
    if (url && isGitRepo(ws.path)) {
      gitSetRemote(ws.path, url);
      applied = true;
    }

    res.json({ success: true, applied, ...workspaceInfo() });
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
    const ws = resolveWorkspace();
    // Ruta por defecto: <workspace>/backups/tesista-<fecha>.tar.gz
    const requested = req.body?.outputPath;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath =
      typeof requested === "string" && requested.trim().length > 0
        ? resolveOutputPath(requested.trim(), ws.path)
        : path.join(ws.path, "backups", `tesista-${stamp}.tar.gz`);
    const result = createBackup(db, outputPath);

    // Commit y push opcionales del respaldo dentro del workspace.
    const doCommit = req.body?.commit === true;
    const doPush = req.body?.push === true;
    let git:
      | {
          commit: {
            success: boolean;
            message: string;
            hash?: string;
            error?: string;
            backupTracked?: boolean;
          };
          push?: { success: boolean; message?: string; error?: string };
        }
      | undefined;

    if (doCommit || doPush) {
      const message =
        typeof req.body?.message === "string" && req.body.message.trim().length > 0
          ? req.body.message.trim()
          : "Respaldo Tesista";

      if (!isGitRepo(ws.path)) {
        git = {
          commit: {
            success: false,
            message,
            error: `El workspace no es un repositorio Git: ${ws.path}`,
          },
        };
      } else {
        const relativePath = path.relative(ws.path, outputPath);
        const outsideRepo =
          relativePath.startsWith("..") || path.isAbsolute(relativePath);
        const ignored = !outsideRepo && gitIsIgnored(ws.path, relativePath);

        if (outsideRepo) {
          git = {
            commit: {
              success: false,
              message,
              error: `El respaldo se guardó fuera del repositorio (${outputPath}), así que no puede versionarse.`,
            },
          };
        } else if (ignored) {
          git = {
            commit: {
              success: false,
              message,
              error: `La ruta "${relativePath}" está ignorada por .gitignore; el respaldo no se versionó.`,
            },
          };
        } else {
          ensureGitUser(ws.path);
          checkpointDatabase();
          const commit = gitCommit(ws.path, message);
          const backupTracked = commit.success
            ? gitIsTracked(ws.path, relativePath)
            : false;
          git = { commit: { ...commit, backupTracked } };
          if (commit.success && doPush) {
            git.push = gitPush(ws.path);
          }
        }
      }
    }

    res.json({ ...result, git });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Lista los respaldos disponibles en <workspace>/backups. */
app.get("/api/backups", (_req: Request, res: Response) => {
  try {
    const ws = resolveWorkspace();
    res.json(listBackups(path.join(ws.path, "backups")));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Restaura la base de datos activa desde un respaldo.
 * Antes de reemplazarla se guarda una copia de la base actual.
 */
app.post("/api/backups/restore", (req: Request, res: Response) => {
  try {
    if (!isBackupAvailable()) {
      return res.status(500).json({ error: "Backup no disponible (falta tar)" });
    }
    const requested = req.body?.path;
    if (typeof requested !== "string" || requested.trim().length === 0) {
      return res.status(400).json({ error: "Se requiere la ruta de un respaldo." });
    }

    const ws = resolveWorkspace();
    const backupPath = resolveOutputPath(requested.trim(), ws.path);
    const result = withDatabaseClosed(() =>
      restoreBackupToDatabase(backupPath, dbPath)
    );

    res.json({
      success: true,
      ...result,
      workspace: ws.path,
      message: "Respaldo restaurado en la base de datos activa.",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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
      const ws = resolveWorkspace();
      const dir =
        typeof outputDir === "string" && outputDir.trim().length > 0
          ? resolveOutputPath(outputDir.trim(), ws.path)
          : path.join(ws.path, "export");
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
    const ws = resolveWorkspace();
    res.json({
      available: isGitAvailable(),
      workspace: ws.path,
      ...gitStatus(ws.path),
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
    res.json(gitLog(resolveWorkspace().path, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/git/diff", (req: Request, res: Response) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const file = req.query.file as string | undefined;
    res.json({ diff: gitDiff(resolveWorkspace().path, { from, to, file }) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/commit", (req: Request, res: Response) => {
  try {
    const ws = resolveWorkspace();
    // El mensaje vacío se completa en gitCommit con «Tesista: instantánea»
    // y la fecha/hora local.
    const message =
      typeof req.body?.message === "string" ? req.body.message.trim() : "";
    ensureGitUser(ws.path);
    checkpointDatabase();
    const result = gitCommit(ws.path, message);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ ...result, workspace: ws.path });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/init", (_req: Request, res: Response) => {
  try {
    if (!isGitAvailable()) {
      return res.status(500).json({ error: "Git no está instalado en el sistema." });
    }
    const ws = resolveWorkspace();
    ensureGitRepo(ws.path);

    // Aplicar el remoto configurado, si existe.
    const configuredRemote = db.getSetting("git_remote");
    if (configuredRemote) {
      gitSetRemote(ws.path, configuredRemote);
    }

    res.json({
      success: true,
      workspace: ws.path,
      ...gitStatus(ws.path),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/push", (req: Request, res: Response) => {
  try {
    const ws = resolveWorkspace();
    if (!isGitRepo(ws.path)) {
      return res.status(400).json({
        success: false,
        error: `El workspace no es un repositorio Git: ${ws.path}`,
      });
    }
    const branch =
      typeof req.body?.branch === "string" && req.body.branch.trim().length > 0
        ? req.body.branch.trim()
        : undefined;

    // Push automático: si hay cambios pendientes, primero se guarda un commit
    // con fecha y hora. `commit: false` permite forzar un push sin commitear.
    let commit: ReturnType<typeof gitCommit> | undefined;
    if (req.body?.commit !== false) {
      checkpointDatabase();
      if (!gitStatus(ws.path).clean) {
        ensureGitUser(ws.path);
        commit = gitCommit(
          ws.path,
          typeof req.body?.message === "string" ? req.body.message.trim() : ""
        );
        if (!commit.success) {
          return res.status(400).json({
            success: false,
            error: commit.error ?? "No se pudieron guardar los cambios antes de subir.",
            commit,
          });
        }
      }
    }

    const result = gitPush(ws.path, { branch });
    if (!result.success) {
      const saved =
        commit?.success && commit.hash
          ? ` Los cambios quedaron guardados en el commit local ${commit.hash.slice(0, 8)}.`
          : "";
      return res.status(400).json({
        ...result,
        error: `${result.error ?? "No se pudo subir al remoto."}${saved}`,
        commit,
      });
    }
    res.json({ ...result, commit });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/pull", (req: Request, res: Response) => {
  try {
    if (!isGitAvailable()) {
      return res.status(500).json({ error: "Git no está instalado en el sistema." });
    }
    const ws = resolveWorkspace();
    if (!isGitRepo(ws.path)) {
      return res.status(400).json({
        success: false,
        error: `El workspace no es un repositorio Git: ${ws.path}`,
      });
    }

    const branch =
      typeof req.body?.branch === "string" && req.body.branch.trim().length > 0
        ? req.body.branch.trim()
        : undefined;
    const mode = req.body?.mode === "reset" ? "reset" : "ff-only";

    // La base se cierra durante el pull: Git puede reemplazar data/tesista.db
    // cuando vive dentro del repositorio.
    const result = withDatabaseClosed(() => gitPull(ws.path, { branch, mode }));
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ ...result, workspace: ws.path });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/git/restore", (req: Request, res: Response) => {
  try {
    const ws = resolveWorkspace();
    if (!isGitRepo(ws.path)) {
      return res.status(400).json({
        success: false,
        error: `El workspace no es un repositorio Git: ${ws.path}`,
      });
    }

    const commit = req.body?.commit;
    if (typeof commit !== "string" || commit.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Se requiere el hash del commit a restaurar.",
      });
    }

    const result = withDatabaseClosed(() =>
      gitRestoreCommit(ws.path, commit.trim())
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json({ ...result, workspace: ws.path });
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
  const ws = resolveWorkspace();
  console.log(`Tesista Server escuchando en http://${HOST}:${PORT}`);
  console.log(`Base de datos: ${dbPath}`);
  console.log(`Workspace (${ws.source}): ${ws.path}`);
  if (ws.warning) console.warn(`Aviso: ${ws.warning}`);
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
