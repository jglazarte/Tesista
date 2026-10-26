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
  GitPushResult,
  GitPullResult,
  GitRestoreResult,
  GitStatusResult,
  GitLogEntry,
} from "./types.js";

function runGit(
  dir: string,
  args: string[],
  opts?: { timeout?: number; env?: NodeJS.ProcessEnv; raw?: boolean }
): string {
  const output = execFileSync("git", args, {
    cwd: dir,
    stdio: "pipe",
    encoding: "utf-8",
    timeout: opts?.timeout ?? 30000,
    env: opts?.env ? { ...process.env, ...opts.env } : process.env,
  });
  // `--porcelain` distingue " M path" de "M  path"; recortar el inicio
  // rompería el ancho fijo de la primera línea.
  return opts?.raw ? output.replace(/\r?\n$/, "") : output.trim();
}

/**
 * Entorno para operaciones de red: evita que Git quede esperando credenciales
 * que nadie puede escribir. La autenticación por clave/agente sigue funcionando.
 */
function networkEnv(): NodeJS.ProcessEnv {
  return {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
  };
}

/** Extrae el mensaje más útil de un error de Git. */
function gitErrorMessage(err: any): string {
  const stderr = err?.stderr ? err.stderr.toString().trim() : "";
  const stdout = err?.stdout ? err.stdout.toString().trim() : "";
  return stderr || stdout || err?.message || "Error desconocido de Git.";
}

