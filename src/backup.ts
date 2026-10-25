/**
 * Tesista - Hito 6
 * Estrategia de Respaldos y Portabilidad.
 *
 * Crea un paquete de respaldo de un solo clic que empaqueta la base de datos
 * SQLite completa junto con exportaciones JSON de todas las tablas y archivos
 * Markdown planos de las notas, en un archivo .tar.gz estructurado.
 *
 * La estructura guardada en disco es totalmente legible sin necesidad de la app:
 *   backup/
 *     manifest.json          -- metadatos del respaldo
 *     data/tesista.db        -- base de datos SQLite
 *     export/                -- JSON de cada tabla
 *     notes/                 -- archivos .md plano por nota
 */

import { TesistaDB } from "./db.js";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { BackupResult } from "./types.js";

export type BackupFormat = "tar.gz";

/**
 * Crea un respaldo completo de la base de datos y exportaciones.
 *
 * @param db - Instancia de la base de datos
 * @param outputPath - Ruta del archivo de salida (.tar.gz)
 * @returns BackupResult con detalles del respaldo
 */
export function createBackup(
  db: TesistaDB,
  outputPath: string
): BackupResult {
  const fsModule = fs;
  const tmpDir = fsModule.mkdtempSync(path.join(os.tmpdir(), "tesista-backup-"));

  try {
    const includedFiles: string[] = [];

    // 1. Copiar la base de datos SQLite
    const dbPath = db.getDbPath();
    const backupDataDir = path.join(tmpDir, "data");
    fsModule.mkdirSync(backupDataDir, { recursive: true });
    if (dbPath && fsModule.existsSync(dbPath)) {
      // Forzar checkpoint para vaciar WAL al archivo principal
      db.getDb().pragma("wal_checkpoint(TRUNCATE)");
      fsModule.copyFileSync(dbPath, path.join(backupDataDir, "tesista.db"));
      includedFiles.push("data/tesista.db");
    }

    // 2. Exportar todas las tablas a JSON
    const exportDir = path.join(tmpDir, "export");
    fsModule.mkdirSync(exportDir, { recursive: true });

    const tables: Array<{ name: string; data: any[] }> = [
      { name: "sources", data: db.listSources() },
      { name: "excerpts", data: db.listExcerpts() },
      { name: "notes", data: db.listNotes() },
      { name: "sections", data: db.listSections() },
      { name: "tags", data: db.listTags() },
      { name: "section_evidences", data: getSectionEvidencesAll(db) },
      { name: "saved_views", data: db.listSavedViews() },
      { name: "links", data: db.getAllLinks() },
    ];

    for (const table of tables) {
      const filePath = path.join(exportDir, `${table.name}.json`);
      fsModule.writeFileSync(filePath, JSON.stringify(table.data, null, 2), "utf-8");
      includedFiles.push(`export/${table.name}.json`);
    }

    // 3. Exportar notas como archivos Markdown planos
    const notesDir = path.join(tmpDir, "notes");
    fsModule.mkdirSync(notesDir, { recursive: true });
    const notes = db.listNotes();
    for (const note of notes) {
      if (!note.id) continue;
      const safeTitle = slugFileName(note.title);
      const fileName = `${note.id}_${safeTitle}.md`;
      const filePath = path.join(notesDir, fileName);
      const content = `# ${note.title}\n\n${note.content}\n`;
      fsModule.writeFileSync(filePath, content, "utf-8");
      includedFiles.push(`notes/${fileName}`);
    }

    // 4. Manifiesto
    const manifest = {
      createdAt: new Date().toISOString(),
      version: "1.0.0",
      app: "tesista",
      tables: tables.map((t) => t.name),
      noteCount: notes.length,
      includedFiles,
    };
    fsModule.writeFileSync(
      path.join(tmpDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );
    includedFiles.push("manifest.json");

    // 5. Comprimir a .tar.gz
    const outDir = path.dirname(path.resolve(outputPath));
    if (outDir && !fsModule.existsSync(outDir)) {
      fsModule.mkdirSync(outDir, { recursive: true });
    }

    const tarFile = path.resolve(outputPath);
    const tarCmd = `tar -czf "${tarFile}" -C "${tmpDir}" .`;
    execSync(tarCmd, { stdio: "pipe", encoding: "utf-8" });

    const stat = fsModule.statSync(tarFile);

    return {
      outputPath: tarFile,
      format: "tar.gz",
      sizeBytes: stat.size,
      includedFiles,
      createdAt: manifest.createdAt,
    };
  } finally {
    // Limpiar directorio temporal
    try {
      fsModule.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignorar
    }
  }
}



/**
 * Obtiene todas las section_evidences de todas las secciones.
 * (TesistaDB no expone listar todas, así que las recolectamos sección por sección).
 */
function getSectionEvidencesAll(db: TesistaDB): any[] {
  const all: any[] = [];
  const sections = db.listSections();
  for (const s of sections) {
    if (!s.id) continue;
    const evs = db.getSectionEvidences(s.id);
    for (const ev of evs) {
      all.push({ ...ev, sectionId: s.id });
    }
  }
  return all;
}

/**
 * Genera un nombre de archivo seguro a partir de un título.
 */
function slugFileName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "nota";
}

/**
 * Verifica si el comando tar está disponible en el sistema.
 */
export function isBackupAvailable(): boolean {
  try {
    execSync("tar --version", { stdio: "pipe", encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista el contenido de un archivo de respaldo .tar.gz sin extraerlo.
 */
export function listBackupContents(backupPath: string): string[] {
  const output = execSync(`tar -tzf "${backupPath}"`, {
    stdio: "pipe",
    encoding: "utf-8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Extrae un respaldo a un directorio destino.
 */
export function extractBackup(backupPath: string, destDir: string): void {
  const fsModule = fs;
  if (!fsModule.existsSync(destDir)) {
    fsModule.mkdirSync(destDir, { recursive: true });
  }
  execSync(`tar -xzf "${backupPath}" -C "${destDir}"`, {
    stdio: "pipe",
    encoding: "utf-8",
  });
}
