/**
 * Tesista - Hito 1
 * Capa de persistencia SQLite local.
 *
 * Tablas:
 *   sources(id, title, authors_json, year, doi, isbn, publisher,
 *           container_title, bibtex_type, citekey, read_status,
 *           notes, date_added, date_modified)
 *   excerpts(id, source_id, text, locator, context, tags_json, date_added)
 *   FK: excerpts.source_id -> sources.id
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { generateCitekey } from "./citekey.js";
import { extractLinks, titleMentionRegex } from "./link-parser.js";
import { initializeFullTextSearch } from "./fts.js";
import type {
  Source,
  NewSource,
  Excerpt,
  NewExcerpt,
  ReadStatus,
  Note,
  NewNote,
  Link,
  LinkType,
  UnlinkedMention,
  Tag,
  NewTag,
  ItemType,
  ItemTag,
  NewItemTag,
  TagType,
  FilterGroup,
  FilterCondition,
  FilterOperator,
  MatrixQueryResult,
  MatrixCell,
  SavedView,
  NewSavedView,
  Section,
  NewSection,
  SectionType,
  SectionEvidence,
  NewSectionEvidence,
  EvidenceType,
  SectionTreeNode,
  SectionEvidenceDetail,
  GapReport,
  WordCountBreakdown,
} from "./types.js";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "tesista.db");

/**
 * Campos permitidos en filtros declarativos. Evita que un nombre de campo
 * arbitrario llegue al SQL (los valores sí van parametrizados).
 */
const ALLOWED_FILTER_FIELDS = new Set([
  "sources.id", "sources.title", "sources.year", "sources.doi",
  "sources.isbn", "sources.publisher", "sources.container_title",
  "sources.bibtex_type", "sources.citekey", "sources.read_status",
  "sources.notes", "sources.date_added", "sources.date_modified",
  "excerpts.id", "excerpts.source_id", "excerpts.text", "excerpts.locator",
  "excerpts.context", "excerpts.date_added",
  "notes.id", "notes.title", "notes.content", "notes.created_at",
  "notes.updated_at",
  "sections.id", "sections.title", "sections.type", "sections.parent_id",
  "sections.position", "sections.word_goal",
  "tags.id", "tags.name", "tags.type", "tags.color",
]);