/** Agrega una pista cuando el error parece de credenciales. */
function authHint(message: string): string {
  return /could not read Username|Authentication failed|terminal prompts disabled|Permission denied/i.test(
    message
  )
    ? " Configurá credenciales de Git para este remoto (token o clave SSH)."
    : "";
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

/** Fecha y hora local en formato `YYYY-MM-DD HH:mm:ss`. */
export function localTimestamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Devuelve el nombre de una operación de Git en curso (merge, rebase, etc.)
 * o null si el repositorio está en un estado seguro para operar.
 */
function gitOperationInProgress(dir: string): string | null {
  try {
    const rawGitDir = runGit(dir, ["rev-parse", "--git-dir"], { timeout: 5000 });
    const gitDir = path.isAbsolute(rawGitDir)
      ? rawGitDir
      : path.join(dir, rawGitDir);
    const markers: Array<[string, string]> = [
      ["MERGE_HEAD", "una fusión (merge)"],
      ["CHERRY_PICK_HEAD", "un cherry-pick"],
      ["REVERT_HEAD", "una reversión"],
      ["rebase-merge", "un rebase"],
      ["rebase-apply", "un rebase"],
    ];
    for (const [marker, label] of markers) {
      if (fs.existsSync(path.join(gitDir, marker))) return label;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Asegura que los archivos auxiliares de SQLite no se versionen.
 *
 * `wal` y `shm` cambian mientras la app está abierta y no aportan nada al
 * repositorio; versionarlos haría que el árbol esté siempre "sucio". Se usa
 * `.git/info/exclude` (local al clon, no modifica el `.gitignore` del usuario).
 */
function ensureGitExcludes(dir: string): void {
  const rules = ["*.db-wal", "*.db-shm", "*.db.bak-*"];
  try {
    const rawGitDir = runGit(dir, ["rev-parse", "--git-dir"], { timeout: 5000 });
    const gitDir = path.isAbsolute(rawGitDir)
      ? rawGitDir
      : path.join(dir, rawGitDir);
    const infoDir = path.join(gitDir, "info");
    fs.mkdirSync(infoDir, { recursive: true });
    const excludePath = path.join(infoDir, "exclude");
    const current = fs.existsSync(excludePath)
      ? fs.readFileSync(excludePath, "utf-8")
      : "";
    const existing = current.split(/\r?\n/).map((line) => line.trim());
    const missing = rules.filter((rule) => !existing.includes(rule));
    if (missing.length > 0) {
      const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      fs.appendFileSync(
        excludePath,
        `${separator}# Tesista: archivos auxiliares de SQLite\n${missing.join("\n")}\n`,
        "utf-8"
      );
    }
  } catch {
    // Si no se puede escribir, el filtro de `git add` sigue protegiendo.
  }
}

/** Quita del índice los auxiliares de SQLite que se hubieran versionado antes. */
function untrackSqliteAuxFiles(dir: string): void {
  try {
    const tracked = runGit(dir, ["ls-files", "-z"], { timeout: 10000, raw: true })
      .split("\0")
      .filter(
        (file) =>
          /\.db-wal$/i.test(file) ||
          /\.db-shm$/i.test(file) ||
          /\.db\.bak-/i.test(file)
      );
    if (tracked.length > 0) {
      runGit(dir, ["rm", "--cached", "--quiet", "--", ...tracked], {
        timeout: 10000,
      });
    }
  } catch {
    // Si falla, `git add` con exclusiones evita volver a agregarlos.
  }
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
  ensureGitExcludes(dir);
}

/**
 * Asegura que el directorio sea un repositorio Git. Si no lo está, lo inicializa.
 */
export function ensureGitRepo(dir: string): void {
  if (!isGitRepo(dir)) {
    gitInit(dir);
  } else {
    ensureGitExcludes(dir);
  }
}

/**
 * Devuelve la URL del remoto indicado (por defecto `origin`), o null.
 */
export function gitRemote(dir: string, name: string = "origin"): string | null {
  if (!isGitRepo(dir)) return null;
  try {
    const url = runGit(dir, ["remote", "get-url", name], { timeout: 5000 });
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/**
 * Devuelve la rama activa. En un repositorio sin commits devuelve null.
 */
export function gitBranch(dir: string): string | null {
  if (!isGitRepo(dir)) return null;
  try {
    const branch = runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"], {
      timeout: 5000,
    });
    return branch && branch !== "HEAD" ? branch : null;
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza el remoto del repositorio. Si no hay remoto `origin`, lo agrega.
 */
export function gitSetRemote(
  dir: string,
  url: string,
  name: string = "origin"
): void {
  ensureGitRepo(dir);
  if (gitRemote(dir, name)) {
    runGit(dir, ["remote", "set-url", name, url], { timeout: 10000 });
  } else {
    runGit(dir, ["remote", "add", name, url], { timeout: 10000 });
  }
}

/**
 * Indica si un archivo está versionado en el repositorio.
 */
export function gitIsTracked(dir: string, file: string): boolean {
  if (!isGitRepo(dir)) return false;
  try {
    runGit(dir, ["ls-files", "--error-unmatch", "--", file], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Indica si una ruta está excluida por .gitignore u otra regla de Git.
 */
export function gitIsIgnored(dir: string, file: string): boolean {
  if (!isGitRepo(dir)) return false;
  try {
    runGit(dir, ["check-ignore", "--quiet", "--", file], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Sube la rama activa al remoto. Desactiva los prompts interactivos para
 * fallar rápido si no hay credenciales disponibles.
 */
export function gitPush(
  dir: string,
  opts?: { branch?: string; setUpstream?: boolean; timeout?: number }
): GitPushResult {
  if (!isGitRepo(dir)) {
    return { success: false, error: "El directorio no es un repositorio Git." };
  }
  const remote = gitRemote(dir);
  if (!remote) {
    return {
      success: false,
      error: "El repositorio no tiene un remoto configurado (`origin`).",
    };
  }
  const branch = opts?.branch ?? gitBranch(dir);
  if (!branch) {
    return {
      success: false,
      error: "El repositorio todavía no tiene commits para subir.",
    };
  }

  const args = ["push"];
  if (opts?.setUpstream !== false) args.push("--set-upstream");
  args.push("origin", branch);

  try {
    const output = runGit(dir, args, {
      timeout: opts?.timeout ?? 120000,
      env: networkEnv(),
    });
    return {
      success: true,
      branch,
      remote,
      message: output || `Push completado: origin/${branch}`,
    };
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    const stdout = err.stdout ? err.stdout.toString().trim() : "";
    const hint = authHint(stderr);
    return {
      success: false,
      branch,
      remote,
      error: `${stderr || stdout || err.message}${hint}`.trim(),
    };
  }
}

/**
 * Trae cambios del remoto.
 *
 * - `ff-only` (por defecto): descarga y solo avanza si la historia local puede
 *   avanzar sin fusionar. Es el modo seguro para una base SQLite versionada,
 *   porque evita mezclar dos bases de datos distintas.
 * - `reset`: descarta la historia local y deja la rama igual a `origin/<rama>`.
 *   Antes guarda los cambios pendientes en un commit y crea una rama de
 *   seguridad para poder recuperarlos.
 *
 * No se debe invocar mientras la base SQLite está abierta si el archivo de la
 * base vive dentro del repositorio: el servidor la cierra y la reabre alrededor
 * de la operación.
 */
export function gitPull(
  dir: string,
  opts?: { branch?: string; mode?: "ff-only" | "reset"; timeout?: number }
): GitPullResult {
  const mode = opts?.mode === "reset" ? "reset" : "ff-only";

  if (!isGitRepo(dir)) {
    return {
      success: false,
      mode,
      error: "El directorio no es un repositorio Git.",
    };
  }
  const remote = gitRemote(dir);
  if (!remote) {
    return {
      success: false,
      mode,
      error: "El repositorio no tiene un remoto configurado (`origin`).",
    };
  }
  const branch = opts?.branch ?? gitBranch(dir);
  if (!branch) {
    return {
      success: false,
      mode,
      remote,
      error: "El repositorio todavía no tiene commits ni una rama activa.",
    };
  }

  const inProgress = gitOperationInProgress(dir);
  if (inProgress) {
    return {
      success: false,
      mode,
      branch,
      remote,
      error: `Hay ${inProgress} en curso. Terminala o cancelala antes de traer cambios.`,
    };
  }

  const timeout = opts?.timeout ?? 120000;

  try {
    // Primero se descarga: así la interfaz puede mostrar cuántos commits
    // faltan incluso si el pull no puede aplicarse.
    runGit(dir, ["fetch", "origin"], { timeout, env: networkEnv() });

    try {
      runGit(
        dir,
        ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
        { timeout: 10000 }
      );
    } catch {
      return {
        success: false,
        mode,
        branch,
        remote,
        error: `La rama "${branch}" todavía no existe en origin. Hacé Push primero para crearla.`,
      };
    }

    const previousHead = runGit(dir, ["rev-parse", "HEAD"], { timeout: 5000 });
    let safetyCommit: string | undefined;
    let safetyBranch: string | undefined;

    if (mode === "reset") {
      // Guardar lo local antes de reemplazarlo por el remoto.
      if (!gitStatus(dir).clean) {
        ensureGitUser(dir);
        const snapshot = gitCommit(
          dir,
          `Tesista: cambios locales antes de traer ${branch} del remoto`
        );
        if (!snapshot.success) {
          return {
            success: false,
            mode,
            branch,
            remote,
            error: snapshot.error ?? "No se pudieron guardar los cambios locales.",
          };
        }
        safetyCommit = snapshot.hash;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      safetyBranch = `tesista/seguridad-${stamp}`;
      runGit(dir, ["branch", safetyBranch, "HEAD"], { timeout: 10000 });

      runGit(dir, ["reset", "--hard", `origin/${branch}`], {
        timeout,
        env: networkEnv(),
      });
    } else {
      if (!gitStatus(dir).clean) {
        return {
          success: false,
          mode,
          branch,
          remote,
          error:
            "Hay cambios sin commitear. Creá un commit (o usá «Traer y reemplazar») antes de traer del remoto.",
        };
      }

      // Dejar la rama siguiendo al remoto si todavía no lo hace.
      try {
        runGit(
          dir,
          ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
          { timeout: 5000 }
        );
      } catch {
        runGit(
          dir,
          ["branch", `--set-upstream-to=origin/${branch}`, branch],
          { timeout: 10000 }
        );
      }

      runGit(dir, ["pull", "--ff-only", "--no-edit", "origin", branch], {
        timeout,
        env: networkEnv(),
      });
    }

    // En ambos modos la rama queda rastreando a origin/<rama>.
    try {
      runGit(
        dir,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
        { timeout: 5000 }
      );
    } catch {
      runGit(
        dir,
        ["branch", `--set-upstream-to=origin/${branch}`, branch],
        { timeout: 10000 }
      );
    }

    const newHead = runGit(dir, ["rev-parse", "HEAD"], { timeout: 5000 });
    const updated = previousHead !== newHead;

    return {
      success: true,
      mode,
      branch,
      remote,
      previousHead,
      newHead,
      updated,
      safetyCommit,
      safetyBranch,
      message: updated
        ? mode === "reset"
          ? `Rama reemplazada por origin/${branch}.`
          : `Se trajeron cambios de origin/${branch}.`
        : "Ya estabas al día con el remoto.",
    };
  } catch (err: any) {
    const message = gitErrorMessage(err);
    const ffHint =
      /Not possible to fast-forward|diverging branches|need to specify how to reconcile|refusing to merge unrelated histories/i.test(
        message
      )
        ? " La rama local y la remota tienen commits distintos. Usá «Traer y reemplazar» para adoptar la versión del remoto (se guarda una rama de seguridad) o resolvé la divergencia manualmente."
        : "";
    return {
      success: false,
      mode,
      branch,
      remote,
      error: `${message}${authHint(message)}${ffHint}`.trim(),
    };
  }
}

/**
 * Restaura el árbol de archivos de un commit como un commit nuevo.
 *
 * No reescribe la historia: el estado anterior queda como commit padre y los
 * cambios locales pendientes se guardan en un commit de seguridad. Así la
 * operación es reversible desde el propio historial.
 */
export function gitRestoreCommit(
  dir: string,
  commit: string
): GitRestoreResult {
  if (!isGitRepo(dir)) {
    return { success: false, error: "El directorio no es un repositorio Git." };
  }

  const requested = typeof commit === "string" ? commit.trim() : "";
  if (!requested || requested.startsWith("-")) {
    return { success: false, error: "El commit indicado no es válido." };
  }

  const inProgress = gitOperationInProgress(dir);
  if (inProgress) {
    return {
      success: false,
      error: `Hay ${inProgress} en curso. Terminala o cancelala antes de restaurar.`,
    };
  }

  let targetHash: string;
  try {
    targetHash = runGit(dir, ["rev-parse", "--verify", `${requested}^{commit}`], {
      timeout: 5000,
    });
  } catch {
    return {
      success: false,
      error: `No existe el commit "${requested}" en este repositorio.`,
    };
  }

  try {
    const previousHead = runGit(dir, ["rev-parse", "HEAD"], { timeout: 5000 });
    let safetyCommit: string | undefined;

    // Nunca pisar cambios sin guardarlos primero.
    if (!gitStatus(dir).clean) {
      ensureGitUser(dir);
      const snapshot = gitCommit(
        dir,
        `Tesista: cambios locales antes de restaurar ${shortHash(targetHash)}`
      );
      if (!snapshot.success) {
        return {
          success: false,
          error: snapshot.error ?? "No se pudieron guardar los cambios locales.",
        };
      }
      safetyCommit = snapshot.hash;
    }

    const currentTree = runGit(dir, ["rev-parse", "HEAD^{tree}"], {
      timeout: 5000,
    });
    const targetTree = runGit(dir, ["rev-parse", `${targetHash}^{tree}`], {
      timeout: 5000,
    });

    if (currentTree === targetTree) {
      return {
        success: true,
        commit: targetHash,
        previousHead,
        newHead: previousHead,
        safetyCommit,
        changed: false,
        message: "El árbol de archivos ya coincide con esa versión.",
      };
    }

    // Reemplaza índice y working tree por el árbol pedido, sin mover HEAD.
    runGit(dir, ["read-tree", "-u", "--reset", targetHash], { timeout: 60000 });
    untrackSqliteAuxFiles(dir);

    ensureGitUser(dir);
    const message = `Tesista: restaurar versión ${shortHash(targetHash)} · ${localTimestamp()}`;
    runGit(dir, ["commit", "-m", message], { timeout: 60000 });
    const newHead = runGit(dir, ["rev-parse", "HEAD"], { timeout: 5000 });

    return {
      success: true,
      commit: targetHash,
      previousHead,
      newHead,
      safetyCommit,
      changed: true,
      message,
    };
  } catch (err: any) {
    return { success: false, error: gitErrorMessage(err) };
  }
}

/**
 * Agrega todos los cambios al área de staging, salvo los auxiliares de SQLite
 * (WAL/SHM y copias previas a restaurar), que no deben versionarse.
 */
export function gitAddAll(dir: string): void {
  untrackSqliteAuxFiles(dir);
  runGit(dir, [
    "add",
    "-A",
    "--",
    ".",
    ":(exclude)*.db-wal",
    ":(exclude)*.db-shm",
    ":(exclude)*.db.bak-*",
  ]);
}

/**
 * Crea un commit con el mensaje dado.
 *
 * El mensaje siempre termina con la fecha y hora local, para que el historial
 * identifique sin ambigüedad cuál es la versión más reciente. Si no se indica
 * mensaje se usa «Tesista: instantánea».
 */
export function gitCommit(dir: string, message: string): GitCommitResult {
  const base = typeof message === "string" ? message.trim() : "";
  const finalMessage = `${base || "Tesista: instantánea"} · ${localTimestamp()}`;
  try {
    ensureGitRepo(dir);
    gitAddAll(dir);

    runGit(dir, ["commit", "-m", finalMessage]);

    // Obtener el hash del commit recién creado
    const headHash = runGit(dir, ["rev-parse", "HEAD"]).trim();

    return {
      success: true,
      message: finalMessage,
      hash: headHash,
    };
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    return {
      success: false,
      message: finalMessage,
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
 * Devuelve el estado del repositorio: archivos cambiados, rama y remoto.
 */
export function gitStatus(dir: string): GitStatusResult {
  if (!isGitRepo(dir)) {
    return { initialized: false, clean: true, changedFiles: [] };
  }

  // Sin estas reglas, un `*.db-wal` recién creado aparecería como archivo sin
  // versionar y bloquearía un pull aunque no haya cambios reales.
  ensureGitExcludes(dir);

  const changedOutput = runGit(dir, ["status", "--porcelain"], { raw: true });

  const changedFiles = changedOutput
    ? changedOutput.split("\n").map((line) => {
        // Formato: "XY path" o "XY path1 -> path2" (renames).
        // No se recorta el inicio: el primer carácter puede ser un espacio.
        return line.slice(3).trim();
      })
    : [];

  const branch = gitBranch(dir);
  const remote = gitRemote(dir);

  let hasUpstream = false;
  let ahead = 0;
  let behind = 0;
  if (branch) {
    try {
      runGit(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
        timeout: 5000,
      });
      hasUpstream = true;
      const counts = runGit(
        dir,
        ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        { timeout: 5000 }
      );
      const [a, b] = counts.split(/\s+/).map((value) => Number.parseInt(value, 10));
      ahead = Number.isFinite(a) ? a : 0;
      behind = Number.isFinite(b) ? b : 0;
    } catch {
      hasUpstream = false;
    }
  }

  const last = gitLog(dir, 1)[0];

  return {
    initialized: true,
    clean: changedFiles.length === 0,
    changedFiles,
    branch,
    remote,
    hasUpstream,
    ahead,
    behind,
    lastCommit: last
      ? { hash: last.hash, message: last.message, date: last.date }
      : null,
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

  try {
    const output = runGit(
      dir,
      [
        "log",
        `--max-count=${maxCount}`,
        "--pretty=format:%H%x09%an%x09%ad%x09%s",
        "--date=format:%Y-%m-%d %H:%M",
      ]
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
  } catch {
    // Repositorio recién inicializado, sin commits.
    return [];
  }
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
