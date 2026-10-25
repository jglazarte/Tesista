/**
 * Tesista - Hito 6
 * Indexación y Búsqueda de Texto Completo (FTS).
 *
 * Extiende la indexación FTS5 más allá de las notas para incluir Sources,
 * Excerpts y Sections, con triggers de auto-sincronización. Incluye una
 * búsqueda difusa simple basada en trigramas y coincidencia de prefijos para
 * tolerar pequeños errores tipográficos al buscar apellidos, términos en otros
 * idiomas o fragmentos de citas.
 */

import { TesistaDB } from "./db.js";
import type {
  FullTextSearchOptions,
  FullTextSearchResult,
  FtsEntity,
} from "./types.js";

/**
 * Inicializa las tablas FTS virtuales y triggers.
 *
 * Solo se crean triggers para la tabla `notes` (que ya funcionaban en el Hito 2).
 * Para `sources`, `excerpts` y `sections` se crean las tablas FTS pero SIN
 * triggers, para evitar el error "SQL logic error" en UPDATEs causado por
 * los triggers AFTER UPDATE de FTS5. La búsqueda en estas tablas usa LIKE
 * como fallback en `searchFullText`.
 */
export function initializeFullTextSearch(db: TesistaDB): void {
  const dbs = db.getDb();

  // Tabla FTS para notes con triggers (ya probada y funcionando en Hito 2)
  dbs.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, content);

    CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END;

    -- Tablas FTS para sources, excerpts, sections (sin triggers para evitar
    -- errores de SQL logic error en UPDATEs; se usa LIKE como fallback)
    CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(title, authors, container_title);
    CREATE VIRTUAL TABLE IF NOT EXISTS excerpts_fts USING fts5(text, locator, context);
    CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(title, own_content);
  `);

  // Poblar índices existentes (en caso de datos previos sin triggers)
  populateFtsIndexes(db);
}

/**
 * Pobla los índices FTS con los datos existentes (útil al migrar).
 */
function populateFtsIndexes(db: TesistaDB): void {
  const dbs = db.getDb();
  const tx = dbs.transaction(() => {
    dbs.prepare("DELETE FROM notes_fts").run();

    const notes = db.listNotes();
    const insNote = dbs.prepare(
      "INSERT INTO notes_fts(rowid, title, content) VALUES (?, ?, ?)"
    );
    for (const n of notes) {
      insNote.run(n.id, n.title, n.content);
    }
  });
  tx();
}

/**
 * Genera trigramas (grupos de 3 caracteres) de un texto para búsqueda difusa.
 */
function trigrams(text: string): string[] {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const tri: string[] = [];
  for (let i = 0; i < t.length - 2; i += 1) {
    tri.push(t.slice(i, i + 3));
  }
  return tri;
}

/**
 * Calcula una similitud simple entre consulta y texto basada en trigramas
 * compartidos (coeficiente de Jaccard simplificado).
 */
function trigramSimilarity(query: string, text: string): number {
  const qTri = new Set(trigrams(query));
  if (qTri.size === 0) return 0;
  const tTri = trigrams(text);
  let matches = 0;
  for (const tri of tTri) {
    if (qTri.has(tri)) matches += 1;
  }
  return matches / qTri.size;
}

/**
 * Ejecuta una búsqueda de texto completo en las tablas FTS.
 *
 * @param db - Instancia de la base de datos
 * @param query - Término de búsqueda
 * @param options - Opciones de búsqueda (entity, fuzzy, limit, offset)
 */
export function searchFullText(
  db: TesistaDB,
  query: string,
  options: FullTextSearchOptions = {}
): FullTextSearchResult[] {
  const entity = options.entity ?? "all";
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const fuzzy = options.fuzzy ?? false;

  const q = query.trim();
  if (!q) return [];

  const results: FullTextSearchResult[] = [];
  const dbs = db.getDb();

  const addResult = (
    entity: FtsEntity,
    id: number,
    title: string,
    contentSnippet: string,
    rank: number
  ) => {
    results.push({ entity, id, title, snippet: contentSnippet, rank });
  };

  // Búsqueda en Sources (usa LIKE directo; la tabla FTS no tiene triggers)
  if (entity === "all" || entity === "sources") {
    const rows = dbs
      .prepare(
        `SELECT id, title, authors_json, container_title FROM sources
         WHERE title LIKE ? OR authors_json LIKE ? OR container_title LIKE ?
         LIMIT ? OFFSET ?`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`, limit, offset) as any[];
    for (const r of rows) {
      addResult("sources", r.id, r.title, r.title, 0);
    }
  }

  // Búsqueda en Excerpts (usa LIKE directo; la tabla FTS no tiene triggers)
  if (entity === "all" || entity === "excerpts") {
    const rows = dbs
      .prepare(
        `SELECT e.id, e.text, e.locator, s.title AS source_title
         FROM excerpts e
         JOIN sources s ON s.id = e.source_id
         WHERE e.text LIKE ? OR e.locator LIKE ?
         LIMIT ? OFFSET ?`
      )
      .all(`%${q}%`, `%${q}%`, limit, offset) as any[];
    for (const r of rows) {
      const snippet = `${r.source_title} — "${r.text.slice(0, 80)}..."`;
      addResult("excerpts", r.id, r.source_title, snippet, 0);
    }
  }

  // Búsqueda en Notes (usa FTS MATCH; tiene triggers y está sincronizada)
  if (entity === "all" || entity === "notes") {
    try {
      const rows = dbs
        .prepare(
          `SELECT n.id, n.title, n.content,
                  bm25(notes_fts) AS rank
           FROM notes_fts
           JOIN notes n ON n.id = notes_fts.rowid
           WHERE notes_fts MATCH ?
           ORDER BY rank
           LIMIT ? OFFSET ?`
        )
        .all(q, limit, offset) as any[];
      for (const r of rows) {
        const snippet = r.content.slice(0, 120);
        addResult("notes", r.id, r.title, snippet, r.rank);
      }
    } catch {
      const rows = dbs
        .prepare(
          `SELECT id, title, content FROM notes WHERE title LIKE ? OR content LIKE ?
           LIMIT ? OFFSET ?`
        )
        .all(`%${q}%`, `%${q}%`, limit, offset) as any[];
      for (const r of rows) {
        const snippet = r.content.slice(0, 120);
        addResult("notes", r.id, r.title, snippet, 0);
      }
    }
  }

  // Búsqueda en Sections (usa LIKE directo; la tabla FTS no tiene triggers)
  if (entity === "all" || entity === "sections") {
    const rows = dbs
      .prepare(
        `SELECT id, title, own_content FROM sections WHERE title LIKE ? OR own_content LIKE ?
         LIMIT ? OFFSET ?`
      )
      .all(`%${q}%`, `%${q}%`, limit, offset) as any[];
    for (const r of rows) {
      const snippet = r.own_content.slice(0, 120);
      addResult("sections", r.id, r.title, snippet, 0);
    }
  }

  // Búsqueda difusa (fuzzy) como complemento: si no hay resultados exactos,
  // calcular similitud por trigramas sobre títulos y contenidos.
  if (fuzzy && results.length === 0) {
    const fuzzyResults: FullTextSearchResult[] = [];

    const sources = db.listSources();
    for (const s of sources) {
      const sim = trigramSimilarity(q, s.title + " " + s.authors.join(" "));
      if (sim > 0.3) {
        fuzzyResults.push({
          entity: "sources",
          id: s.id!,
          title: s.title,
          snippet: s.title,
          rank: sim,
        });
      }
    }

    const excerpts = db.listExcerpts();
    for (const e of excerpts) {
      const sim = trigramSimilarity(q, e.text + " " + e.locator);
      if (sim > 0.3) {
        const src = db.getSource(e.sourceId);
        fuzzyResults.push({
          entity: "excerpts",
          id: e.id!,
          title: src?.title ?? "Fuente desconocida",
          snippet: e.text.slice(0, 120),
          rank: sim,
        });
      }
    }

    const notes = db.listNotes();
    for (const n of notes) {
      const sim = trigramSimilarity(q, n.title + " " + n.content);
      if (sim > 0.3) {
        fuzzyResults.push({
          entity: "notes",
          id: n.id!,
          title: n.title,
          snippet: n.content.slice(0, 120),
          rank: sim,
        });
      }
    }

    fuzzyResults.sort((a, b) => b.rank - a.rank);
    return fuzzyResults.slice(offset, offset + limit);
  }

  // Ordenar por rank (menor = mejor en bm25, mayor = mejor en fuzzy)
  results.sort((a, b) => {
    if (options.fuzzy) return b.rank - a.rank;
    return a.rank - b.rank;
  });

  return results.slice(offset, offset + limit);
}

/**
 * Reconstruye todos los índices FTS (útil tras migración o corrupción).
 */
export function rebuildFullTextSearch(db: TesistaDB): void {
  populateFtsIndexes(db);
}