export class TesistaDB {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeSchema();
    initializeFullTextSearch(this);
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        authors_json TEXT NOT NULL DEFAULT '[]',
        year INTEGER,
        doi TEXT UNIQUE,
        isbn TEXT,
        publisher TEXT,
        container_title TEXT,
        bibtex_type TEXT DEFAULT 'misc',
        citekey TEXT NOT NULL UNIQUE,
        read_status TEXT NOT NULL DEFAULT 'unread' CHECK(read_status IN ('unread','reading','read','filed')),
        notes TEXT,
        date_added TEXT NOT NULL,
        date_modified TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS excerpts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        locator TEXT NOT NULL,
        context TEXT,
        tags_json TEXT DEFAULT '[]',
        date_added TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_excerpts_source_id ON excerpts(source_id);
      CREATE INDEX IF NOT EXISTS idx_sources_citekey ON sources(citekey);
      CREATE INDEX IF NOT EXISTS idx_sources_doi ON sources(doi);
      CREATE INDEX IF NOT EXISTS idx_excerpts_locator ON excerpts(locator);

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_note_id INTEGER NOT NULL,
        target_note_id INTEGER,
        target_source_id INTEGER,
        link_type TEXT NOT NULL CHECK(link_type IN ('wikilink','cite_mention','transclusion')),
        raw_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_source_id) REFERENCES sources(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
      CREATE INDEX IF NOT EXISTS idx_links_target_note ON links(target_note_id);
      CREATE INDEX IF NOT EXISTS idx_links_target_source ON links(target_source_id);
      CREATE INDEX IF NOT EXISTS idx_links_type ON links(link_type);

      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title, content, content='notes', content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('concept','methodology','stance','custom')),
        color TEXT,
        icon TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS item_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL CHECK(item_type IN ('source','excerpt','note')),
        item_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_item_tags_item ON item_tags(item_type, item_id);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_item_tags_unique
        ON item_tags(item_type, item_id, tag_id);

      CREATE TABLE IF NOT EXISTS saved_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('part','chapter','section','subsection')),
        parent_id INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        own_content TEXT DEFAULT '',
        word_goal INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES sections(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS section_evidences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_id INTEGER NOT NULL,
        evidence_type TEXT NOT NULL CHECK(evidence_type IN ('note','excerpt')),
        evidence_id INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sections_parent ON sections(parent_id, position);
      CREATE INDEX IF NOT EXISTS idx_section_evidences_section ON section_evidences(section_id, position);
      CREATE INDEX IF NOT EXISTS idx_section_evidences_target ON section_evidences(evidence_type, evidence_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    `);

    // Unicidad de etiquetas por nombre (sin distinguir mayúsculas). Si ya existen
    // duplicados de versiones anteriores, se conserva el primero y se recrea el índice.
    try {
      this.db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_nocase ON tags(name COLLATE NOCASE)"
      );
    } catch {
      this.db.exec(
        `DELETE FROM tags WHERE id NOT IN (
           SELECT MIN(id) FROM tags GROUP BY name COLLATE NOCASE
         )`
      );
      this.db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_nocase ON tags(name COLLATE NOCASE)"
      );
    }
  }

  /* ===================== Utilidades de normalización ===================== */

  /** Normaliza un DOI: quita prefijos de URL, espacios y unifica a minúsculas. */
  private normalizeDoi(doi?: string | null): string | null {
    if (doi === undefined || doi === null) return null;
    const clean = doi
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim()
      .toLowerCase();
    return clean.length > 0 ? clean : null;
  }

  /** Normaliza localizadores para compararlos de forma tolerante (p. 45 == P.  45). */
  normalizeLocator(locator?: string | null): string {
    if (!locator) return "";
    return locator
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.;,]+$/, "");
  }

  /** Cierra la conexión a la base de datos. */
  close(): void {
    this.db.close();
  }

  /** Retorna la instancia subyacente de better-sqlite3 (utilidad interna para módulos del Hito 6). */
  getDb(): Database.Database {
    return this.db;
  }

  /** Retorna la ruta del archivo de base de datos (utilidad interna para respaldos). */
  getDbPath(): string | null {
    try {
      const row = this.db
        .prepare("SELECT file FROM pragma_database_list WHERE name = 'main'")
        .get() as { file: string } | undefined;
      return row ? row.file : null;
    } catch {
      return null;
    }
  }

  /* ===================== Sources ===================== */

  private rowToSource(row: any): Source {
    return {
      id: row.id,
      title: row.title,
      authors: JSON.parse(row.authors_json || "[]"),
      year: row.year,
      doi: row.doi || undefined,
      isbn: row.isbn || undefined,
      publisher: row.publisher || undefined,
      containerTitle: row.container_title || undefined,
      bibtexType: row.bibtex_type as Source["bibtexType"] || undefined,
      citekey: row.citekey,
      readStatus: row.read_status as ReadStatus,
      notes: row.notes || undefined,
      dateAdded: row.date_added,
      dateModified: row.date_modified,
    };
  }

  /** Lista todas las fuentes. */
  listSources(): Source[] {
    const rows = this.db
      .prepare("SELECT * FROM sources ORDER BY date_added DESC")
      .all() as any[];
    return rows.map((r) => this.rowToSource(r));
  }

  /** Busca una fuente por id. */
  getSource(id: number): Source | null {
    const row = this.db
      .prepare("SELECT * FROM sources WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToSource(row) : null;
  }

  /** Busca una fuente por citekey. */
  getSourceByCitekey(citekey: string): Source | null {
    const row = this.db
      .prepare("SELECT * FROM sources WHERE citekey = ?")
      .get(citekey) as any | undefined;
    return row ? this.rowToSource(row) : null;
  }

  /** Busca una fuente por DOI (normalizado y sin distinguir mayúsculas). */
  getSourceByDoi(doi: string): Source | null {
    const normalized = this.normalizeDoi(doi);
    if (!normalized) return null;
    const row = this.db
      .prepare("SELECT * FROM sources WHERE doi = ? COLLATE NOCASE")
      .get(normalized) as any | undefined;
    return row ? this.rowToSource(row) : null;
  }

  /**
   * Crea una fuente. Genera la citekey automáticamente si no se provee,
   * asegurando unicidad con sufijo alfabético (smith2020a, smith2020b...).
   */
  createSource(input: NewSource): Source {
    const now = new Date().toISOString();
    const existingKeys = this.listCitekeys();

    let citekey = input.citekey?.trim();
    if (!citekey) {
      const generated = generateCitekey(
        { authors: input.authors, year: input.year },
        existingKeys
      );
      citekey = generated.suggested;
    } else if (existingKeys.includes(citekey)) {
      // Si la clave proporcionada ya existe, se sugiere una alternativa
      const generated = generateCitekey(
        { authors: input.authors, year: input.year },
        existingKeys
      );
      citekey = generated.suggested;
    }

    const info = this.db
      .prepare(
        `INSERT INTO sources
          (title, authors_json, year, doi, isbn, publisher, container_title,
           bibtex_type, citekey, read_status, notes, date_added, date_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        JSON.stringify(input.authors),
        input.year ?? null,
        this.normalizeDoi(input.doi),
        input.isbn ?? null,
        input.publisher ?? null,
        input.containerTitle ?? null,
        input.bibtexType ?? "misc",
        citekey,
        input.readStatus ?? "unread",
        input.notes ?? null,
        now,
        now
      );

    const created = this.getSource(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo crear la fuente");
    return created;
  }

  /** Actualiza una fuente existente. Si se cambia el citekey, verifica unicidad. */
  updateSource(id: number, patch: Partial<NewSource>): Source | null {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.title !== undefined) { fields.push("title = ?"); values.push(patch.title); }
    if (patch.authors !== undefined) { fields.push("authors_json = ?"); values.push(JSON.stringify(patch.authors)); }
    if (patch.year !== undefined) { fields.push("year = ?"); values.push(patch.year); }
    if (patch.doi !== undefined) { fields.push("doi = ?"); values.push(this.normalizeDoi(patch.doi)); }
    if (patch.isbn !== undefined) { fields.push("isbn = ?"); values.push(patch.isbn); }
    if (patch.publisher !== undefined) { fields.push("publisher = ?"); values.push(patch.publisher); }
    if (patch.containerTitle !== undefined) { fields.push("container_title = ?"); values.push(patch.containerTitle); }
    if (patch.bibtexType !== undefined) { fields.push("bibtex_type = ?"); values.push(patch.bibtexType); }
    if (patch.citekey !== undefined) {
      const conflict = this.db
        .prepare("SELECT id FROM sources WHERE citekey = ? AND id != ?")
        .get(patch.citekey, id) as { id: number } | undefined;
      if (conflict) {
        throw new Error(`La citekey "${patch.citekey}" ya está en uso por otra fuente.`);
      }
      fields.push("citekey = ?");
      values.push(patch.citekey);
    }
    if (patch.readStatus !== undefined) { fields.push("read_status = ?"); values.push(patch.readStatus); }
    if (patch.notes !== undefined) { fields.push("notes = ?"); values.push(patch.notes); }

    if (fields.length === 0) return this.getSource(id);

    fields.push("date_modified = ?");
    values.push(now, id);

    this.db.prepare(
      `UPDATE sources SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values);

    return this.getSource(id);
  }

  /** Elimina una fuente y sus citas, etiquetas y evidencias asociadas. */
  deleteSource(id: number): boolean {
    const tx = this.db.transaction(() => {
      const excerptIds = (
        this.db
          .prepare("SELECT id FROM excerpts WHERE source_id = ?")
          .all(id) as Array<{ id: number }>
      ).map((r) => r.id);

      if (excerptIds.length > 0) {
        const placeholders = excerptIds.map(() => "?").join(",");
        this.db
          .prepare(
            `DELETE FROM item_tags
              WHERE item_type = 'excerpt' AND item_id IN (${placeholders})`
          )
          .run(...excerptIds);
        this.db
          .prepare(
            `DELETE FROM section_evidences
              WHERE evidence_type = 'excerpt' AND evidence_id IN (${placeholders})`
          )
          .run(...excerptIds);
      }

      this.db
        .prepare("DELETE FROM item_tags WHERE item_type = 'source' AND item_id = ?")
        .run(id);

      return this.db.prepare("DELETE FROM sources WHERE id = ?").run(id);
    });
    const info = tx();
    return (info.changes ?? 0) > 0;
  }

  /** Devuelve todas las citekeys registradas (para el algoritmo de unicidad). */
  listCitekeys(): string[] {
    const rows = this.db
      .prepare("SELECT citekey FROM sources")
      .all() as { citekey: string }[];
    return rows.map((r) => r.citekey);
  }

  /* ===================== Excerpts ===================== */

  private rowToExcerpt(row: any): Excerpt {
    return {
      id: row.id,
      sourceId: row.source_id,
      text: row.text,
      locator: row.locator,
      context: row.context || undefined,
      tags: JSON.parse(row.tags_json || "[]"),
      dateAdded: row.date_added,
    };
  }

  /**
   * Crea una cita.
   * Validación del plan:
   *   - source_id no nulo (la fuente debe existir)
   *   - locator (página/localizador) obligatorio
   */
  createExcerpt(input: NewExcerpt): Excerpt {
    if (!input.sourceId) {
      throw new Error(
        "Validación: una cita (Excerpt) debe estar asociada a una fuente existente (source_id no nulo)."
      );
    }
    if (!input.locator || !input.locator.trim()) {
      throw new Error(
        "Validación: el campo Página/Localizador es obligatorio para la trazabilidad epistémica."
      );
    }
    if (!input.text || !input.text.trim()) {
      throw new Error("Validación: el texto de la cita no puede estar vacío.");
    }

    const source = this.getSource(input.sourceId);
    if (!source) {
      throw new Error(
        `Validación: no existe la fuente con id ${input.sourceId}. No se puede crear la cita.`
      );
    }

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO excerpts (source_id, text, locator, context, tags_json, date_added)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.sourceId,
          input.text.trim(),
          input.locator.trim(),
          input.context ?? null,
          JSON.stringify(input.tags ?? []),
          now
        );

      const id = info.lastInsertRowid as number;
      if (input.tags !== undefined) {
        this.setTagsForItem("excerpt", id, input.tags);
      }
      return id;
    });

    const created = this.getExcerpt(tx());
    if (!created) throw new Error("No se pudo crear la cita");
    return created;
  }

  /** Busca una cita por id. */
  getExcerpt(id: number): Excerpt | null {
    const row = this.db
      .prepare("SELECT * FROM excerpts WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToExcerpt(row) : null;
  }

  /** Lista todas las citas de una fuente. */
  listExcerptsBySource(sourceId: number): Excerpt[] {
    const rows = this.db
      .prepare("SELECT * FROM excerpts WHERE source_id = ? ORDER BY date_added DESC")
      .all(sourceId) as any[];
    return rows.map((r) => this.rowToExcerpt(r));
  }

  /** Lista todas las citas. */
  listExcerpts(): Excerpt[] {
    const rows = this.db
      .prepare("SELECT * FROM excerpts ORDER BY date_added DESC")
      .all() as any[];
    return rows.map((r) => this.rowToExcerpt(r));
  }

  /** Actualiza una cita existente. */
  updateExcerpt(id: number, patch: Partial<NewExcerpt>): Excerpt | null {
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.sourceId !== undefined) { fields.push("source_id = ?"); values.push(patch.sourceId); }
    if (patch.text !== undefined) { fields.push("text = ?"); values.push(patch.text); }
    if (patch.locator !== undefined) { fields.push("locator = ?"); values.push(patch.locator); }
    if (patch.context !== undefined) { fields.push("context = ?"); values.push(patch.context); }
    if (patch.tags !== undefined) { fields.push("tags_json = ?"); values.push(JSON.stringify(patch.tags)); }

    if (fields.length === 0 && patch.tags === undefined) return this.getExcerpt(id);
    if (!this.getExcerpt(id)) return null;

    const tx = this.db.transaction(() => {
      if (fields.length > 0) {
        this.db.prepare(
          `UPDATE excerpts SET ${fields.join(", ")} WHERE id = ?`
        ).run(...values, id);
      }
      if (patch.tags !== undefined) {
        this.setTagsForItem("excerpt", id, patch.tags);
      }
    });
    tx();

    return this.getExcerpt(id);
  }

  /** Elimina una cita, sus etiquetas y sus vínculos como evidencia. */
  deleteExcerpt(id: number): boolean {
    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM item_tags WHERE item_type = 'excerpt' AND item_id = ?")
        .run(id);
      this.db
        .prepare(
          "DELETE FROM section_evidences WHERE evidence_type = 'excerpt' AND evidence_id = ?"
        )
        .run(id);
      return this.db.prepare("DELETE FROM excerpts WHERE id = ?").run(id);
    });
    const info = tx();
    return (info.changes ?? 0) > 0;
  }

  /** Busca la cita de una fuente por localizador (tolerante a espacios/mayúsculas). */
  findExcerptByLocator(sourceId: number, locator: string): Excerpt | null {
    const target = this.normalizeLocator(locator);
    const excerpts = this.listExcerptsBySource(sourceId);
    return (
      excerpts.find((e) => this.normalizeLocator(e.locator) === target) ?? null
    );
  }

  /* ===================== Notes ===================== */

  private rowToNote(row: any): Note {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      tags: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Adjunta las etiquetas (item_tags) a una lista de notas en una sola consulta. */
  private attachTagsToNotes(notes: Note[]): Note[] {
    if (notes.length === 0) return notes;
    const ids = notes.map((n) => n.id!).filter((id) => id !== undefined);
    if (ids.length === 0) return notes;

    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT it.item_id, t.name
           FROM item_tags it
           JOIN tags t ON t.id = it.tag_id
          WHERE it.item_type = 'note' AND it.item_id IN (${placeholders})
          ORDER BY t.name COLLATE NOCASE`
      )
      .all(...ids) as Array<{ item_id: number; name: string }>;

    const byNote = new Map<number, string[]>();
    for (const row of rows) {
      const list = byNote.get(row.item_id) ?? [];
      list.push(row.name);
      byNote.set(row.item_id, list);
    }
    return notes.map((n) => ({ ...n, tags: byNote.get(n.id!) ?? [] }));
  }

  /**
   * Crea una nota atómica y, si hay contenido, extrae y persiste sus enlaces.
   * Las etiquetas se guardan en item_tags y se crean si no existen.
   */
  createNote(input: NewNote): Note {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const info = this.db
        .prepare(
          `INSERT INTO notes (title, content, created_at, updated_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(input.title, input.content, now, now);

      const id = info.lastInsertRowid as number;
      this.extractAndSaveLinks(id, input.content);
      if (input.tags !== undefined) {
        this.setTagsForItem("note", id, input.tags);
      }
      return id;
    });

    const id = tx();
    const created = this.getNote(id);
    if (!created) throw new Error("No se pudo crear la nota");
    return created;
  }

  /** Busca una nota por id (incluye etiquetas). */
  getNote(id: number): Note | null {
    const row = this.db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(id) as any | undefined;
    if (!row) return null;
    return this.attachTagsToNotes([this.rowToNote(row)])[0];
  }

  /** Busca una nota por título exacto (incluye etiquetas). */
  getNoteByTitle(title: string): Note | null {
    const row = this.db
      .prepare("SELECT * FROM notes WHERE title = ? COLLATE NOCASE")
      .get(title) as any | undefined;
    if (!row) return null;
    return this.attachTagsToNotes([this.rowToNote(row)])[0];
  }

  /** Lista todas las notas (incluye etiquetas). */
  listNotes(): Note[] {
    const rows = this.db
      .prepare("SELECT * FROM notes ORDER BY updated_at DESC")
      .all() as any[];
    return this.attachTagsToNotes(rows.map((r) => this.rowToNote(r)));
  }

  /**
   * Actualiza una nota y reconstruye sus enlaces desde el nuevo contenido.
   * Acepta cambios solo de etiquetas (sin tocar título ni contenido).
   */
  updateNote(id: number, patch: Partial<NewNote>): Note | null {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];
    const touchesTags = patch.tags !== undefined;

    if (patch.title !== undefined) {
      fields.push("title = ?");
      values.push(patch.title);
    }
    if (patch.content !== undefined) {
      fields.push("content = ?");
      values.push(patch.content);
    }

    if (fields.length === 0 && !touchesTags) return this.getNote(id);
    if (!this.getNote(id)) return null;

    const tx = this.db.transaction(() => {
      if (fields.length > 0) {
        fields.push("updated_at = ?");
        values.push(now, id);
        this.db
          .prepare(`UPDATE notes SET ${fields.join(", ")} WHERE id = ?`)
          .run(...values);
      } else {
        this.db
          .prepare("UPDATE notes SET updated_at = ? WHERE id = ?")
          .run(now, id);
      }

      // Reconstruir enlaces si cambió el contenido
      if (patch.content !== undefined) {
        this.db.prepare("DELETE FROM links WHERE source_note_id = ?").run(id);
        this.extractAndSaveLinks(id, patch.content);
      }

      if (touchesTags) {
        this.setTagsForItem("note", id, patch.tags ?? []);
      }
    });
    tx();

    return this.getNote(id);
  }

  /** Elimina una nota, sus enlaces (FK) y sus vínculos de etiqueta/evidencia. */
  deleteNote(id: number): boolean {
    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM item_tags WHERE item_type = 'note' AND item_id = ?")
        .run(id);
      this.db
        .prepare(
          "DELETE FROM section_evidences WHERE evidence_type = 'note' AND evidence_id = ?"
        )
        .run(id);
      return this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    });
    const info = tx();
    return (info.changes ?? 0) > 0;
  }

  /* ===================== Links / Grafo ===================== */

  /**
   * Analiza el contenido de una nota, borra sus enlaces previos y persiste los
   * nuevos enlaces extraídos (wikilinks, menciones @citekey, transclusiones).
   * Llámalo tras crear o actualizar una nota.
   */
  extractAndSaveLinks(noteId: number, content: string): Link[] {
    const refs = extractLinks(content);
    const now = new Date().toISOString();
    const created: Link[] = [];

    const insert = this.db.prepare(
      `INSERT INTO links
        (source_note_id, target_note_id, target_source_id, link_type, raw_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (const ref of refs) {
      if (ref.type === "wikilink") {
        const targetNote = this.getNoteByTitle(ref.target);
        const row = insert.run(
          noteId,
          targetNote?.id ?? null,
          null,
          "wikilink",
          ref.raw,
          now
        );
        created.push(this.rowToLink({
          id: row.lastInsertRowid as number,
          source_note_id: noteId,
          target_note_id: targetNote?.id ?? null,
          target_source_id: null,
          link_type: "wikilink",
          raw_text: ref.raw,
          created_at: now,
        }));
      } else if (ref.type === "cite_mention" || ref.type === "transclusion") {
        const source = this.getSourceByCitekey(ref.target);
        const row = insert.run(
          noteId,
          null,
          source?.id ?? null,
          ref.type,
          ref.raw,
          now
        );
        created.push(this.rowToLink({
          id: row.lastInsertRowid as number,
          source_note_id: noteId,
          target_note_id: null,
          target_source_id: source?.id ?? null,
          link_type: ref.type,
          raw_text: ref.raw,
          created_at: now,
        }));
      }
    }

    return created;
  }

  private rowToLink(row: any): Link {
    return {
      id: row.id,
      sourceNoteId: row.source_note_id,
      targetNoteId: row.target_note_id,
      targetSourceId: row.target_source_id,
      linkType: row.link_type as LinkType,
      rawText: row.raw_text,
      createdAt: row.created_at,
    };
  }

  /** Enlaces salientes de una nota (qué notas/fuentes cita esta nota). */
  getOutgoingLinks(noteId: number): Link[] {
    const rows = this.db
      .prepare("SELECT * FROM links WHERE source_note_id = ? ORDER BY id")
      .all(noteId) as any[];
    return rows.map((r) => this.rowToLink(r));
  }

  /** Enlaces entrantes / backlinks (qué notas enlazan a esta nota). */
  getBacklinks(noteId: number): Array<Link & { sourceNote: Note }> {
    const rows = this.db
      .prepare(
        `SELECT l.*, n.title AS source_title, n.content AS source_content
         FROM links l
         JOIN notes n ON n.id = l.source_note_id
         WHERE l.target_note_id = ?
         ORDER BY l.id`
      )
      .all(noteId) as any[];
    return rows.map((r) => ({
      ...this.rowToLink(r),
      sourceNote: {
        id: r.source_note_id,
        title: r.source_title,
        content: r.source_content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    }));
  }

  /** Enlaces salientes resueltos con el título del nodo destino (si es nota). */
  getOutgoingLinksResolved(noteId: number): Array<Link & { targetTitle?: string; targetSource?: Source }> {
    const links = this.getOutgoingLinks(noteId);
    return links.map((l) => {
      const resolved: any = { ...l };
      if (l.targetNoteId) {
        const t = this.getNote(l.targetNoteId);
        resolved.targetTitle = t?.title;
      }
      if (l.targetSourceId) {
        const s = this.getSource(l.targetSourceId);
        resolved.targetSource = s;
      }
      return resolved;
    });
  }

  /**
   * Menciones no enlazadas: para la nota dada, busca otros títulos de notas
   * que aparezcan como texto plano en su contenido pero que NO tengan un
   * wikilink explícito desde esta nota hacia ellas.
   */
  findUnlinkedMentions(noteId: number): UnlinkedMention[] {
    const note = this.getNote(noteId);
    if (!note) return [];

    const allNotes = this.listNotes().filter((n) => n.id !== noteId);
    const outgoing = this.getOutgoingLinks(noteId).filter(
      (l) => l.linkType === "wikilink"
    );
    const linkedTargets = new Set(
      outgoing
        .map((l) => (l.targetNoteId ? this.getNote(l.targetNoteId)?.title : undefined))
        .filter(Boolean)
    );

    const mentions: UnlinkedMention[] = [];
    for (const candidate of allNotes) {
      if (linkedTargets.has(candidate.title)) continue;
      const regex = titleMentionRegex(candidate.title);
      if (regex.test(note.content)) {
        mentions.push({
          noteId: candidate.id!,
          noteTitle: candidate.title,
          inNoteId: noteId,
          inNoteTitle: note.title,
        });
      }
    }

    return mentions;
  }

  /**
   * Resuelve una transclusión !@citekey#locator al excerpt correspondiente.
   * Devuelve el excerpt si existe la fuente y el localizador coincide.
   */
  resolveTransclusion(citekey: string, locator: string): Excerpt | null {
    const source = this.getSourceByCitekey(citekey);
    if (!source || !source.id) return null;
    return this.findExcerptByLocator(source.id, locator);
  }

  /* ===================== Búsqueda de títulos (FTS5) ===================== */

  /**
   * Busca notas por coincidencia en título o contenido usando FTS5.
   * Devuelve notas ordenadas por relevancia (matchinfo simple).
   */
  /**
   * Busca notas por coincidencia en título o contenido usando FTS5.
   * El término se cita para evitar errores de sintaxis de FTS con comillas,
   * guiones o asteriscos. Si FTS falla, cae a LIKE.
   */
  searchNotes(query: string): Note[] {
    const q = query.trim();
    if (!q) return this.listNotes();

    // Cada palabra se convierte en una frase FTS entre comillas dobles.
    const matchExpr = q
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token.replace(/"/g, '""')}"`)
      .join(" ");

    let rows: any[] = [];
    try {
      rows = this.db
        .prepare(
          `SELECT n.id, n.title, n.content, n.created_at, n.updated_at,
                  bm25(notes_fts) AS rank
           FROM notes_fts
           JOIN notes n ON n.id = notes_fts.rowid
           WHERE notes_fts MATCH ?
           ORDER BY rank
           LIMIT 50`
        )
        .all(matchExpr) as any[];
    } catch {
      rows = this.db
        .prepare(
          `SELECT * FROM notes
            WHERE title LIKE ? OR content LIKE ?
            ORDER BY updated_at DESC LIMIT 50`
        )
        .all(`%${q}%`, `%${q}%`) as any[];
    }

    return this.attachTagsToNotes(rows.map((r) => this.rowToNote(r)));
  }

  /* ===================== Hito 3: Tags ===================== */

  private rowToTag(row: any): Tag {
    return {
      id: row.id,
      name: row.name,
      type: row.type as TagType,
      color: row.color || undefined,
      icon: row.icon || undefined,
      createdAt: row.created_at,
    };
  }

  /** Crea una etiqueta tipada. */
  createTag(input: NewTag): Tag {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO tags (name, type, color, icon, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(input.name, input.type, input.color ?? null, input.icon ?? null, now);

    const created = this.getTag(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo crear la etiqueta");
    return created;
  }

  /** Busca una etiqueta por id. */
  getTag(id: number): Tag | null {
    const row = this.db
      .prepare("SELECT * FROM tags WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToTag(row) : null;
  }

  /** Busca una etiqueta por nombre. */
  getTagByName(name: string): Tag | null {
    const row = this.db
      .prepare("SELECT * FROM tags WHERE name = ?")
      .get(name) as any | undefined;
    return row ? this.rowToTag(row) : null;
  }

  /** Lista todas las etiquetas, opcionalmente filtradas por tipo. */
  listTags(type?: TagType): Tag[] {
    if (type) {
      const rows = this.db
        .prepare("SELECT * FROM tags WHERE type = ? ORDER BY name")
        .all(type) as any[];
      return rows.map((r) => this.rowToTag(r));
    }
    const rows = this.db
      .prepare("SELECT * FROM tags ORDER BY type, name")
      .all() as any[];
    return rows.map((r) => this.rowToTag(r));
  }

  /** Actualiza una etiqueta. */
  updateTag(id: number, patch: Partial<NewTag>): Tag | null {
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.name !== undefined) { fields.push("name = ?"); values.push(patch.name); }
    if (patch.type !== undefined) { fields.push("type = ?"); values.push(patch.type); }
    if (patch.color !== undefined) { fields.push("color = ?"); values.push(patch.color); }
    if (patch.icon !== undefined) { fields.push("icon = ?"); values.push(patch.icon); }

    if (fields.length === 0) return this.getTag(id);

    this.db.prepare(
      `UPDATE tags SET ${fields.join(", ")} WHERE id = ?`
    ).run(...values, id);

    return this.getTag(id);
  }

  /** Elimina una etiqueta y sus vínculos item_tags (cascade). */
  deleteTag(id: number): boolean {
    const info = this.db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    return (info.changes ?? 0) > 0;
  }

  /* ===================== Hito 3: ItemTags (vínculos polimórficos) ===================== */

  private rowToItemTag(row: any): ItemTag {
    return {
      id: row.id,
      itemType: row.item_type as ItemType,
      itemId: row.item_id,
      tagId: row.tag_id,
      createdAt: row.created_at,
    };
  }

  /** Vincula un ítem (source/excerpt/note) con una etiqueta. */
  addTagToItem(input: NewItemTag): ItemTag {
    const now = new Date().toISOString();
    // evitar duplicados
    const existing = this.db
      .prepare(
        `SELECT id FROM item_tags WHERE item_type = ? AND item_id = ? AND tag_id = ?`
      )
      .get(input.itemType, input.itemId, input.tagId) as any | undefined;
    if (existing) return this.getItemTag(existing.id)!;

    const info = this.db
      .prepare(
        `INSERT INTO item_tags (item_type, item_id, tag_id, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.itemType, input.itemId, input.tagId, now);

    const created = this.getItemTag(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo crear el vínculo ítem-etiqueta");
    return created;
  }

  /** Busca un vínculo item-tag por id. */
  getItemTag(id: number): ItemTag | null {
    const row = this.db
      .prepare("SELECT * FROM item_tags WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToItemTag(row) : null;
  }

  /** Desvincula un ítem de una etiqueta. */
  removeTagFromItem(itemType: ItemType, itemId: number, tagId: number): boolean {
    const info = this.db
      .prepare(
        `DELETE FROM item_tags WHERE item_type = ? AND item_id = ? AND tag_id = ?`
      )
      .run(itemType, itemId, tagId);
    return (info.changes ?? 0) > 0;
  }

  /** Lista las etiquetas de un ítem. */
  getTagsForItem(itemType: ItemType, itemId: number): Tag[] {
    const rows = this.db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN item_tags it ON it.tag_id = t.id
         WHERE it.item_type = ? AND it.item_id = ?
         ORDER BY t.type, t.name COLLATE NOCASE`
      )
      .all(itemType, itemId) as any[];
    return rows.map((r) => this.rowToTag(r));
  }

  /**
   * Busca una etiqueta por nombre (sin distinguir mayúsculas) o la crea con el
   * tipo indicado. Evita duplicados y sirve para el ingreso libre de etiquetas.
   */
  ensureTag(name: string, type: TagType = "custom"): Tag {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) throw new Error("El nombre de la etiqueta no puede estar vacío.");
    const existing = this.db
      .prepare("SELECT * FROM tags WHERE name = ? COLLATE NOCASE")
      .get(clean) as any | undefined;
    if (existing) return this.rowToTag(existing);
    return this.createTag({ name: clean, type });
  }

  /**
   * Reemplaza el conjunto completo de etiquetas de un ítem.
   * Crea las etiquetas que no existan y elimina los vínculos sobrantes.
   */
  setTagsForItem(itemType: ItemType, itemId: number, tagNames: string[]): Tag[] {
    const unique = Array.from(
      new Map(
        tagNames
          .map((n) => n.trim().replace(/\s+/g, " "))
          .filter((n) => n.length > 0)
          .map((n) => [n.toLowerCase(), n])
      ).values()
    );

    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM item_tags WHERE item_type = ? AND item_id = ?")
        .run(itemType, itemId);

      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO item_tags (item_type, item_id, tag_id, created_at)
         VALUES (?, ?, ?, ?)`
      );
      const now = new Date().toISOString();
      for (const name of unique) {
        const tag = this.ensureTag(name);
        insert.run(itemType, itemId, tag.id, now);
      }
    });
    tx();

    return this.getTagsForItem(itemType, itemId);
  }

  /** Lista ítems de un tipo dado que tienen una etiqueta. */
  getItemsByTag(itemType: ItemType, tagId: number): Array<{ itemId: number }> {
    const rows = this.db
      .prepare(
        `SELECT item_id FROM item_tags WHERE item_type = ? AND tag_id = ?`
      )
      .all(itemType, tagId) as { item_id: number }[];
    return rows.map((r) => ({ itemId: r.item_id }));
  }

  /* ===================== Hito 3: Motor de filtros booleanos ===================== */

  /**
   * Traduce un grupo de filtros a una cláusula SQL WHERE y sus parámetros.
   * Soporta AND, OR y NOT sobre condiciones simples.
   * Campos soportados: sources.*, excerpts.*, notes.*, tags.name (vía item_tags).
   */
  private buildFilterSQL(
    group: FilterGroup
  ): { where: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    for (const cond of group.conditions) {
      if (!ALLOWED_FILTER_FIELDS.has(cond.field)) {
        throw new Error(`Campo de filtro no permitido: "${cond.field}".`);
      }
      const combinator = cond.combinator || group.combinator;
      const joiner = clauses.length > 0 ? ` ${combinator} ` : "";
      let clause = "";

      switch (cond.operator) {
        case "eq":
          clause = `${cond.field}= ?`;
          params.push(cond.value);
          break;
        case "neq":
          clause = `${cond.field}<> ?`;
          params.push(cond.value);
          break;
        case "like":
          clause = `${cond.field}LIKE ?`;
          params.push(`%${cond.value}%`);
          break;
        case "ilike":
          clause = `LOWER(${cond.field})LIKE LOWER(?)`;
          params.push(`%${cond.value}%`);
          break;
        case "in": {
          const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
          const placeholders = vals.map(() => "?").join(",");
          clause = `${cond.field}IN (${placeholders})`;
          params.push(...vals);
          break;
        }
        case "is_null":
          clause = `${cond.field} IS NULL`;
          break;
        case "is_not_null":
          clause = `${cond.field} IS NOT NULL`;
          break;
        case "gt":
        case "gte":
        case "lt":
        case "lte": {
          const opMap: Record<string, string> = {
            gt: ">", gte: ">=", lt: "<", lte: "<=",
          };
          clause = `${cond.field}${opMap[cond.operator]}?`;
          params.push(cond.value);
          break;
        }
        case "has_tag": {
          const tagValue = cond.value as string;
          const tag = this.getTagByName(tagValue);
          const tagId = tag?.id;
          if (tagId !== undefined) {
            clause = `EXISTS (SELECT 1 FROM item_tags it
                          WHERE it.item_type = ? AND it.item_id = ${this.itemTableIdField(cond.field)}
                          AND it.tag_id = ?)`;
            const itemType = this.itemTypeFromField(cond.field);
            params.push(itemType, tagId);
          } else {
            clause = "1 = 0";
          }
          break;
        }
        case "has_not_tag": {
          const tagValue = cond.value as string;
          const tag = this.getTagByName(tagValue);
          const tagId = tag?.id;
          if (tagId !== undefined) {
            clause = `NOT EXISTS (SELECT 1 FROM item_tags it
                          WHERE it.item_type = ? AND it.item_id = ${this.itemTableIdField(cond.field)}
                          AND it.tag_id = ?)`;
            const itemType = this.itemTypeFromField(cond.field);
            params.push(itemType, tagId);
          } else {
            clause = "1 = 1";
          }
          break;
        }
        default:
          clause = "1 = 1";
      }

      // Aplicar NOT como envoltura sobre la cláusula completa
      if (cond.not && clause && clause !== "1 = 0" && clause !== "1 = 1") {
        clause = `NOT (${clause})`;
      }

      if (clause) {
        clauses.push(`${joiner}(${clause})`);
      }
    }

    return { where: clauses.join(""), params };
  }

  /** De un campo como 'sources.year' devuelve el nombre de la columna id de la tabla. */
  private itemTableIdField(field: string): string {
    if (field.startsWith("sources.")) return "sources.id";
    if (field.startsWith("excerpts.")) return "excerpts.id";
    if (field.startsWith("notes.")) return "notes.id";
    return "id";
  }

  /** De un campo como 'sources.year' devuelve el item_type. */
  private itemTypeFromField(field: string): ItemType {
    if (field.startsWith("sources.")) return "source";
    if (field.startsWith("excerpts.")) return "excerpt";
    if (field.startsWith("notes.")) return "note";
    return "source";
  }

  /**
   * Ejecuta una consulta filtrada sobre una tabla raíz (sources por defecto).
   * Devuelve los ids de los ítems que coinciden, útil para construir la matriz.
   */
  filterItems(
    rootTable: "sources" | "excerpts" | "notes" | "sections" | "tags",
    group: FilterGroup
  ): number[] {
    const allowedTables = new Set(["sources", "excerpts", "notes", "sections", "tags"]);
    if (!allowedTables.has(rootTable)) {
      throw new Error(`Entidad de consulta no permitida: "${rootTable}".`);
    }
    const { where, params } = this.buildFilterSQL(group);
    const sql = `SELECT id FROM ${rootTable} ${where ? "WHERE " + where : ""}`;
    const rows = this.db.prepare(sql).all(...params) as { id: number }[];
    return rows.map((r) => r.id);
  }

  /* ===================== Hito 3: Matriz de síntesis ===================== */

  /**
   * Construye una matriz de síntesis: filas = sources (filtradas opcionalmente),
   * columnas = tags de tipo concept/methodology/stance, celdas = excerpts/notes
   * de esa fuente que tengan esa etiqueta.
   */
  buildMatrix(options: {
    filter?: FilterGroup;
    tagType?: TagType;
    rowLimit?: number;
  }): MatrixQueryResult {
    const tagType = options.tagType ?? "concept";
    const columns = this.listTags(tagType);

    // filas: sources que pasan el filtro (si se provee)
    let rowIds: number[];
    if (options.filter) {
      rowIds = this.filterItems("sources", options.filter);
    } else {
      const rows = this.db
        .prepare("SELECT id FROM sources ORDER BY date_added DESC LIMIT ?")
        .all(options.rowLimit ?? 100) as { id: number }[];
      rowIds = rows.map((r) => r.id);
    }

    const rowsOut = rowIds.map((id) => {
      const s = this.getSource(id);
      return { id: s!.id as number, title: s!.title, citekey: s!.citekey };
    });

    const cells: MatrixCell[] = [];
    for (const row of rowsOut) {
      for (const col of columns) {
        // excerpts de esta fuente con este tag
        const excerptItemIds = this.getItemsByTag("excerpt", col.id!);
        const sourceExcerpts = this.listExcerptsBySource(row.id);
        const matchingExcerpts = sourceExcerpts.filter((e) =>
          excerptItemIds.some((ei) => ei.itemId === e.id)
        );

        // notes que mencionen esta fuente (vía cite_mention link) y tengan este tag
        // Simplificación: notas con este tag que tengan un enlace cite_mention a la fuente
        const notesWithTag = this.getItemsByTag("note", col.id!);
        const matchingNotes: Array<{ id: number; text: string; noteTitle: string }> = [];
        for (const ni of notesWithTag) {
          const note = this.getNote(ni.itemId);
          if (!note) continue;
          const hasMention = this.getOutgoingLinks(note.id!).some(
            (l) => l.linkType === "cite_mention" && l.targetSourceId === row.id
          );
          if (hasMention) {
            matchingNotes.push({
              id: note.id!,
              text: note.content,
              noteTitle: note.title,
            });
          }
        }

        const items = [
          ...matchingExcerpts.map((e) => ({
            type: "excerpt" as const,
            id: e.id!,
            text: e.text,
            locator: e.locator,
          })),
          ...matchingNotes.map((n) => ({
            type: "note" as const,
            id: n.id,
            text: n.text,
            noteTitle: n.noteTitle,
          })),
        ];

        cells.push({
          rowId: row.id,
          columnTagId: col.id as number,
          items,
          itemCount: items.length,
        });
      }
    }

    return { rows: rowsOut, columns, cells };
  }

  /* ===================== Hito 3: Vistas guardadas ===================== */

  private rowToSavedView(row: any): SavedView {
    return {
      id: row.id,
      name: row.name,
      configJson: row.config_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Guarda una configuración de matriz/filtro como vista. */
  saveView(input: NewSavedView): SavedView {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO saved_views (name, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(input.name, input.configJson, now, now);

    const created = this.getSavedView(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo guardar la vista");
    return created;
  }

  /** Busca una vista guardada por id. */
  getSavedView(id: number): SavedView | null {
    const row = this.db
      .prepare("SELECT * FROM saved_views WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToSavedView(row) : null;
  }

  /** Lista todas las vistas guardadas. */
  listSavedViews(): SavedView[] {
    const rows = this.db
      .prepare("SELECT * FROM saved_views ORDER BY updated_at DESC")
      .all() as any[];
    return rows.map((r) => this.rowToSavedView(r));
  }

  /** Elimina una vista guardada. */
  deleteSavedView(id: number): boolean {
    const info = this.db.prepare("DELETE FROM saved_views WHERE id = ?").run(id);
    return (info.changes ?? 0) > 0;
  }

  /* ===================== Hito 4: Secciones ===================== */

  private rowToSection(row: any): Section {
    return {
      id: row.id,
      title: row.title,
      type: row.type as SectionType,
      parentId: row.parent_id,
      position: row.position,
      ownContent: row.own_content || undefined,
      wordGoal: row.word_goal,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Crea una sección. Si no se indica posición, se pone al final de los hermanos. */
  createSection(input: NewSection): Section {
    const now = new Date().toISOString();
    let position = input.position;

    if (position === undefined) {
      const max = this.db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) AS maxpos FROM sections WHERE parent_id IS ?`
        )
        .get(input.parentId ?? null) as { maxpos: number };
      position = max.maxpos + 1;
    }

    const info = this.db
      .prepare(
        `INSERT INTO sections (title, type, parent_id, position, own_content, word_goal, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.title,
        input.type,
        input.parentId ?? null,
        position,
        input.ownContent ?? "",
        input.wordGoal ?? null,
        now,
        now
      );

    const created = this.getSection(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo crear la sección");
    return created;
  }

  /** Busca una sección por id. */
  getSection(id: number): Section | null {
    const row = this.db
      .prepare("SELECT * FROM sections WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToSection(row) : null;
  }

  /** Lista todas las seccións en plano. */
  listSections(): Section[] {
    const rows = this.db
      .prepare("SELECT * FROM sections ORDER BY parent_id, position")
      .all() as any[];
    return rows.map((r) => this.rowToSection(r));
  }

  /** Construye el árbol jerárquico completo de secciones. */
  getSectionTree(): SectionTreeNode[] {
    const all = this.listSections();
    const byId = new Map<number, SectionTreeNode>();

    // Inicializar nodos
    for (const s of all) {
      byId.set(s.id!, {
        ...s,
        children: [],
        evidenceCount: 0,
        ownWordCount: 0,
        evidenceWordCount: 0,
        totalWordCount: 0,
        progressPct: 0,
      });
    }

    const roots: SectionTreeNode[] = [];

    for (const node of byId.values()) {
      // Calcular conteos de palabras y evidencias del nodo
      const breakdown = this.countSectionWords(node.id!);
      const evs = this.getSectionEvidences(node.id!);
      node.evidenceCount = evs.length;
      node.ownWordCount = breakdown.ownWords;
      node.evidenceWordCount = breakdown.evidenceWords;
      node.totalWordCount = breakdown.totalWords;
      if (node.wordGoal) {
        node.progressPct = Math.round(
          (node.totalWordCount / node.wordGoal) * 100
        );
      }

      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Ordenar hijos por posición
    const sortChildren = (nodes: SectionTreeNode[]) => {
      for (const n of nodes) {
        n.children.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        sortChildren(n.children);
      }
    };
    roots.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    sortChildren(roots);

    return roots;
  }

  /** Verifica que `parentId` exista y no genere un ciclo para la sección `id`. */
  private assertValidParent(id: number, parentId: number | null): void {
    if (parentId === null) return;
    if (parentId === id) {
      throw new Error("No se puede mover una sección dentro de sí misma.");
    }
    const parent = this.getSection(parentId);
    if (!parent) throw new Error("La sección padre no existe.");
    let cursor: Section | null = parent;
    while (cursor) {
      if (cursor.id === id) {
        throw new Error("No se puede mover una sección dentro de su propia descendencia.");
      }
      cursor = cursor.parentId ? this.getSection(cursor.parentId) : null;
    }
  }

  /** Actualiza una sección. */
  updateSection(id: number, patch: Partial<NewSection>): Section | null {
    const existing = this.getSection(id);
    if (!existing) return null;

    const parentChanged =
      patch.parentId !== undefined &&
      (patch.parentId ?? null) !== (existing.parentId ?? null);

    // Validar antes de escribir para no dejar la jerarquía en estado inválido.
    if (parentChanged) {
      this.assertValidParent(id, patch.parentId ?? null);
    }

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (patch.title !== undefined) { fields.push("title = ?"); values.push(patch.title); }
    if (patch.type !== undefined) { fields.push("type = ?"); values.push(patch.type); }
    if (patch.ownContent !== undefined) { fields.push("own_content = ?"); values.push(patch.ownContent); }
    if (patch.wordGoal !== undefined) { fields.push("word_goal = ?"); values.push(patch.wordGoal); }

    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(now, id);
      this.db.prepare(
        `UPDATE sections SET ${fields.join(", ")} WHERE id = ?`
      ).run(...values);
    }

    // Cambiar de padre o de posición se delega para renormalizar a los hermanos.
    if (parentChanged || patch.position !== undefined) {
      this.reorderSection(id, {
        parentId: parentChanged ? (patch.parentId ?? null) : undefined,
        position: patch.position,
      });
    }

    return this.getSection(id);
  }

  /** Mueve una sección a una nueva posición entre sus hermanos (o nuevo padre). */
  reorderSection(
    id: number,
    options: { parentId?: number | null; position?: number }
  ): boolean {
    const section = this.getSection(id);
    if (!section) return false;

    const parentId =
      options.parentId !== undefined ? options.parentId : (section.parentId ?? null);

    // Evitar ciclos: el nuevo padre no puede ser la sección ni un descendiente.
    this.assertValidParent(id, parentId);

    const tx = this.db.transaction(() => {
      // Hermanos en el destino, sin la sección movida, en su orden actual.
      const siblings = (
        this.db
          .prepare(
            `SELECT id FROM sections
              WHERE parent_id IS ? AND id != ?
              ORDER BY position, id`
          )
          .all(parentId, id) as Array<{ id: number }>
      ).map((r) => r.id);

      let index =
        options.position !== undefined ? Math.trunc(options.position) : siblings.length;
      if (index < 0) index = 0;
      if (index > siblings.length) index = siblings.length;
      siblings.splice(index, 0, id);

      const now = new Date().toISOString();
      const update = this.db.prepare(
        "UPDATE sections SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?"
      );
      siblings.forEach((siblingId, position) => {
        update.run(parentId, position, now, siblingId);
      });
    });
    tx();

    return true;
  }

  /** Elimina una sección y sus hijas y evidencias (cascade por FK). */
  deleteSection(id: number): boolean {
    const info = this.db.prepare("DELETE FROM sections WHERE id = ?").run(id);
    return (info.changes ?? 0) > 0;
  }

  /* ===================== Hito 4: Evidencias por sección ===================== */

  private rowToSectionEvidence(row: any): SectionEvidence {
    return {
      id: row.id,
      sectionId: row.section_id,
      evidenceType: row.evidence_type as EvidenceType,
      evidenceId: row.evidence_id,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  /** Vincula una evidencia (nota o excerpt) a una sección. Valida que el evidence exista. */
  addEvidenceToSection(input: NewSectionEvidence): SectionEvidence {
    const now = new Date().toISOString();

    // Validar que la sección exista
    const section = this.getSection(input.sectionId);
    if (!section) {
      throw new Error(`No existe la sección con id ${input.sectionId}.`);
    }

    // Validar que el evidence exista según su tipo
    if (input.evidenceType === "note") {
      const note = this.getNote(input.evidenceId);
      if (!note) {
        throw new Error(`No existe la nota con id ${input.evidenceId}.`);
      }
    } else {
      const excerpt = this.getExcerpt(input.evidenceId);
      if (!excerpt) {
        throw new Error(`No existe el excerpt con id ${input.evidenceId}.`);
      }
    }

    let position = input.position;
    if (position === undefined) {
      const max = this.db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) AS maxpos FROM section_evidences WHERE section_id = ?`
        )
        .get(input.sectionId) as { maxpos: number };
      position = max.maxpos + 1;
    }

    const info = this.db
      .prepare(
        `INSERT INTO section_evidences (section_id, evidence_type, evidence_id, position, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        input.sectionId,
        input.evidenceType,
        input.evidenceId,
        position,
        now
      );

    const created = this.getSectionEvidence(info.lastInsertRowid as number);
    if (!created) throw new Error("No se pudo vincular la evidencia");
    return created;
  }

  /** Busca una sección-evidencia por id. */
  getSectionEvidence(id: number): SectionEvidence | null {
    const row = this.db
      .prepare("SELECT * FROM section_evidences WHERE id = ?")
      .get(id) as any | undefined;
    return row ? this.rowToSectionEvidence(row) : null;
  }

  /** Lista las evidencias de una sección con sus datos resueltos. */
  getSectionEvidences(sectionId: number): SectionEvidenceDetail[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM section_evidences WHERE section_id = ? ORDER BY position`
      )
      .all(sectionId) as any[];

    const details: SectionEvidenceDetail[] = [];

    for (const row of rows) {
      const base: SectionEvidenceDetail = {
        id: row.id,
        sectionId: row.section_id,
        evidenceType: row.evidence_type as EvidenceType,
        evidenceId: row.evidence_id,
        position: row.position,
        createdAt: row.created_at,
      };

      if (row.evidence_type === "note") {
        const note = this.getNote(row.evidence_id);
        if (note) {
          base.evidenceTitle = note.title;
          base.evidenceText = note.content;
        }
      } else {
        const excerpt = this.getExcerpt(row.evidence_id);
        if (excerpt) {
          const source = this.getSource(excerpt.sourceId);
          base.evidenceTitle = `Excerpt #${excerpt.id}`;
          base.evidenceText = excerpt.text;
          base.locator = excerpt.locator;
          if (source) base.citekey = source.citekey;
        }
      }

      details.push(base);
    }

    return details;
  }

  /** Quita una evidencia de una sección. */
  removeEvidenceFromSection(id: number): boolean {
    const info = this.db.prepare("DELETE FROM section_evidences WHERE id = ?").run(id);
    return (info.changes ?? 0) > 0;
  }

  /* ===================== Hito 4: Contador de palabras ===================== */

  /** Cuenta palabras de un texto simple. */
  private countWords(text?: string): number {
    if (!text) return 0;
    return text
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .length;
  }

  /**
   * Devuelve el desglose de palabras de una sección:
   *   - ownWords: palabras del own_content (texto propio)
   *   - evidenceWords: palabras de las evidencias vinculadas (excerpts + notas)
   *   - totalWords: suma de ambas
   */
  countSectionWords(sectionId: number): WordCountBreakdown {
    const section = this.getSection(sectionId);
    if (!section) return { ownWords: 0, evidenceWords: 0, totalWords: 0 };

    const ownWords = this.countWords(section.ownContent);

    const evidences = this.getSectionEvidences(sectionId);
    let evidenceWords = 0;
    for (const e of evidences) {
      evidenceWords += this.countWords(e.evidenceText);
    }

    return {
      ownWords,
      evidenceWords,
      totalWords: ownWords + evidenceWords,
    };
  }

  /* ===================== Hito 4: Gap Checker (Dashboard de Cobertura) ===================== */

  /** Devuelve la ruta jerárquica de una sección (ej. "Parte I > Capítulo 2 > Sección 2.1"). */
  private getSectionPath(sectionId: number): string {
    const parts: string[] = [];
    let current: Section | null = this.getSection(sectionId);
    while (current) {
      parts.unshift(current.title);
      current = current.parentId ? this.getSection(current.parentId) : null;
    }
    return parts.join(" > ");
  }

  /**
   * Reporte de cobertura del manuscrito:
   *   - Secciones huérfanas (sin evidencias)
   *   - Fuentes con estado 'filed' que no tienen excerpts vinculados a ninguna sección
   *   - Balance por capítulo (palabras propias vs evidencias, ratio, progreso)
   */
  getGapReport(): GapReport {
    const allSections = this.listSections();

    // --- Secciones huérfanas: sin evidencias vinculadas ---
    const orphanSections: GapReport["orphanSections"] = [];
    for (const s of allSections) {
      const evs = this.getSectionEvidences(s.id!);
      if (evs.length === 0) {
        orphanSections.push({
          id: s.id!,
          title: s.title,
          type: s.type,
          path: this.getSectionPath(s.id!),
        });
      }
    }

    // --- Fuentes no citadas: estado 'filed' y sin excerpts en ninguna sección ---
    const sources = this.listSources();
    const uncitedSources: GapReport["uncitedSources"] = [];
    for (const source of sources) {
      if (source.readStatus !== "filed") continue;

      const excerpts = this.listExcerptsBySource(source.id!);
      const excerptIds = excerpts.map((e) => e.id!);

      // ¿Algún excerpt de esta fuente está vinculado a una sección?
      let cited = false;
      for (const eid of excerptIds) {
        const row = this.db
          .prepare(
            `SELECT 1 FROM section_evidences WHERE evidence_type = 'excerpt' AND evidence_id = ? LIMIT 1`
          )
          .get(eid) as any | undefined;
        if (row) {
          cited = true;
          break;
        }
      }

      if (!cited) {
        uncitedSources.push({
          id: source.id!,
          title: source.title,
          citekey: source.citekey,
          excerptCount: excerpts.length,
        });
      }
    }

    // --- Balance por capítulo ---
    const chapters = allSections.filter((s) => s.type === "chapter");
    const chapterBalance: GapReport["chapterBalance"] = [];
    for (const ch of chapters) {
      const breakdown = this.countSectionWords(ch.id!);
      const total = breakdown.totalWords;
      const ratio = breakdown.evidenceWords > 0
        ? breakdown.evidenceWords / Math.max(total, 1)
        : 0;
      const progressPct = ch.wordGoal
        ? Math.round((total / ch.wordGoal) * 100)
        : undefined;

      chapterBalance.push({
        id: ch.id!,
        title: ch.title,
        ownWords: breakdown.ownWords,
        evidenceWords: breakdown.evidenceWords,
        totalWords: total,
        ratioCitationsPerWord: Math.round(ratio * 1000) / 1000,
        wordGoal: ch.wordGoal ?? undefined,
        progressPct,
      });
    }

    return { orphanSections, uncitedSources, chapterBalance };
  }

  /* ===================== Utilidades de mantenimiento ===================== */

  /** Lista todos los vínculos ítem-etiqueta (para respaldos e integridad). */
  listItemTags(): ItemTag[] {
    const rows = this.db
      .prepare("SELECT * FROM item_tags ORDER BY id")
      .all() as any[];
    return rows.map((r) => this.rowToItemTag(r));
  }

  /** Conteos generales para el dashboard. */
  getStats(): {
    sources: number;
    excerpts: number;
    notes: number;
    sections: number;
    tags: number;
    links: number;
  } {
    const count = (table: string): number =>
      (this.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
    return {
      sources: count("sources"),
      excerpts: count("excerpts"),
      notes: count("notes"),
      sections: count("sections"),
      tags: count("tags"),
      links: count("links"),
    };
  }

  /** Compacta la base de datos y vacía el WAL. */
  vacuum(): void {
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.db.exec("VACUUM");
  }

  /* ===================== Hito 6: Enlaces (auxiliares para cascada) ===================== */

  /** Devuelve todos los enlaces registrados en la tabla links. */
  getAllLinks(): Link[] {
    const rows = this.db
      .prepare("SELECT * FROM links ORDER BY id")
      .all() as any[];
    return rows.map((r) => this.rowToLink(r));
  }

  /** Actualiza el raw_text de un enlace (usado por actualización en cascada de citekeys). */
  updateLinkRawText(linkId: number, newRawText: string): void {
    this.db
      .prepare("UPDATE links SET raw_text = ? WHERE id = ?")
      .run(newRawText, linkId);
  }
}


