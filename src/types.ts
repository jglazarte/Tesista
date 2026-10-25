/**
 * Tesista - Hito 1: Núcleo Bibliográfico y Extracción de Citas
 * Tipos compartidos del esquema de dominio.
 */

export type ReadStatus = "unread" | "reading" | "read" | "filed";

export interface Source {
  id?: number;
  /** Metadatos bibliográficos */
  title: string;
  authors: string[]; // lista de apellidos/nombres normalizados
  year?: number;
  doi?: string;
  isbn?: string;
  publisher?: string;
  containerTitle?: string; // revista / libro / conferencia
  bibtexType?: "article" | "book" | "inproceedings" | "thesis" | "misc" | "inbook";
  /** Clave BibTeX única, ej. smith2020a */
  citekey: string;
  readStatus: ReadStatus;
  notes?: string;
  dateAdded?: string; // ISO
  dateModified?: string; // ISO
}

export interface NewSource
  extends Omit<Source, "id" | "dateAdded" | "dateModified" | "citekey"> {
  citekey?: string;
}

export interface Excerpt {
  id?: number;
  /** FK obligatoria - no puede existir una cita sin fuente */
  sourceId: number;
  /** Fragmento textual exacto */
  text: string;
  /** Localizador obligatorio: página, párrafo, sección, etc. */
  locator: string;
  /** Contexto opcional alrededor de la cita */
  context?: string;
  tags?: string[];
  dateAdded?: string;
}

export interface NewExcerpt extends Omit<Excerpt, "id" | "dateAdded"> {}

export interface CitekeyConflict {
  base: string;
  suggested: string;
}

export interface CrossRefItem {
  title?: string[];
  author?: Array<{ family?: string; given?: string }>;
  published?: { "date-parts"?: number[][] };
  DOI?: string;
  ISBN?: string[];
  publisher?: string;
  "container-title"?: string[];
  type?: string;
}

export interface OpenAlexWork {
  display_name?: string;
  title?: string;
  authorships?: Array<{ author: { display_name?: string } }>;
  publication_year?: number;
  doi?: string;
  isbn?: string[];
  primary_location?: {
    source: { display_name?: string };
  };
  type?: string;
}

