/**
 * Tesista - Hito 6
 * Gestión de Renombramientos y Actualización en Cascada.
 *
 * Al modificar el título de una nota o una clave BibTeX (citekey), el sistema
 * escanea y reemplaza automáticamente todas las instancias [[Nota Antigua]] o
 * @claveAntigua en el corpus de notas, manteniendo la trazabilidad de enlaces.
 *
 * Todas las operaciones usan la conexión principal y transacciones de
 * better-sqlite3: no se abre una segunda conexión al mismo archivo.
 */

import { TesistaDB } from "./db.js";

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
  const cleanTitle = newTitle.trim();
  if (!cleanTitle) {
    throw new Error("El nuevo título no puede estar vacío.");
  }
  if (note.title === cleanTitle) {
    return { updatedNotes: 0, replacements: [] };
  }

  const duplicate = db.getNoteByTitle(cleanTitle);
  if (duplicate && duplicate.id !== noteId) {
    throw new Error(`Ya existe otra nota titulada "${cleanTitle}".`);
  }

  const oldTitle = note.title;
  const allNotes = db.listNotes();
  const replacements: CascadeResult["replacements"] = [];

  // Patrones a buscar: [[OldTitle]] y [[OldTitle|Alias]]
  const exactRe = new RegExp(
    `\\[\\[${escapeRegExp(oldTitle)}(\\|[^\\]]*)?\\]\\]`,
    "gi"
  );

  const tx = db.getDb().transaction(() => {
    // 1. Renombrar la nota (updateNote reconstruye sus propios enlaces)
    db.updateNote(noteId, { title: cleanTitle });

    // 2. Reemplazar en todas las notas (incluida la propia si se autorreferencia)
    for (const targetNote of allNotes) {
      if (!targetNote.content || targetNote.id === undefined) continue;
      const matches = targetNote.content.match(exactRe) ?? [];
      if (matches.length === 0) continue;

      const newContent = targetNote.content.replace(exactRe, (match) => {
        const aliasMatch = match.match(/\|([^\]]+)\]\]$/);
        if (aliasMatch) {
          return `[[${cleanTitle}|${aliasMatch[1]}]]`;
        }
        return `[[${cleanTitle}]]`;
      });

      if (newContent !== targetNote.content) {
        db.updateNote(targetNote.id, { content: newContent });
        replacements.push({
          noteId: targetNote.id,
          noteTitle: targetNote.id === noteId ? cleanTitle : targetNote.title,
          oldText: targetNote.content,
          newText: newContent,
          replacementsCount: matches.length,
        });
      }
    }
  });
  tx();

  return {
    updatedNotes: replacements.length,
    replacements,
  };
}

/**
 * Renombra una clave BibTeX (citekey) de una fuente y actualiza en cascada
 * todas las menciones @ViejoClave y transclusiones !@ViejoClave#locator en
 * el corpus de notas.
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
  const cleanCitekey = newCitekey.trim();
  if (!cleanCitekey) {
    throw new Error("La nueva citekey no puede estar vacía.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cleanCitekey)) {
    throw new Error("La citekey solo puede contener letras, números, guiones y guiones bajos.");
  }
  if (oldCitekey === cleanCitekey) {
    return { updatedNotes: 0, replacements: [] };
  }

  const duplicate = db.getSourceByCitekey(cleanCitekey);
  if (duplicate && duplicate.id !== sourceId) {
    throw new Error(`La citekey "${cleanCitekey}" ya está en uso por otra fuente.`);
  }

  const allNotes = db.listNotes();
  const replacements: CascadeResult["replacements"] = [];

  // Patrones: @OldKey, !@OldKey, @OldKey#locator, !@OldKey#locator
  const mentionRe = new RegExp(
    `(!?)@${escapeRegExp(oldCitekey)}(?:#([^\\s\\]]+))?`,
    "g"
  );

  const tx = db.getDb().transaction(() => {
    // 1. Renombrar la citekey en la tabla sources
    db.updateSource(sourceId, { citekey: cleanCitekey });

    // 2. Reemplazar en todas las notas (updateNote reconstruye los links)
    for (const targetNote of allNotes) {
      if (!targetNote.content || targetNote.id === undefined) continue;
      const matches = targetNote.content.match(mentionRe) ?? [];
      if (matches.length === 0) continue;

      const newContent = targetNote.content.replace(mentionRe, (match: string) => {
        const bang = match.startsWith("!") ? "!" : "";
        const locatorMatch = match.match(/#([^\s\]]+)$/);
        if (locatorMatch) {
          return `${bang}@${cleanCitekey}#${locatorMatch[1]}`;
        }
        return `${bang}@${cleanCitekey}`;
      });

      if (newContent !== targetNote.content) {
        db.updateNote(targetNote.id, { content: newContent });
        replacements.push({
          noteId: targetNote.id,
          noteTitle: targetNote.title,
          oldText: targetNote.content,
          newText: newContent,
          replacementsCount: matches.length,
        });
      }
    }

    // 3. Actualizar raw_text de links que apuntaban a la fuente (defensa extra
    //    para notas que no cambiaron de contenido).
    const links = db.getDb()
      .prepare("SELECT * FROM links WHERE target_source_id = ?")
      .all(sourceId) as Array<{ id: number; raw_text: string }>;
    const updateLink = db.getDb().prepare("UPDATE links SET raw_text = ? WHERE id = ?");
    for (const link of links) {
      const newRaw = link.raw_text.replace(
        new RegExp(`(!?)@${escapeRegExp(oldCitekey)}`),
        `$1@${cleanCitekey}`
      );
      if (newRaw !== link.raw_text) updateLink.run(newRaw, link.id);
    }
  });
  tx();

  return {
    updatedNotes: replacements.length,
    replacements,
  };
}

/** Escapa caracteres especiales de una expresión regular. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
