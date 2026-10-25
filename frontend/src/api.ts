import axios, { AxiosInstance } from "axios";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// ===================== Sources =====================
export interface Source {
  id?: number;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  isbn?: string;
  publisher?: string;
  containerTitle?: string;
  bibtexType?: string;
  citekey: string;
  readStatus: string;
  notes?: string;
  dateAdded?: string;
  dateModified?: string;
}

export interface NewSource {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  isbn?: string;
  publisher?: string;
  containerTitle?: string;
  bibtexType?: string;
  readStatus?: string;
}

export const sourcesApi = {
  list: () => api.get<Source[]>("/sources").then((r) => r.data),
  get: (id: number) => api.get<Source>(`/sources/${id}`).then((r) => r.data),
  getByCitekey: (citekey: string) =>
    api.get<Source>(`/sources/citekey/${citekey}`).then((r) => r.data),
  create: (data: NewSource) => api.post<Source>("/sources", data).then((r) => r.data),
  update: (id: number, data: Partial<NewSource>) =>
    api.put<Source>(`/sources/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/sources/${id}`).then((r) => r.data),
};

// ===================== Excerpts =====================
export interface Excerpt {
  id?: number;
  sourceId: number;
  text: string;
  locator: string;
  context?: string;
  tags?: string[];
  dateAdded?: string;
}

export interface NewExcerpt {
  sourceId: number;
  text: string;
  locator: string;
  context?: string;
  tags?: string[];
}

export const excerptsApi = {
  list: (sourceId?: number) =>
    api
      .get<Excerpt[]>("/excerpts", { params: sourceId ? { sourceId } : {} })
      .then((r) => r.data),
  get: (id: number) => api.get<Excerpt>(`/excerpts/${id}`).then((r) => r.data),
  create: (data: NewExcerpt) =>
    api.post<Excerpt>("/excerpts", data).then((r) => r.data),
  update: (id: number, data: Partial<NewExcerpt>) =>
    api.put<Excerpt>(`/excerpts/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/excerpts/${id}`).then((r) => r.data),
};

