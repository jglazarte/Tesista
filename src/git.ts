/**
 * Tesista - Hito 6
 * Integración con Control de Versiones (Git).
 *
 * Abstracción ligera sobre Git usando comandos nativos del sistema.
 * Permite auto-commits periódicos o por hito de escritura, y proporciona
 * una vista simple de historial de cambios (diffs) para recuperar versiones
 * previas de capítulos o notas.
 *
 * Todas las invocaciones usan execFileSync con el ejecutable "git" y sus
 * argumentos como array, evitando depender de /bin/sh (que puede no existir
 * en entornos aislados).
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type {
  GitCommitResult,
  GitStatusResult,
  GitLogEntry,
} from "./types.js";

function runGit(dir: string, args: string[], opts?: { timeout?: number }): string {
  return execFileSync("git", args, {
    cwd: dir,
    stdio: "pipe",
    encoding: "utf-8",
    timeout: opts?.timeout ?? 30000,
  }).trim();
}

/**
 * Verifica si Git está instalado en el sistema.
 */
export function isGitAvailable(): boolean {
  try {
    runGit(process.cwd(), ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica si un directorio es un repositorio Git.
 */
export function isGitRepo(dir: string): boolean {
  try {
    runGit(dir, ["rev-parse", "--is-inside-work-tree"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inicializa un repositorio Git en el directorio dado.
 */
export function gitInit(dir: string): void {
  runGit(dir, ["init"]);
}

/**
 * Asegura que el directorio sea un repositorio Git. Si no lo está, lo inicializa.
 */
export function ensureGitRepo(dir: string): void {
  if (!isGitRepo(dir)) {
    gitInit(dir);
  }
}

/**
 * Agrega todos los cambios al área de staging.
 */
export function gitAddAll(dir: string): void {
  runGit(dir, ["add", "-A"]);
}

/**
 * Crea un commit con el mensaje dado.
 */
export function gitCommit(dir: string, message: string): GitCommitResult {
  try {
    ensureGitRepo(dir);
    gitAddAll(dir);

    const hash = runGit(dir, ["commit", "-m", message]).trim();

    // Obtener el hash del commit recién creado
    const headHash = runGit(dir, ["rev-parse", "HEAD"]).trim();

    return {
      success: true,
      message,
      hash: headHash,
    };
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    return {
      success: false,
      message,
      error: `STDOUT: ${stdout}\nSTDERR: ${stderr}`,
    };
  }
}

/**
 * Realiza un auto-commit si hay cambios pendientes.
 * Útil para commits por hito de escritura o periódicos.
 */
export function autoCommit(
  dir: string,
  message: string
): { committed: boolean; hash?: string; error?: string } {
  try {
    ensureGitRepo(dir);
    const status = gitStatus(dir);
    if (!status.changedFiles.length && status.clean) {
      return { committed: false };
    }
    const result = gitCommit(dir, message);
    if (result.success) {
      return { committed: true, hash: result.hash };
    }
    return { committed: false, error: result.error };
  } catch (err: any) {
    return { committed: false, error: err.message };
  }
}

/**
 * Devuelve el estado del repositorio: archivos cambiados y si está limpio.
 */
export function gitStatus(dir: string): GitStatusResult {
  if (!isGitRepo(dir)) {
    return { initialized: false, clean: true, changedFiles: [] };
  }

  const changedOutput = runGit(dir, ["status", "--porcelain"]);

  const changedFiles = changedOutput
    ? changedOutput.split("\n").map((line) => {
        // Formato: "XY path" o "XY path1 -> path2" (renames)
        const parts = line.trim().slice(3);
        return parts;
      })
    : [];

  return {
    initialized: true,
    clean: changedFiles.length === 0,
    changedFiles,
  };
}

/**
 * Devuelve el historial de commits.
 */
export function gitLog(
  dir: string,
  maxCount: number = 20
): GitLogEntry[] {
  if (!isGitRepo(dir)) return [];

  const output = runGit(
    dir,
    ["log", `--max-count=${maxCount}`, "--pretty=format:%H%x09%an%x09%ad%x09%s", "--date=short"]
  );

  if (!output) return [];

  return output.split("\n").map((line) => {
    const [hash, author, date, ...messageParts] = line.split("\t");
    return {
      hash,
      author,
      date,
      message: messageParts.join("\t"),
    };
  });
}

/**
 * Obtiene el diff entre dos commits (o entre el working tree y un commit).
 */
export function gitDiff(
  dir: string,
  options?: { from?: string; to?: string; file?: string }
): string {
  if (!isGitRepo(dir)) return "";

  const args: string[] = ["diff"];
  if (options?.from) args.push(options.from);
  if (options?.to) args.push(options.to);
  if (options?.file) args.push("--", options.file);

  try {
    return runGit(dir, args);
  } catch {
    return "";
  }
}

/**
 * Obtiene el contenido de un archivo en un commit específico.
 */
export function gitShowFile(dir: string, commit: string, file: string): string | null {
  if (!isGitRepo(dir)) return null;
  try {
    return runGit(dir, ["show", `${commit}:${file}`]);
  } catch {
    return null;
  }
}

/**
 * Crea un .gitignore básico para el proyecto Tesista (excluye la DB activa si se desea,
 * aunque se recomienda versionarla para portabilidad).
 */
export function writeGitIgnore(dir: string): void {
  const gitignore = `# Tesista
# Base de datos (se recomienda versionar para portabilidad)
# data/tesista.db

# Exportaciones temporales
export/
*.tmp
`;
  fs.writeFileSync(path.join(dir, ".gitignore"), gitignore, "utf-8");
}

/**
 * Configura user.name y user.email por defecto si no están definidos,
 * necesarios para poder hacer commits.
 */
export function ensureGitUser(dir: string): void {
  try {
    runGit(dir, ["config", "user.name"], { timeout: 5000 });
  } catch {
    runGit(dir, ["config", "user.name", "Tesista Usuario"], { timeout: 5000 });
  }
  try {
    runGit(dir, ["config", "user.email"], { timeout: 5000 });
  } catch {
    runGit(dir, ["config", "user.email", "tesista@localhost"], { timeout: 5000 });
  }
}
