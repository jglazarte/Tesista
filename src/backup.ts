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
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { BackupResult, BackupFileInfo, BackupRestoreResult } from "./types.js";

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
      { name: "item_tags", data: db.listItemTags() },
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
    execFileSync("tar", ["-czf", tarFile, "-C", tmpDir, "."], {
      stdio: "pipe",
      encoding: "utf-8",
    });

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
 * Lista los respaldos `.tar.gz`/`.tgz` disponibles en un directorio.
 * Se ordenan del más reciente al más antiguo.
 */
export function listBackups(dir: string): BackupFileInfo[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() && /\.(tar\.gz|tgz)$/i.test(entry.name)
      )
      .map((entry) => {
        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          path: fullPath,
          fileName: entry.name,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Comprueba que el archivo tenga la cabecera de una base SQLite. */
function isSqliteFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(16);
      const read = fs.readSync(fd, header, 0, header.length, 0);
      return (
        read === header.length &&
        header.toString("utf-8") === "SQLite format 3\u0000"
      );
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * Restaura la base de datos activa desde un respaldo `.tar.gz`.
 *
 * Antes de reemplazarla guarda una copia de la base actual junto al archivo
 * original (`<db>.bak-<fecha>`), para poder volver atrás. La base debe estar
 * cerrada: el servidor se encarga de cerrarla y reabrirla.
 */
export function restoreBackupToDatabase(
  backupPath: string,
  dbPath: string
): BackupRestoreResult {
  const archive = path.resolve(backupPath);
  if (!fs.existsSync(archive)) {
    throw new Error(`No existe el respaldo: ${archive}`);
  }
  if (!/\.(tar\.gz|tgz)$/i.test(archive)) {
    throw new Error("El respaldo debe ser un archivo .tar.gz o .tgz.");
  }

  const entry = listBackupContents(archive).find(
    (item) => item.replace(/^\.\//, "") === "data/tesista.db"
  );
  if (!entry) {
    throw new Error(
      "El respaldo no contiene data/tesista.db; no parece un respaldo de Tesista."
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tesista-restore-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", tmpDir, entry], {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120000,
    });

    const extracted = path.join(tmpDir, "data", "tesista.db");
    if (!fs.existsSync(extracted) || !isSqliteFile(extracted)) {
      throw new Error("La base incluida en el respaldo no es un archivo SQLite válido.");
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let safetyCopyPath: string | undefined;
    if (fs.existsSync(dbPath)) {
      safetyCopyPath = `${dbPath}.bak-${stamp}`;
      fs.copyFileSync(dbPath, safetyCopyPath);
    }

    // Descartar restos de WAL/SHM de la base anterior: el archivo nuevo
    // reemplaza por completo a la base activa.
    for (const suffix of ["-wal", "-shm"]) {
      try {
        fs.rmSync(`${dbPath}${suffix}`, { force: true });
      } catch {
        // ignorar
      }
    }

    fs.copyFileSync(extracted, dbPath);

    return {
      backupPath: archive,
      safetyCopyPath,
      restoredAt: new Date().toISOString(),
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignorar
    }
  }
}

/**
 * Verifica si el comando tar está disponible en el sistema.
 */
export function isBackupAvailable(): boolean {
  try {
    execFileSync("tar", ["--version"], {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista el contenido de un archivo de respaldo .tar.gz sin extraerlo.
 */
export function listBackupContents(backupPath: string): string[] {
  const output = execFileSync("tar", ["-tzf", backupPath], {
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
  execFileSync("tar", ["-xzf", backupPath, "-C", destDir], {
    stdio: "pipe",
    encoding: "utf-8",
  });
}