// ===================== Notes =====================
export interface Note {
  id?: number;
  title: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NewNote {
  title: string;
  content: string;
}

export const notesApi = {
  list: () => api.get<Note[]>("/notes").then((r) => r.data),
  get: (id: number) => api.get<Note>(`/notes/${id}`).then((r) => r.data),
  create: (data: NewNote) => api.post<Note>("/notes", data).then((r) => r.data),
  update: (id: number, data: Partial<NewNote>) =>
    api.put<Note>(`/notes/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/notes/${id}`).then((r) => r.data),
  search: (q: string) => api.get<Note[]>(`/notes/search?q=${q}`).then((r) => r.data),
  outgoing: (id: number) =>
    api.get<any[]>(`/notes/${id}/outgoing`).then((r) => r.data),
  backlinks: (id: number) =>
    api.get<any[]>(`/notes/${id}/backlinks`).then((r) => r.data),
  unlinked: (id: number) =>
    api.get<any[]>(`/notes/${id}/unlinked`).then((r) => r.data),
  resolveTransclusion: (citekey: string, locator: string) =>
    api
      .get<Excerpt>("/notes/transclude", { params: { citekey, locator } })
      .then((r) => r.data),
};

// ===================== Tags =====================
export interface Tag {
  id?: number;
  name: string;
  type: "concept" | "methodology" | "stance" | "custom";
  color?: string;
  icon?: string;
}

export interface NewTag {
  name: string;
  type: string;
  color?: string;
  icon?: string;
}

export const tagsApi = {
  list: (type?: string) =>
    api
      .get<Tag[]>("/tags", { params: type ? { type } : {} })
      .then((r) => r.data),
  create: (data: NewTag) => api.post<Tag>("/tags", data).then((r) => r.data),
};

// ===================== Sections =====================
export type SectionType = "part" | "chapter" | "section" | "subsection";

export interface Section {
  id?: number;
  title: string;
  type: SectionType;
  parentId?: number;
  position?: number;
  ownContent?: string;
  wordGoal?: number;
  children?: Section[];
  evidenceCount?: number;
  ownWordCount?: number;
  evidenceWordCount?: number;
  totalWordCount?: number;
  progressPct?: number;
}

export interface NewSection {
  title: string;
  type: SectionType;
  parentId?: number;
  position?: number;
  ownContent?: string;
  wordGoal?: number;
}

export const sectionsApi = {
  list: () => api.get<Section[]>("/sections").then((r) => r.data),
  tree: () => api.get<Section[]>("/sections/tree").then((r) => r.data),
  create: (data: NewSection) =>
    api.post<Section>("/sections", data).then((r) => r.data),
  get: (id: number) => api.get<Section>(`/sections/${id}`).then((r) => r.data),
  update: (id: number, data: Partial<NewSection>) =>
    api.put<Section>(`/sections/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/sections/${id}`).then((r) => r.data),
  reorder: (id: number, parentId?: number, position?: number) =>
    api
      .post(`/sections/${id}/reorder`, { parentId, position })
      .then((r) => r.data),
};

// ===================== Evidences =====================
export interface SectionEvidence {
  id?: number;
  sectionId: number;
  evidenceType: "note" | "excerpt";
  evidenceId: number;
  position?: number;
  evidenceTitle?: string;
  evidenceText?: string;
  locator?: string;
  citekey?: string;
}

export interface NewSectionEvidence {
  sectionId: number;
  evidenceType: "note" | "excerpt";
  evidenceId: number;
  position?: number;
}

export const evidencesApi = {
  create: (data: NewSectionEvidence) =>
    api.post<SectionEvidence>("/evidences", data).then((r) => r.data),
  listBySection: (sectionId: number) =>
    api
      .get<SectionEvidence[]>(`/sections/${sectionId}/evidences`)
      .then((r) => r.data),
  delete: (id: number) => api.delete(`/evidences/${id}`).then((r) => r.data),
};

// ===================== Word Count =====================
export interface WordCountBreakdown {
  ownWords: number;
  evidenceWords: number;
  totalWords: number;
}

export const wordCountApi = {
  get: (sectionId: number) =>
    api
      .get<WordCountBreakdown>(`/sections/${sectionId}/word-count`)
      .then((r) => r.data),
};

// ===================== Gap Report =====================
export interface GapReport {
  orphanSections: Array<{ id: number; title: string; type: string; path: string }>;
  uncitedSources: Array<{ id: number; title: string; citekey: string; excerptCount: number }>;
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

export const gapReportApi = {
  get: () => api.get<GapReport>("/gap-report").then((r) => r.data),
};

// ===================== Matrix =====================
export interface MatrixQueryResult {
  rows: Array<{ id: number; title: string; citekey?: string }>;
  columns: Tag[];
  cells: Array<{
    rowId: number;
    columnTagId: number;
    items: Array<{
      type: "excerpt" | "note";
      id: number;
      text: string;
      locator?: string;
      noteTitle?: string;
    }>;
    itemCount: number;
  }>;
}

export const matrixApi = {
  build: (options?: { filter?: any; tagType?: string; rowLimit?: number }) =>
    api
      .post<MatrixQueryResult>("/matrix", options)
      .then((r) => r.data),
};

// ===================== Integrity =====================
export interface BrokenLink {
  id: number;
  sourceNoteId: number;
  sourceNoteTitle: string;
  linkType: string;
  rawText: string;
  target: string;
  locator?: string;
}

export interface IntegrityReport {
  brokenLinks: BrokenLink[];
  orphanSections: Array<{ id: number; title: string; type: string; path: string }>;
  uncitedFiledSources: Array<{ id: number; title: string; citekey: string }>;
  duplicateCitekeys: Array<{ citekey: string; count: number }>;
}

export const integrityApi = {
  get: () => api.get<IntegrityReport>("/integrity").then((r) => r.data),
};

// ===================== Backup =====================
export const backupApi = {
  create: (outputPath: string) =>
    api
      .post<{ outputPath: string; sizeBytes: number }>("/backup", {
        outputPath,
      })
      .then((r) => r.data),
};

// ===================== Export =====================
export const exportApi = {
  chapter: (
    sectionId: number,
    metadata: { title: string; author: string; date?: string; abstract?: string },
    options?: { styleId?: string; includeBibliography?: boolean; bibliographyPath?: string }
  ) =>
    api.post("/export/chapter", { sectionId, metadata, ...options }).then((r) => r.data),
};

export default api;
