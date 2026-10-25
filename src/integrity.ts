/**
 * Tesista - Hito 6
 * Diagnóstico de Integridad: Enlaces Rotos / Huérfanos.
 *
 * Escanea el corpus y lista los punteros que apuntan a notas o fuentes
 * inexistentes, permitiendo su reparación manual o reconexión.
 */

import { TesistaDB } from "./db.js";
import type {
  BrokenLink,
  BrokenLinkType,
  IntegrityReport,
} from "./types.js";

/**
 * Ejecuta una verificación completa de integridad del corpus.
 *
 * Detecta:
 *   - Wikilinks [[...]] que apuntan a notas inexistentes
 *   - Menciones @citekey y transclusiones !@citekey#loc a fuentes inexistentes
 *   - Transclusiones !@citekey#loc donde el localizador no coincide con ningún excerpt
 *   - Secciones huérfanas (sin evidencias)
 *   - Fuentes con estado 'filed' sin excerpts vinculados a ninguna sección
 *   - Claves BibTeX duplicadas (defensa en profundidad)
 */
export function getIntegrityReport(db: TesistaDB): IntegrityReport {
  const brokenLinks: BrokenLink[] = [];
  const allLinks = db.getAllLinks();

  for (const link of allLinks) {
    if (link.linkType === "wikilink") {
      if (link.targetNoteId === null) {
        const targetNote = db.getNoteByTitle(link.rawText.replace(/^\[\[(.+)\]\]$/, "$1").split("|")[0]);
        if (!targetNote) {
          if (link.id === undefined || link.sourceNoteId === undefined) continue;
          brokenLinks.push({
            id: link.id,
            sourceNoteId: link.sourceNoteId,
            sourceNoteTitle: db.getNote(link.sourceNoteId)?.title ?? "desconocida",
            linkType: "wikilink_to_missing_note",
            rawText: link.rawText,
            target: link.rawText,
          });
        }
      }
    } else if (
      link.linkType === "cite_mention" ||
      link.linkType === "transclusion"
    ) {
      if (link.targetSourceId === null) {
        // Extraer citekey del raw_text
        const m = link.rawText.match(/!?@([A-Za-z0-9_\-]+)/);
        const citekey = m ? m[1] : link.rawText;
        const source = db.getSourceByCitekey(citekey);
        if (!source) {
          if (link.id === undefined || link.sourceNoteId === undefined) continue;
          brokenLinks.push({
            id: link.id,
            sourceNoteId: link.sourceNoteId,
            sourceNoteTitle: db.getNote(link.sourceNoteId)?.title ?? "desconocida",
            linkType:
              link.linkType === "transclusion"
                ? "transclusion_to_missing_source"
                : "cite_mention_to_missing_source",
            rawText: link.rawText,
            target: citekey,
          });
        } else if (link.linkType === "transclusion") {
          // Verificar que el localizador exista en la fuente
          const locatorM = link.rawText.match(/#([^\s\]]+)$/);
          if (locatorM && source.id) {
            const locator = locatorM[1];
            const excerpts = db.listExcerptsBySource(source.id);
            const hasLocator = excerpts.some((e) => e.locator === locator);
            if (!hasLocator) {
              if (link.id === undefined || link.sourceNoteId === undefined) continue;
              brokenLinks.push({
                id: link.id,
                sourceNoteId: link.sourceNoteId,
                sourceNoteTitle: db.getNote(link.sourceNoteId)?.title ?? "desconocida",
                linkType: "transclusion_to_missing_excerpt",
                rawText: link.rawText,
                target: citekey,
                locator,
              });
            }
          }
        }
      }
    }
  }

  // Secciones huérfanas (reutiliza lógica del gap report)
  const allSections = db.listSections();
  const orphanSections: IntegrityReport["orphanSections"] = [];
  for (const s of allSections) {
    if (!s.id) continue;
    const evs = db.getSectionEvidences(s.id);
    if (evs.length === 0) {
      orphanSections.push({
        id: s.id,
        title: s.title,
        path: getSectionPath(db, s.id),
      });
    }
  }

  // Fuentes filed no citadas
  const sources = db.listSources();
  const uncitedFiledSources: IntegrityReport["uncitedFiledSources"] = [];
  for (const source of sources) {
    if (source.readStatus !== "filed" || !source.id) continue;
    const excerpts = db.listExcerptsBySource(source.id);
    let cited = false;
    for (const e of excerpts) {
      if (!e.id) continue;
      const row = db
        .getDb()
        .prepare(
          `SELECT 1 FROM section_evidences WHERE evidence_type = 'excerpt' AND evidence_id = ? LIMIT 1`
        )
        .get(e.id) as any | undefined;
      if (row) {
        cited = true;
        break;
      }
    }
    if (!cited) {
      uncitedFiledSources.push({
        id: source.id,
        title: source.title,
        citekey: source.citekey,
      });
    }
  }

  // Citekeys duplicados (defensa en profundidad; la BD ya impide UNIQUE)
  const citekeyCounts = new Map<string, number>();
  for (const s of sources) {
    const c = citekeyCounts.get(s.citekey) ?? 0;
    citekeyCounts.set(s.citekey, c + 1);
  }
  const duplicateCitekeys: IntegrityReport["duplicateCitekeys"] = [];
  for (const [citekey, count] of citekeyCounts.entries()) {
    if (count > 1) {
      duplicateCitekeys.push({ citekey, count });
    }
  }

  return {
    brokenLinks,
    orphanSections,
    uncitedFiledSources,
    duplicateCitekeys,
  };
}

/**
 * Repara un enlace roto apuntando a una nota existente por título.
 * Busca la nota con el título dado y actualiza el link.
 */
export function repairWikilinkToNote(
  db: TesistaDB,
  linkId: number,
  targetNoteTitle: string
): boolean {
  const link = db.getAllLinks().find((l) => l.id === linkId);
  if (!link || link.linkType !== "wikilink") return false;

  const targetNote = db.getNoteByTitle(targetNoteTitle);
  if (!targetNote || !targetNote.id) return false;

  const newRaw = `[[${targetNoteTitle}]]`;
  db.getDb()
    .prepare(
      `UPDATE links SET target_note_id = ?, target_source_id = NULL, raw_text = ? WHERE id = ?`
    )
    .run(targetNote.id, newRaw, linkId);
  return true;
}

/**
 * Repara un enlace roto apuntando a una fuente existente por citekey.
 */
export function repairCiteMentionToSource(
  db: TesistaDB,
  linkId: number,
  targetCitekey: string
): boolean {
  const link = db.getAllLinks().find((l) => l.id === linkId);
  if (!link) return false;

  const source = db.getSourceByCitekey(targetCitekey);
  if (!source || !source.id) return false;

  const isTransclusion = link.linkType === "transclusion";
  const locatorM = link.rawText.match(/#([^\s\]]+)$/);
  const locator = locatorM ? locatorM[1] : undefined;
  const newRaw = isTransclusion
    ? `!@${targetCitekey}${locator ? "#" + locator : ""}`
    : `@${targetCitekey}`;

  db.getDb()
    .prepare(
      `UPDATE links SET target_note_id = NULL, target_source_id = ?, raw_text = ? WHERE id = ?`
    )
    .run(source.id, newRaw, linkId);
  return true;
}

/* ===================== Helpers privados ===================== */

/**
 * Devuelve la ruta jerárquica de una sección (ej. "Parte I > Capítulo 2").
 */
function getSectionPath(db: TesistaDB, sectionId: number): string {
  const parts: string[] = [];
  let current = db.getSection(sectionId);
  while (current) {
    parts.unshift(current.title);
    current = current.parentId ? db.getSection(current.parentId) : null;
  }
  return parts.join(" > ");
}
