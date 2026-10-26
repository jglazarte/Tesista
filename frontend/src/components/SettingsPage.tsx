import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArchiveRestore,
  CloudDownload,
  CloudUpload,
  Database,
  FolderGit2,
  GitBranch,
  HardDriveDownload,
  Link2,
  Moon,
  RotateCcw,
  Save,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  BackupFileInfo,
  BackupResult,
  GitLogEntry,
  GitStatus,
  IntegrityReport,
  Stats,
  WorkspaceInfo,
  backupApi,
  errorMessage,
  gitApi,
  integrityApi,
  maintenanceApi,
  statsApi,
  workspaceApi,
} from "../api";

type Tab = "general" | "database" | "backup" | "git";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: "general", label: "General", icon: ShieldCheck },
  { id: "database", label: "Base de datos", icon: Database },
  { id: "backup", label: "Respaldos", icon: HardDriveDownload },
  { id: "git", label: "Git", icon: GitBranch },
];

export const SettingsPage = () => {
  const [tab, setTab] = useState<Tab>("general");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [dark, setDark] = useState(
    typeof window !== "undefined" &&
      window.localStorage.getItem("tesista:theme") === "dark"
  );
  const [autosave, setAutosave] = useState(
    typeof window !== "undefined" &&
      window.localStorage.getItem("tesista:autosave") === "1"
  );

  const [stats, setStats] = useState<Stats | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [busy, setBusy] = useState(false);

  const [backupPath, setBackupPath] = useState("");
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [commitBackup, setCommitBackup] = useState(true);
  const [pushBackup, setPushBackup] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  // Solo se elige el valor inicial una vez: si el usuario lo cambia, se respeta.
  const backupDefaultsSet = useRef(false);

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([]);
  const [gitMessage, setGitMessage] = useState("");
  const [gitDiff, setGitDiff] = useState<string | null>(null);

  const notify = (text: string) => {
    setMessage(text);
    setError(null);
  };

  const fail = (err: any, fallback: string) => {
    setError(errorMessage(err, fallback));
    setMessage(null);
  };

  const loadStats = useCallback(async () => {
    try {
      setStats(await statsApi.get());
    } catch (err: any) {
      fail(err, "No se pudieron cargar las estadísticas.");
    }
  }, []);

  const loadGit = useCallback(async () => {
    try {
      const [status, log] = await Promise.all([gitApi.status(), gitApi.log(20)]);
      setGitStatus(status);
      setGitLog(log);
    } catch (err: any) {
      fail(err, "No se pudo consultar el estado de Git.");
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      const info = await workspaceApi.get();
      setWorkspace(info);
      setWorkspacePath(info.configured ?? info.path);
      setRemoteUrl(info.remote ?? info.remoteConfigured ?? "");
      if (!backupDefaultsSet.current) {
        // Commitear por defecto solo si el usuario eligió un repositorio externo.
        setCommitBackup(info.source === "settings" && info.isGitRepo);
        backupDefaultsSet.current = true;
      }
    } catch (err: any) {
      fail(err, "No se pudo leer la configuración del repositorio.");
    }
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await backupApi.list());
    } catch (err: any) {
      fail(err, "No se pudieron listar los respaldos.");
    }
  }, []);

  useEffect(() => {
    void loadStats();
    void loadWorkspace();
    void loadGit();
    void loadBackups();
  }, [loadStats, loadWorkspace, loadGit, loadBackups]);

  const applyTheme = (enabled: boolean) => {
    setDark(enabled);
    window.localStorage.setItem("tesista:theme", enabled ? "dark" : "light");
    document.documentElement.classList.toggle("dark", enabled);
  };

  const applyAutosave = (enabled: boolean) => {
    setAutosave(enabled);
    window.localStorage.setItem("tesista:autosave", enabled ? "1" : "0");
  };

  const vacuum = async () => {
    setBusy(true);
    try {
      await maintenanceApi.vacuum();
      await loadStats();
      notify("Base de datos compactada.");
    } catch (err: any) {
      fail(err, "No se pudo compactar la base de datos.");
    } finally {
      setBusy(false);
    }
  };

  const checkIntegrity = async () => {
    setBusy(true);
    try {
      setIntegrity(await integrityApi.get());
      notify("Reporte de integridad generado.");
    } catch (err: any) {
      fail(err, "No se pudo verificar la integridad.");
    } finally {
      setBusy(false);
    }
  };

  const createBackup = async () => {
    setBusy(true);
    setBackupResult(null);
    try {
      const canUseGit = Boolean(workspace?.isGitRepo);
      const result = await backupApi.create(backupPath.trim() || undefined, {
        commit: commitBackup && canUseGit,
        push: pushBackup && commitBackup && canUseGit,
      });
      setBackupResult(result);
      await loadBackups();

      const commitError =
        result.git?.commit && !result.git.commit.success
          ? result.git.commit.error
          : null;
      const pushError =
        result.git?.push && !result.git.push.success ? result.git.push.error : null;
      const notTracked =
        result.git?.commit?.success === true && result.git.commit.backupTracked === false;

      if (commitError || pushError || notTracked) {
        fail(
          new Error(
            commitError ??
              pushError ??
              "El respaldo no quedó versionado. Revisá si la carpeta backups/ está en .gitignore."
          ),
          "El respaldo se creó, pero falló el commit o el push."
        );
      } else if (result.git?.commit?.success) {
        await loadGit();
        notify(
          result.git.push?.success
            ? "Respaldo creado, commiteado y subido al remoto."
            : "Respaldo creado y commiteado en el repositorio."
        );
      } else {
        notify("Respaldo creado.");
      }
    } catch (err: any) {
      fail(err, "No se pudo crear el respaldo.");
    } finally {
      setBusy(false);
    }
  };

  const saveWorkspace = async () => {
    setBusy(true);
    try {
      const info = await workspaceApi.update(workspacePath.trim() || null);
      setWorkspace(info);
      setWorkspacePath(info.configured ?? info.path);
      setRemoteUrl(info.remote ?? info.remoteConfigured ?? "");
      await loadGit();
      notify(`Carpeta de trabajo: ${info.path}`);
    } catch (err: any) {
      fail(err, "No se pudo cambiar la carpeta de trabajo.");
    } finally {
      setBusy(false);
    }
  };

  const resetWorkspace = async () => {
    setBusy(true);
    try {
      const info = await workspaceApi.update(null);
      setWorkspace(info);
      setWorkspacePath(info.path);
      setRemoteUrl(info.remote ?? info.remoteConfigured ?? "");
      await loadGit();
      notify("Se volvió a la carpeta de la aplicación.");
    } catch (err: any) {
      fail(err, "No se pudo restablecer la carpeta de trabajo.");
    } finally {
      setBusy(false);
    }
  };

  const saveRemote = async () => {
    setBusy(true);
    try {
      const info = await workspaceApi.setRemote(remoteUrl.trim() || null);
      setWorkspace(info);
      setRemoteUrl(info.remote ?? info.remoteConfigured ?? "");
      await loadGit();
      notify(
        info.applied
          ? "Remoto actualizado en el repositorio."
          : "Remoto guardado. Se aplicará al inicializar el repositorio."
      );
    } catch (err: any) {
      fail(err, "No se pudo guardar el remoto.");
    } finally {
      setBusy(false);
    }
  };

  const initGit = async () => {
    setBusy(true);
    try {
      await gitApi.init();
      await loadWorkspace();
      await loadGit();
      notify("Repositorio Git inicializado.");
    } catch (err: any) {
      fail(err, "No se pudo inicializar Git.");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const result = await gitApi.commit(gitMessage.trim());
      if (!result.success) {
        fail(new Error(result.error || "Git rechazó el commit."), "No se pudo crear el commit.");
      } else {
        setGitMessage("");
        await loadGit();
        notify(
          `Commit ${result.hash?.slice(0, 8) ?? ""} · ${
            result.message ?? "instantánea guardada"
          }`
        );
      }
    } catch (err: any) {
      fail(err, "No se pudo crear el commit.");
    } finally {
      setBusy(false);
    }
  };

  const push = async () => {
    setBusy(true);
    try {
      // El backend guarda automáticamente los cambios pendientes con un commit
      // fechado antes de subir. Así lo publicado siempre es lo último.
      const result = await gitApi.push(
        gitMessage.trim() ? { message: gitMessage.trim() } : undefined
      );
      if (!result.success) {
        fail(new Error(result.error || "Git rechazó el push."), "No se pudo subir al remoto.");
        await loadGit();
      } else {
        if (result.commit?.success) setGitMessage("");
        await loadGit();
        await loadWorkspace();
        await loadBackups();
        const prefix =
          result.commit?.success && result.commit.hash
            ? `Commit ${result.commit.hash.slice(0, 8)} guardado y subido. `
            : "";
        notify(prefix + (result.message || "Cambios subidos al remoto."));
      }
    } catch (err: any) {
      fail(err, "No se pudo subir al remoto.");
      await loadGit();
    } finally {
      setBusy(false);
    }
  };

  const pull = async (mode: "ff-only" | "reset" = "ff-only") => {
    if (
      mode === "reset" &&
      !window.confirm(
        "Se reemplazará tu copia local por la versión del remoto.\n\n" +
          "Antes se guardan los cambios pendientes en un commit y se crea una rama " +
          "de seguridad (tesista/seguridad-*), así que vas a poder recuperarlos.\n\n" +
          "¿Traer y reemplazar de todos modos?"
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await gitApi.pull(mode);
      if (!result.success) {
        fail(new Error(result.error || "Git rechazó el pull."), "No se pudo traer del remoto.");
        await loadGit();
      } else {
        setGitDiff(null);
        await Promise.all([
          loadWorkspace(),
          loadGit(),
          loadStats(),
          loadBackups(),
        ]);
        const extras = [
          result.safetyCommit
            ? `commit de seguridad ${result.safetyCommit.slice(0, 8)}`
            : null,
          result.safetyBranch ? `rama ${result.safetyBranch}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        notify(
          `${result.message || (result.updated ? "Cambios traídos del remoto." : "Ya estabas al día.")}` +
            (extras ? ` (${extras})` : "")
        );
      }
    } catch (err: any) {
      fail(err, "No se pudo traer del remoto.");
      // El fetch puede haber funcionado aunque el pull no: refrescar contadores.
      await loadGit();
    } finally {
      setBusy(false);
    }
  };

  const restoreCommit = async (entry: GitLogEntry) => {
    if (
      !window.confirm(
        `¿Restaurar los archivos del commit ${entry.hash.slice(0, 8)}?\n\n"${entry.message}"\n\n` +
          "Se crea un commit nuevo con el estado actual (y otro de seguridad si hay " +
          "cambios pendientes), así que el historial no se pierde."
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await gitApi.restoreCommit(entry.hash);
      setGitDiff(null);
      await Promise.all([loadWorkspace(), loadGit(), loadStats(), loadBackups()]);
      notify(
        result.changed === false
          ? "El árbol de archivos ya coincide con esa versión."
          : `Versión restaurada en el commit ${result.newHead?.slice(0, 8) ?? ""}.` +
              (result.safetyCommit
                ? ` Estado anterior guardado en ${result.safetyCommit.slice(0, 8)}.`
                : "")
      );
    } catch (err: any) {
      fail(err, "No se pudo restaurar la versión.");
      await loadGit();
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (info: BackupFileInfo) => {
    if (
      !window.confirm(
        `¿Restaurar el respaldo "${info.fileName}"?\n\n` +
          "Se reemplazará la base de datos activa. Antes se guarda una copia de la " +
          "base actual junto al archivo original (tesista.db.bak-*).\n\n" +
          "Después de restaurar, recargá la página si ves datos desactualizados."
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await backupApi.restore(info.path);
      await Promise.all([loadWorkspace(), loadGit(), loadStats(), loadBackups()]);
      notify(
        `Respaldo restaurado. Copia de la base anterior: ${
          result.safetyCopyPath ?? "—"
        }. Recargá la página si ves datos desactualizados.`
      );
    } catch (err: any) {
      fail(err, "No se pudo restaurar el respaldo.");
    } finally {
      setBusy(false);
    }
  };

  const showDiff = async (entry: GitLogEntry) => {
    try {
      const result = await gitApi.diff({ from: `${entry.hash}^`, to: entry.hash });
      setGitDiff(result.diff || "Sin diferencias disponibles para este commit.");
    } catch (err: any) {
      fail(err, "No se pudo obtener el diff.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0 border-r border-border bg-muted/30 p-3">
          <nav className="space-y-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    tab === item.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {(error || message) && (
            <div
              className={`mb-4 rounded-md border px-3 py-2 text-sm ${
                error
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {error ?? message}
            </div>
          )}

          {tab === "general" && (
            <div className="max-w-xl space-y-4">
              <div>
                <h2 className="text-lg font-bold">General</h2>
                <p className="text-sm text-muted-foreground">
                  Preferencias de la interfaz y del editor de notas.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-4">
                <span className="flex items-center gap-3 text-sm">
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">Modo oscuro</span>
                    <span className="block text-xs text-muted-foreground">
                      Cambia la paleta de toda la aplicación.
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={dark}
                  onChange={(e) => applyTheme(e.target.checked)}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-4">
                <span className="flex items-center gap-3 text-sm">
                  <Save className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">Autoguardado de notas</span>
                    <span className="block text-xs text-muted-foreground">
                      Guarda la nota 1,5 s después de dejar de escribir.
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={autosave}
                  onChange={(e) => applyAutosave(e.target.checked)}
                />
              </label>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Los datos se guardan en una base SQLite local. No se envía
                información a servicios externos salvo la consulta de DOIs a
                CrossRef/OpenAlex.
              </div>
            </div>
          )}

          {tab === "database" && (
            <div className="max-w-2xl space-y-4">
              <div>
                <h2 className="text-lg font-bold">Base de datos</h2>
                <p className="text-sm text-muted-foreground">
                  Estado, mantenimiento e integridad de la base SQLite local.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  ["Fuentes", stats?.sources],
                  ["Citas", stats?.excerpts],
                  ["Notas", stats?.notes],
                  ["Secciones", stats?.sections],
                  ["Etiquetas", stats?.tags],
                  ["Enlaces", stats?.links],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {value === undefined ? "—" : (value as number)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadStats()}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                >
                  Actualizar conteos
                </button>
                <button
                  type="button"
                  onClick={() => void vacuum()}
                  disabled={busy}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Compactar (VACUUM)
                </button>
                <button
                  type="button"
                  onClick={() => void checkIntegrity()}
                  disabled={busy}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  Verificar integridad
                </button>
              </div>

              {integrity && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">Reporte de integridad</h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded border border-border p-2">
                      <div className="text-xs text-muted-foreground">Enlaces rotos</div>
                      <div className="text-lg font-semibold">{integrity.brokenLinks.length}</div>
                    </div>
                    <div className="rounded border border-border p-2">
                      <div className="text-xs text-muted-foreground">Secciones huérfanas</div>
                      <div className="text-lg font-semibold">{integrity.orphanSections.length}</div>
                    </div>
                    <div className="rounded border border-border p-2">
                      <div className="text-xs text-muted-foreground">Fuentes sin citas</div>
                      <div className="text-lg font-semibold">
                        {integrity.uncitedFiledSources.length}
                      </div>
                    </div>
                    <div className="rounded border border-border p-2">
                      <div className="text-xs text-muted-foreground">Citekeys duplicadas</div>
                      <div className="text-lg font-semibold">
                        {integrity.duplicateCitekeys.length}
                      </div>
                    </div>
                  </div>

                  {integrity.brokenLinks.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
                        Enlaces rotos
                      </h4>
                      <ul className="max-h-52 space-y-1 overflow-y-auto text-xs">
                        {integrity.brokenLinks.map((link) => (
                          <li key={link.id} className="rounded bg-muted/50 px-2 py-1">
                            <span className="font-mono">{link.rawText}</span> en{" "}
                            <span className="font-medium">{link.sourceNoteTitle}</span>{" "}
                            <span className="text-muted-foreground">({link.linkType})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "backup" && (
            <div className="max-w-2xl space-y-4">
              <div>
                <h2 className="text-lg font-bold">Respaldos</h2>
                <p className="text-sm text-muted-foreground">
                  Genera un .tar.gz con la base SQLite, un export JSON de cada tabla
                  y todas las notas en Markdown.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Repositorio de respaldo</div>
                    <div className="break-all font-mono text-xs text-muted-foreground">
                      {workspace?.path ?? "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {workspace?.isGitRepo
                        ? `Repositorio Git${workspace.branch ? ` · rama ${workspace.branch}` : ""}`
                        : "La carpeta no es un repositorio Git"}
                      {workspace?.remote ? ` · ${workspace.remote}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("git")}
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Cambiar
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Salida por defecto:{" "}
                  <span className="font-mono">
                    {workspace?.backupsDir ?? "backups"}/tesista-&lt;fecha&gt;.tar.gz
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ruta de salida (opcional)
                </label>
                <input
                  value={backupPath}
                  onChange={(e) => setBackupPath(e.target.value)}
                  placeholder={`Por defecto: ${workspace?.backupsDir ?? "backups"}/tesista-<fecha>.tar.gz`}
                  className="font-mono text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Si se deja vacío, se guarda dentro del repositorio de trabajo. Las
                  rutas relativas se resuelven contra esa carpeta.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium">
                      Commitear el respaldo en el repositorio
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Crea un commit con todos los cambios pendientes del repositorio
                      (documentos incluidos).
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={commitBackup}
                    disabled={!workspace?.isGitRepo}
                    onChange={(e) => setCommitBackup(e.target.checked)}
                  />
                </label>
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-medium">
                      Subir al remoto (push)
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Envía el commit a{" "}
                      <span className="font-mono">{workspace?.remote ?? "origin"}</span>.
                      Requiere credenciales configuradas.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={pushBackup}
                    disabled={!commitBackup || !workspace?.isGitRepo}
                    onChange={(e) => setPushBackup(e.target.checked)}
                  />
                </label>
                {!workspace?.isGitRepo && (
                  <p className="text-xs text-amber-700">
                    Para commitear el respaldo, elegí una carpeta que sea un repositorio
                    Git en la pestaña <button type="button" onClick={() => setTab("git")} className="underline">Git</button>.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void createBackup()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <HardDriveDownload className="h-4 w-4" />
                {busy ? "Creando…" : "Crear respaldo ahora"}
              </button>

              {backupResult && (
                <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  <div className="font-medium">Respaldo creado</div>
                  <div className="break-all font-mono text-xs">{backupResult.outputPath}</div>
                  <div className="text-xs">
                    Tamaño: {formatBytes(backupResult.sizeBytes)} · Archivos:{" "}
                    {backupResult.includedFiles.length}
                  </div>
                  {backupResult.git?.commit && (
                    <div className="mt-2 border-t border-green-200 pt-2 text-xs">
                      {backupResult.git.commit.success ? (
                        <>
                          Commit{" "}
                          <span className="font-mono">
                            {backupResult.git.commit.hash?.slice(0, 8)}
                          </span>
                          {backupResult.git.commit.backupTracked === false
                            ? " · El respaldo no quedó versionado (revisá .gitignore)"
                            : ""}
                          {backupResult.git.push
                            ? backupResult.git.push.success
                              ? " · Subido al remoto"
                              : ` · Push falló: ${backupResult.git.push.error}`
                            : ""}
                        </>
                      ) : (
                        <>Sin commit: {backupResult.git.commit.error}</>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <span className="text-sm font-medium">
                    Respaldos disponibles ({backups.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadBackups()}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Actualizar
                  </button>
                </div>
                {backups.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay respaldos en{" "}
                    <span className="font-mono">
                      {workspace?.backupsDir ?? "backups"}
                    </span>
                    . Si subiste uno desde otro dispositivo, primero hacé{" "}
                    <button
                      type="button"
                      onClick={() => setTab("git")}
                      className="underline"
                    >
                      Pull
                    </button>
                    .
                  </div>
                ) : (
                  <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto">
                    {backups.map((item) => (
                      <li
                        key={item.path}
                        className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs">
                            {item.fileName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(item.sizeBytes)} ·{" "}
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void restoreBackup(item)}
                          disabled={busy}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restaurar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Restaurar un respaldo reemplaza la base activa con la que está
                dentro del .tar.gz. Es la forma de recuperar los datos en otro
                dispositivo después de hacer Pull. La copia anterior queda como{" "}
                <span className="font-mono">tesista.db.bak-&lt;fecha&gt;</span>.
              </p>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="mb-2 text-sm font-semibold">¿Qué incluye?</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>Base de datos SQLite completa (con checkpoint del WAL).</li>
                  <li>Exportación JSON de fuentes, citas, notas, secciones, etiquetas y vínculos.</li>
                  <li>Notas en formato Markdown plano.</li>
                  <li>Manifiesto con metadatos del respaldo.</li>
                </ul>
              </div>
            </div>
          )}

          {tab === "git" && (
            <div className="max-w-3xl space-y-4">
              <div>
                <h2 className="text-lg font-bold">Control de versiones</h2>
                <p className="text-sm text-muted-foreground">
                  Elegí la carpeta que se versiona: puede ser este proyecto o tu
                  repositorio de tesis. Los respaldos y las exportaciones se guardan ahí.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Repositorio de trabajo</span>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {workspace?.source === "settings"
                      ? "Configurado"
                      : workspace?.source === "env"
                        ? "Variable TESISTA_WORKSPACE"
                        : "Carpeta de la app"}
                  </span>
                </div>

                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Ruta local
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                    placeholder={workspace?.defaultPath ?? "~/ruta/a/tu/tesis"}
                    className="min-w-0 flex-1 font-mono text-sm"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => void saveWorkspace()}
                    disabled={busy}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Usar esta carpeta
                  </button>
                  {workspace?.source === "settings" && (
                    <button
                      type="button"
                      onClick={() => void resetWorkspace()}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Restablecer
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="break-all">
                    Carpeta efectiva:{" "}
                    <span className="font-mono text-foreground">{workspace?.path ?? "—"}</span>
                  </div>
                  <div>
                    {workspace?.exists
                      ? workspace.isGitRepo
                        ? `Repositorio Git${workspace.branch ? ` · rama ${workspace.branch}` : " · sin commits"}`
                        : "La carpeta existe pero todavía no es un repositorio Git"
                      : "La carpeta no está disponible"}
                    {" · "}
                    Git {workspace?.gitAvailable ? "disponible" : "no disponible"}
                  </div>
                  <div className="break-all">
                    Respaldos:{" "}
                    <span className="font-mono">{workspace?.backupsDir ?? "—"}</span>
                  </div>
                  <div className="break-all">
                    Exportaciones:{" "}
                    <span className="font-mono">{workspace?.exportDir ?? "—"}</span>
                  </div>
                </div>

                {workspace?.warning && (
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {workspace.warning}
                  </div>
                )}

                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Remoto (origin)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={remoteUrl}
                      onChange={(e) => setRemoteUrl(e.target.value)}
                      placeholder="https://github.com/usuario/repositorio.git"
                      className="min-w-0 flex-1 font-mono text-sm"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => void saveRemote()}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Guardar remoto
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se aplica al repositorio de la carpeta elegida. Dejalo vacío para
                    quitar la configuración guardada.
                  </p>
                  {workspace?.remoteMatchesConfig === false && (
                    <p className="mt-1 text-xs text-amber-700">
                      El repositorio usa un remoto distinto del guardado. Pulsá
                      «Guardar remoto» para sincronizarlo.
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!workspace?.isGitRepo && (
                    <button
                      type="button"
                      onClick={() => void initGit()}
                      disabled={busy || workspace?.gitAvailable === false}
                      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Inicializar repositorio
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void loadWorkspace();
                      void loadGit();
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Actualizar estado
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Estado</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      gitStatus?.initialized
                        ? gitStatus.clean
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {gitStatus?.initialized
                      ? gitStatus.clean
                        ? "Limpio"
                        : `${gitStatus.changedFiles.length} cambio(s)`
                      : "No inicializado"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Rama: {gitStatus?.branch ?? "—"}
                  {gitStatus?.remote ? ` · Remoto: ${gitStatus.remote}` : " · Sin remoto"}
                  {gitStatus?.hasUpstream
                    ? ` · ${gitStatus.ahead ?? 0} por subir / ${gitStatus.behind ?? 0} por traer`
                    : ""}
                </div>
                {gitStatus?.lastCommit && (
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    Último commit:{" "}
                    <span className="font-mono">{gitStatus.lastCommit.hash.slice(0, 8)}</span>{" "}
                    · {gitStatus.lastCommit.message}
                  </div>
                )}
                {gitStatus?.initialized && gitStatus.changedFiles.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-xs text-muted-foreground">
                    {gitStatus.changedFiles.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                )}

                {gitStatus?.hasUpstream &&
                  (gitStatus.ahead ?? 0) > 0 &&
                  (gitStatus.behind ?? 0) > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Tu rama y la remota tienen commits distintos. El pull normal
                        no puede aplicarse sin mezclar la base de datos. Podés traer
                        y reemplazar tu copia por la del remoto; antes se guarda una
                        rama de seguridad.
                      </span>
                    </div>
                  )}

                {gitStatus?.hasUpstream &&
                  (gitStatus.behind ?? 0) > 0 &&
                  ((gitStatus.ahead ?? 0) > 0 || !gitStatus.clean) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void pull("reset")}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        title="Reemplaza la copia local por origin/<rama>. Guarda un commit y una rama de seguridad."
                      >
                        <RotateCcw className="h-4 w-4" />
                        Traer y reemplazar ({gitStatus.behind} por traer)
                      </button>
                    </div>
                  )}
              </div>

              {gitStatus?.initialized && (
                <div className="rounded-lg border border-border p-4">
                  <label className="mb-1 block text-sm font-medium">
                    Mensaje del commit (opcional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={gitMessage}
                      onChange={(e) => setGitMessage(e.target.value)}
                      placeholder="Opcional: avance del capítulo 2"
                      className="min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => void commit()}
                      disabled={busy}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busy ? "Guardando…" : "Commit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void pull()}
                      disabled={busy || !gitStatus.remote}
                      title={
                        gitStatus.remote
                          ? "Traer los cambios de origin sin mezclar historias"
                          : "Configurá un remoto para poder traer cambios"
                      }
                      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <CloudDownload className="h-4 w-4" />
                      Pull
                    </button>
                    <button
                      type="button"
                      onClick={() => void push()}
                      disabled={busy || !gitStatus.remote}
                      title={
                        gitStatus.remote
                          ? "Guardar los cambios pendientes y subir la rama activa al remoto"
                          : "Configurá un remoto para poder subir"
                      }
                      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <CloudUpload className="h-4 w-4" />
                      Push
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    El commit incluye todos los cambios pendientes del repositorio.
                    La fecha y hora se agregan automáticamente al mensaje.{" "}
                    <strong>Push</strong> guarda primero lo pendiente y después sube.
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-4 py-2 text-sm font-medium">
                  Historial ({gitLog.length})
                </div>
                {gitLog.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay commits todavía.
                  </div>
                ) : (
                  <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto">
                    {gitLog.map((entry, index) => (
                      <li
                        key={entry.hash}
                        className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{entry.message}</span>
                            {index === 0 && (
                              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700">
                                Más reciente
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-mono">{entry.hash.slice(0, 8)}</span> ·{" "}
                            {entry.author} · {entry.date}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void showDiff(entry)}
                            className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          >
                            Ver diff
                          </button>
                          <button
                            type="button"
                            onClick={() => void restoreCommit(entry)}
                            disabled={busy}
                            className="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            title="Restaurar los archivos de este commit como un commit nuevo"
                          >
                            Restaurar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Restaurar arma un commit nuevo con los archivos de la versión
                elegida: no borra el historial y guarda aparte los cambios
                pendientes. Si la base SQLite vive dentro del repositorio, también
                se restaura y la app la recarga. Para los datos de la app desde un
                respaldo, usá la pestaña{" "}
                <button
                  type="button"
                  onClick={() => setTab("backup")}
                  className="underline"
                >
                  Respaldos
                </button>
                .
              </p>

              {gitDiff !== null && (
                <div className="rounded-lg border border-border">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <span className="text-sm font-medium">Diff</span>
                    <button
                      type="button"
                      onClick={() => setGitDiff(null)}
                      className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cerrar
                    </button>
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs">
                    {gitDiff}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
