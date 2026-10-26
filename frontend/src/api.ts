import axios, { AxiosInstance } from "axios";

const API_BASE = (import.meta as any).env?.VITE_API_URL || "/api";

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

/** Extrae un mensaje legible de un error de axios o de red. */
export function errorMessage(err: any, fallback = "Ocurrió un error inesperado."): string {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

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
  tags?: string[];
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
  notes?: string;
  citekey?: string;
}

export interface DoiImportResult {
  source: Source;
  existing: boolean;
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
  importDoi: (doi: string) =>
    api.post<DoiImportResult>("/sources/import-doi", { doi }).then((r) => r.data),
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
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface NewNote {
  title: string;
  content: string;
  tags?: string[];
}

export const notesApi = {
  list: () => api.get<Note[]>("/notes").then((r) => r.data),
  get: (id: number) => api.get<Note>(`/notes/${id}`).then((r) => r.data),
  create: (data: NewNote) => api.post<Note>("/notes", data).then((r) => r.data),
  update: (id: number, data: Partial<NewNote>) =>
    api.put<Note>(`/notes/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/notes/${id}`).then((r) => r.data),
  search: (q: string) =>
    api.get<Note[]>("/notes/search", { params: { q } }).then((r) => r.data),
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
export type TagType = "concept" | "methodology" | "stance" | "custom";
export type ItemType = "source" | "excerpt" | "note";

export interface Tag {
  id?: number;
  name: string;
  type: TagType;
  color?: string;
  icon?: string;
  createdAt?: string;
}

export interface NewTag {
  name: string;
  type?: TagType;
  color?: string;
  icon?: string;
}

export const tagsApi = {
  list: (type?: TagType) =>
    api
      .get<Tag[]>("/tags", { params: type ? { type } : {} })
      .then((r) => r.data),
  create: (name: string, type: TagType = "custom") =>
    api.post<Tag>("/tags", { name, type }).then((r) => r.data),
  update: (id: number, data: Partial<NewTag>) =>
    api.put<Tag>(`/tags/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/tags/${id}`).then((r) => r.data),
};

export const itemTagsApi = {
  list: (itemType: ItemType, itemId: number) =>
    api.get<Tag[]>(`/items/${itemType}/${itemId}/tags`).then((r) => r.data),
  set: (itemType: ItemType, itemId: number, tags: string[]) =>
    api
      .put<Tag[]>(`/items/${itemType}/${itemId}/tags`, { tags })
      .then((r) => r.data),
};

// ===================== Stats =====================
export interface Stats {
  sources: number;
  excerpts: number;
  notes: number;
  sections: number;
  tags: number;
  links: number;
}

export const statsApi = {
  get: () => api.get<Stats>("/stats").then((r) => r.data),
};

// ===================== Sections =====================
export type SectionType = "part" | "chapter" | "section" | "subsection";

export interface Section {
  id?: number;
  title: string;
  type: SectionType;
  parentId?: number | null;
  position?: number;
  ownContent?: string;
  wordGoal?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SectionTreeNode extends Section {
  children: SectionTreeNode[];
  evidenceCount: number;
  ownWordCount: number;
  evidenceWordCount: number;
  totalWordCount: number;
  progressPct?: number;
}

export interface NewSection {
  title: string;
  type: SectionType;
  parentId?: number | null;
  position?: number;
  ownContent?: string;
  wordGoal?: number | null;
}

export const sectionsApi = {
  list: () => api.get<Section[]>("/sections").then((r) => r.data),
  tree: () => api.get<SectionTreeNode[]>("/sections/tree").then((r) => r.data),
  create: (data: NewSection) =>
    api.post<Section>("/sections", data).then((r) => r.data),
  get: (id: number) => api.get<Section>(`/sections/${id}`).then((r) => r.data),
  update: (id: number, data: Partial<NewSection>) =>
    api.put<Section>(`/sections/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/sections/${id}`).then((r) => r.data),
  reorder: (id: number, parentId?: number | null, position?: number) =>
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
export interface MatrixItem {
  type: "excerpt" | "note";
  id: number;
  text: string;
  locator?: string;
  noteTitle?: string;
}

export interface MatrixCell {
  rowId: number;
  columnTagId: number;
  items: MatrixItem[];
  itemCount: number;
}

export interface MatrixQueryResult {
  rows: Array<{ id: number; title: string; citekey?: string }>;
  columns: Tag[];
  cells: MatrixCell[];
}

export const matrixApi = {
  build: (options?: { filter?: any; tagType?: TagType; rowLimit?: number }) =>
    api.post<MatrixQueryResult>("/matrix", options).then((r) => r.data),
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
export interface BackupGitInfo {
  commit: {
    success: boolean;
    message: string;
    hash?: string;
    error?: string;
    backupTracked?: boolean;
  };
  push?: {
    success: boolean;
    message?: string;
    error?: string;
  };
}

export interface BackupResult {
  outputPath: string;
  sizeBytes: number;
  includedFiles: string[];
  createdAt: string;
  git?: BackupGitInfo;
}

export interface BackupFileInfo {
  path: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupRestoreResult {
  success: boolean;
  backupPath: string;
  safetyCopyPath?: string;
  restoredAt?: string;
  workspace?: string;
  message?: string;
}

export const backupApi = {
  create: (
    outputPath?: string,
    options?: { commit?: boolean; push?: boolean; message?: string }
  ) =>
    api
      .post<BackupResult>("/backup", {
        ...(outputPath ? { outputPath } : {}),
        ...(options?.commit ? { commit: true } : {}),
        ...(options?.push ? { push: true } : {}),
        ...(options?.message ? { message: options.message } : {}),
      })
      .then((r) => r.data),
  list: () => api.get<BackupFileInfo[]>("/backups").then((r) => r.data),
  restore: (backupPath: string) =>
    api
      .post<BackupRestoreResult>("/backups/restore", { path: backupPath })
      .then((r) => r.data),
};

// ===================== Export =====================
export interface ExportMetadata {
  title: string;
  author: string;
  date?: string;
  abstract?: string;
  bibliographyPath?: string;
  language?: string;
  keywords?: string[];
}

export const exportApi = {
  chapter: (
    sectionId: number,
    metadata: ExportMetadata,
    options?: {
      styleId?: string;
      includeBibliography?: boolean;
      bibliographyPath?: string;
      save?: boolean;
      outputDir?: string;
      format?: "markdown" | "latex" | "pdf" | "docx" | "typst";
    }
  ) =>
    api.post("/export/chapter", { sectionId, metadata, ...options }).then((r) => r.data),
};

// ===================== Workspace =====================
export interface WorkspaceInfo {
  path: string;
  source: "settings" | "env" | "default";
  configured: string | null;
  defaultPath: string;
  exists: boolean;
  writable: boolean;
  isGitRepo: boolean;
  gitAvailable: boolean;
  branch: string | null;
  remote: string | null;
  remoteConfigured: string | null;
  remoteMatchesConfig: boolean | null;
  backupsDir: string;
  exportDir: string;
  warning: string | null;
  success?: boolean;
  reset?: boolean;
  applied?: boolean;
}

export const workspaceApi = {
  get: () => api.get<WorkspaceInfo>("/workspace").then((r) => r.data),
  update: (path: string | null) =>
    api.put<WorkspaceInfo>("/workspace", { path }).then((r) => r.data),
  setRemote: (url: string | null) =>
    api.put<WorkspaceInfo>("/workspace/remote", { url }).then((r) => r.data),
};

// ===================== Git =====================
export interface GitStatus {
  available: boolean;
  workspace?: string;
  initialized: boolean;
  clean: boolean;
  changedFiles: string[];
  branch?: string | null;
  remote?: string | null;
  hasUpstream?: boolean;
  ahead?: number;
  behind?: number;
  lastCommit?: { hash: string; message: string; date: string } | null;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitCommitResult {
  success: boolean;
  message?: string;
  hash?: string;
  error?: string;
}

export interface GitPushResult {
  success: boolean;
  branch?: string;
  remote?: string;
  message?: string;
  error?: string;
  commit?: GitCommitResult;
}

export interface GitPullResult {
  success: boolean;
  mode: "ff-only" | "reset";
  branch?: string;
  remote?: string;
  updated?: boolean;
  previousHead?: string;
  newHead?: string;
  safetyCommit?: string;
  safetyBranch?: string;
  message?: string;
  error?: string;
}

export interface GitRestoreResult {
  success: boolean;
  commit?: string;
  previousHead?: string;
  newHead?: string;
  safetyCommit?: string;
  changed?: boolean;
  message?: string;
  error?: string;
}

export const gitApi = {
  status: () => api.get<GitStatus>("/git/status").then((r) => r.data),
  log: (limit = 20) =>
    api.get<GitLogEntry[]>("/git/log", { params: { limit } }).then((r) => r.data),
  diff: (params?: { from?: string; to?: string; file?: string }) =>
    api
      .get<{ diff: string }>("/git/diff", { params })
      .then((r) => r.data),
  commit: (message: string) =>
    api.post<GitCommitResult>("/git/commit", { message }).then((r) => r.data),
  init: () => api.post("/git/init").then((r) => r.data),
  push: (options?: { branch?: string; message?: string }) =>
    api.post<GitPushResult>("/git/push", options ?? {}).then((r) => r.data),
  pull: (mode: "ff-only" | "reset" = "ff-only") =>
    api.post<GitPullResult>("/git/pull", { mode }).then((r) => r.data),
  restoreCommit: (commit: string) =>
    api.post<GitRestoreResult>("/git/restore", { commit }).then((r) => r.data),
};

// ===================== Mantenimiento =====================
export const maintenanceApi = {
  vacuum: () => api.post("/maintenance/vacuum").then((r) => r.data),
};

export default api;
