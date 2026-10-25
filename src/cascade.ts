/**
 * Tesista - Hito 6
 * Gestión de Renombramientos y Actualización en Cascada.
 *
 * Al modificar el título de una nota o una clave BibTeX (citekey), el sistema
 * escanea y reemplaza automáticamente todas las instancias [[Nota Antigua]] o
 * @claveAntigua en el corpus de notas, manteniendo la trazabilidad de enlaces.
 */

import Database from "better-sqlite3";
import { TesistaDB } from "./db.js";
import type { Link } from "./types.js";

/**
 * Resultado de una operación de cascada.
 */
export interface CascadeResult {
  updatedNotes: number;
  replacements: Array<{
    noteId: number;
    noteTitle: string;
    oldText: string;
    newText: string;
    replacementsCount: number;
  }>;
}

/**
 * Renombra el título de una nota y actualiza en cascada todos los wikilinks
 * [[ViejoTítulo]] y [[ViejoTítulo|Alias]] que apuntan a ella en el corpus.
 *
 * @param db - Instancia de la base de datos
 * @param noteId - ID de la nota a renombrar
 * @param newTitle - Nuevo título
 */
export function renameNoteCascade(
  db: TesistaDB,
  noteId: number,
  newTitle: string
): CascadeResult {
  const note = db.getNote(noteId);
  if (!note) {
    throw new Error(`No existe la nota con id ${noteId}.`);
  }
  const oldTitle = note.title;
  if (oldTitle === newTitle) {
    return { updatedNotes: 0, replacements: [] };
  }

  const allNotes = db.listNotes();
  const replacements: CascadeResult["replacements"] = [];

  // Patrones a buscar: [[OldTitle]] y [[OldTitle|Alias]]
  const exactRe = new RegExp(
    `\\[\\[${escapeRegExp(oldTitle)}(\\|[^\\]]*)?\\]\\]`,
    "g"
  );

  const dbPath = db.getDbPath();
  if (!dbPath) {
    throw new Error("No se pudo determinar la ruta de la base de datos.");
  }
  const dbs = new Database(dbPath);
  dbs.pragma("journal_mode = WAL");
  dbs.pragma("foreign_keys = ON");
  const now = new Date().toISOString();

  try {
    // 1. Renombrar la nota (SQL directo)
    dbs.prepare(`UPDATE notes SET title = ?, updated_at = ? WHERE id = ?`).run(
      newTitle,
      now,
      noteId
    );

    // 2. Reemplazar en todas las notas (incluida la propia si se referencia a sí misma)
    const updateNoteStmt = dbs.prepare(
      `UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`
    );

    for (const targetNote of allNotes) {
      if (!targetNote.content || targetNote.id === undefined) continue;
      const newContent = targetNote.content.replace(exactRe, (match) => {
        const aliasMatch = match.match(/\|([^\]]+)\]\]$/);
        if (aliasMatch) {
          return `[[${newTitle}|${aliasMatch[1]}]]`;
        }
        return `[[${newTitle}]]`;
      });

      if (newContent !== targetNote.content) {
        const count = (targetNote.content.match(exactRe) ?? []).length;
        replacements.push({
          noteId: targetNote.id,
          noteTitle: targetNote.title,
          oldText: targetNote.content,
          newText: newContent,
          replacementsCount: count,
        });
        updateNoteStmt.run(newContent, now, targetNote.id);
      }
    }
  } finally {
    dbs.close();
  }

  return {
    updatedNotes: replacements.length,
    replacements,
  };
}

/**
 * Renombra una clave BibTeX (citekey) de una fuente y actualiza en cascada
 * todas las menciones @ViejoClave y transclusiones !@ViejoClave#locator en
 * el corpus de notas.
 *
 * @param db - Instancia de la base de datos
 * @param sourceId - ID de la fuente cuya citekey cambia
 * @param newCitekey - Nueva citekey
 */
export function renameCitekeyCascade(
  db: TesistaDB,
  sourceId: number,
  newCitekey: string
): CascadeResult {
  const source = db.getSource(sourceId);
  if (!source || !source.id) {
    throw new Error(`No existe la fuente con id ${sourceId}.`);
  }
  const oldCitekey = source.citekey;
  if (oldCitekey === newCitekey) {
    return { updatedNotes: 0, replacements: [] };
  }

  // Verificar que la nueva citekey no exista ya (en otra fuente)
  const existing = db.listCitekeys().filter((k) => k !== oldCitekey);
  if (existing.includes(newCitekey)) {
    throw new Error(
      `La citekey "${newCitekey}" ya está en uso por otra fuente.`
    );
  }

  const allNotes = db.listNotes();
  const replacements: CascadeResult["replacements"] = [];

  // Patrones: @OldKey, !@OldKey, @OldKey#locator, !@OldKey#locator
  const mentionRe = new RegExp(
    `(!?)@${escapeRegExp(oldCitekey)}(?:#([^\\s\\]]+))?`,
    "g"
  );

  const dbPath = db.getDbPath();
  if (!dbPath) {
    throw new Error("No se pudo determinar la ruta de la base de datos.");
  }
  const dbs = new Database(dbPath);
  dbs.pragma("journal_mode = WAL");
  dbs.pragma("foreign_keys = ON");
  const now = new Date().toISOString();

  try {
    // 1. Renombrar la citekey en la tabla sources (SQL directo)
    dbs.prepare(
      `UPDATE sources SET citekey = ?, date_modified = ? WHERE id = ?`
    ).run(newCitekey, now, sourceId);

    // 2. Reemplazar en todas las notas
    const updateNoteStmt = dbs.prepare(
      `UPDATE notes SET content = ?, updated_at = ? WHERE id = ?`
    );

    for (const targetNote of allNotes) {
      if (!targetNote.content || targetNote.id === undefined) continue;
      const newContent = targetNote.content.replace(mentionRe, (match: string) => {
        const bang = match.startsWith("!") ? "!" : "";
        const locatorMatch = match.match(/#([^\s\]]+)$/);
        if (locatorMatch) {
          return `${bang}@${newCitekey}#${locatorMatch[1]}`;
        }
        return `${bang}@${newCitekey}`;
      });

      if (newContent !== targetNote.content) {
        const count = (targetNote.content.match(mentionRe) ?? []).length;
        replacements.push({
          noteId: targetNote.id,
          noteTitle: targetNote.title,
          oldText: targetNote.content,
          newText: newContent,
          replacementsCount: count,
        });
        updateNoteStmt.run(newContent, now, targetNote.id);
      }
    }

    // 3. Actualizar raw_text de los links cite_mention/transclusion
    const links = dbs.prepare("SELECT * FROM links").all() as Link[];
    const updateLinkStmt = dbs.prepare(
      `UPDATE links SET raw_text = ? WHERE id = ?`
    );

    for (const link of links) {
      if (link.id === undefined || link.sourceNoteId === undefined) continue;
      if (
        (link.linkType === "cite_mention" ||
          link.linkType === "transclusion") &&
        link.targetSourceId === sourceId
      ) {
        const newRaw = link.rawText.replace(
          new RegExp(`(!?)@${escapeRegExp(oldCitekey)}`),
          `$1@${newCitekey}`
        );
        if (newRaw !== link.rawText) {
          updateLinkStmt.run(newRaw, link.id);
        }
      }
    }
  } finally {
    dbs.close();
  }

  return {
    updatedNotes: replacements.length,
    replacements,
  };
}

/**
 * Escapa caracteres especiales de una expresión regular.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