/** Nota atómica (Markdown) con wikilinks y menciones a fuentes. */
export interface Note {
  id?: number;
  title: string;
  content: string;
  /** Nombres de etiquetas vinculadas vía item_tags. */
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface NewNote extends Omit<Note, "id" | "createdAt" | "updatedAt"> {}

export type LinkType = "wikilink" | "cite_mention" | "transclusion";

export interface Link {
  id?: number;
  sourceNoteId: number;
  targetNoteId?: number;     // si es wikilink a otra nota
  targetSourceId?: number;   // si es @citekey / transclusión a una fuente
  linkType: LinkType;
  rawText: string;           // texto tal cual aparece, ej. [[Nota]], @foucault1975, !@foucault1975#p45
  createdAt?: string;
}

export interface LinkRef {
  type: LinkType;
  target: string;            // título de nota o citekey
  locator?: string;          // solo transclusión: página/párrafo
  raw: string;
}

/** Resultado de mención no enlazada: título de nota que aparece en texto plano. */
export interface UnlinkedMention {
  noteId: number;
  noteTitle: string;
  inNoteId: number;
  inNoteTitle: string;
}

/* ===================== Hito 3: Etiquetas tipadas ===================== */

export type TagType = "concept" | "methodology" | "stance" | "custom";

export interface Tag {
  id?: number;
  name: string;
  type: TagType;
  color?: string;      // hex, ej. #3b82f6
  icon?: string;       // emoji o nombre de ícono
  createdAt?: string;
}

export interface NewTag extends Omit<Tag, "id" | "createdAt"> {}

export type ItemType = "source" | "excerpt" | "note";

export interface ItemTag {
  id?: number;
  itemType: ItemType;
  itemId: number;
  tagId: number;
  createdAt?: string;
}

export interface NewItemTag extends Omit<ItemTag, "id" | "createdAt"> {}

/* ===================== Hito 3: Filtros y vistas ===================== */

export type FilterOperator =
  | "eq" | "neq" | "like" | "ilike" | "in" | "is_null" | "is_not_null"
  | "gt" | "gte" | "lt" | "lte"
  | "has_tag" | "has_not_tag";

export interface FilterCondition {
  field: string;       // columna SQL, ej. sources.year, excerpts.locator, tags.name
  operator: FilterOperator;
  value: string | string[] | null;
  combinator?: "AND" | "OR"; // cómo se une con la siguiente condición
  not?: boolean;       // NOT sobre esta condición
}

export interface FilterGroup {
  conditions: FilterCondition[];
  combinator: "AND" | "OR";
}

/* ===================== Hito 3: Matriz de síntesis ===================== */

export interface MatrixCell {
  rowId: number;       // id del source (fila)
  columnTagId: number; // id del tag (columna)
  items: Array<{
    type: "excerpt" | "note";
    id: number;
    text: string;      // preview del texto
    locator?: string;
    noteTitle?: string;
  }>;
  itemCount: number;
}

export interface MatrixQueryResult {
  rows: Array<{
    id: number;
    title: string;     // title del source
    citekey?: string;
  }>;
  columns: Tag[];
  cells: MatrixCell[];
}

export interface SavedView {
  id?: number;
  name: string;
  configJson: string;  // JSON con filtros, columnas, ordenamiento
  createdAt?: string;
  updatedAt?: string;
}

export interface NewSavedView extends Omit<SavedView, "id" | "createdAt" | "updatedAt"> {}

/* ===================== Hito 4: Estructura Capitular ===================== */

export type SectionType = "part" | "chapter" | "section" | "subsection";

export interface Section {
  id?: number;
  title: string;
  type: SectionType;
  parentId?: number | null;
  position?: number;
  ownContent?: string;      // texto propio escrito directamente en esta sección
  wordGoal?: number | null; // meta orientativa de palabras
  createdAt?: string;
  updatedAt?: string;
}

export interface NewSection extends Omit<Section, "id" | "createdAt" | "updatedAt"> {}

export type EvidenceType = "note" | "excerpt";

export interface SectionEvidence {
  id?: number;
  sectionId: number;
  evidenceType: EvidenceType;
  evidenceId: number;
  position?: number;
  createdAt?: string;
}

export interface NewSectionEvidence extends Omit<SectionEvidence, "id" | "createdAt"> {}

export interface SectionEvidenceDetail extends SectionEvidence {
  // Datos resueltos del evidenciado
  evidenceTitle?: string;    // título de la nota o texto del excerpt
  evidenceText?: string;     // texto completo del excerpt o nota
  locator?: string;          // localizador si es excerpt
  citekey?: string;          // citekey si es excerpt (vía su fuente)
}

export interface SectionTreeNode extends Section {
  children: SectionTreeNode[];
  evidenceCount: number;
  ownWordCount: number;
  evidenceWordCount: number;
  totalWordCount: number;
  wordGoal?: number | null;
  progressPct?: number;
}

export interface GapReport {
  orphanSections: Array<{
    id: number;
    title: string;
    type: string;
    path: string;
  }>;
  uncitedSources: Array<{
    id: number;
    title: string;
    citekey: string;
    excerptCount: number;
  }>;
  chapterBalance: Array<{
    id: number;
    title: string;
    ownWords: number;
    evidenceWords: number;
    totalWords: number;
    ratioCitationsPerWord: number;
    wordGoal?: number;
    progressPct?: number;
  }>;
}

export interface WordCountBreakdown {
  ownWords: number;
  evidenceWords: number;
  totalWords: number;
}

/* ===================== Hito 6: Integridad y Cascada ===================== */

export type BrokenLinkType =
  | "wikilink_to_missing_note"
  | "cite_mention_to_missing_source"
  | "transclusion_to_missing_source"
  | "transclusion_to_missing_excerpt";

export interface BrokenLink {
  id: number;
  sourceNoteId: number;
  sourceNoteTitle: string;
  linkType: BrokenLinkType;
  rawText: string;
  target: string; // título de nota o citekey
  locator?: string;
}

export interface IntegrityReport {
  brokenLinks: BrokenLink[];
  orphanSections: Array<{ id: number; title: string; path: string }>;
  uncitedFiledSources: Array<{ id: number; title: string; citekey: string }>;
  duplicateCitekeys: Array<{ citekey: string; count: number }>;
}

/* ===================== Hito 6: Búsqueda de Texto Completo ===================== */

export type FtsEntity = "sources" | "excerpts" | "notes" | "sections" | "all";

export interface FullTextSearchResult {
  entity: FtsEntity;
  id: number;
  title: string;
  snippet: string;
  rank: number;
}

export interface FullTextSearchOptions {
  entity?: FtsEntity;
  fuzzy?: boolean;
  limit?: number;
  offset?: number;
}

/* ===================== Hito 6: Respaldos ===================== */

export interface BackupResult {
  outputPath: string;
  format: "tar.gz" | "zip";
  sizeBytes: number;
  includedFiles: string[];
  createdAt: string;
}

/* ===================== Hito 6: Git ===================== */

export interface GitCommitResult {
  success: boolean;
  message: string;
  hash?: string;
  error?: string;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitStatusResult {
  initialized: boolean;
  clean: boolean;
  changedFiles: string[];
}

/* ===================== Hito 5: Consultas dinámicas ===================== */

export type QueryEntity = "sources" | "excerpts" | "notes" | "sections" | "tags";

export interface QueryCondition {
  field: string;
  operator: FilterOperator;
  value: string | string[] | null;
}

export interface ParsedQuery {
  entity: QueryEntity;
  conditions: QueryCondition[];
  combinator: "AND" | "OR";
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  entity: QueryEntity;
  count: number;
  items: any[];
  sql: string;
}

/* ===================== Hito 5: Exportación académica ===================== */

export type ExportFormat = "markdown" | "latex" | "pdf" | "docx" | "typst";

export interface ExportMetadata {
  title: string;
  author: string;
  date?: string;
  abstract?: string;
  bibliographyPath?: string;
  cslPath?: string;
  language?: string;
  keywords?: string[];
}

export interface CitationStyleDefinition {
  id: string;
  name: string;
  /** Cita entre paréntesis: (Autor, año) */
  cite: (source: Source, locator?: string) => string;
  /** Cita narrativa: Autor (año) */
  citeNarrative?: (source: Source, locator?: string) => string;
  /** Entrada bibliográfica completa */
  bibliography: (source: Source) => string;
}

export type CitationStyle = CitationStyleDefinition;

export interface PrunedBibliography {
  citekeys: string[];
  sources: Source[];
  bibtexContent: string;
}

export interface ExportChapterResult {
  sectionId: number;
  sectionTitle: string;
  content: string;           // Markdown con frontmatter y citas resueltas
  bibliography: PrunedBibliography;
  exportFormat: ExportFormat;
  outputPath?: string;       // si se convirtió con pandoc
}
