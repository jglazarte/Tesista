import { useCallback, useEffect, useState } from "react";
import {
  Database,
  GitBranch,
  HardDriveDownload,
  Moon,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  BackupResult,
  GitLogEntry,
  GitStatus,
  IntegrityReport,
  Stats,
  backupApi,
  errorMessage,
  gitApi,
  integrityApi,
  maintenanceApi,
  statsApi,
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

  useEffect(() => {
    void loadStats();
    void loadGit();
  }, [loadStats, loadGit]);

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
      const result = await backupApi.create(backupPath.trim() || undefined);
      setBackupResult(result);
      notify("Respaldo creado.");
    } catch (err: any) {
      fail(err, "No se pudo crear el respaldo.");
    } finally {
      setBusy(false);
    }
  };

  const initGit = async () => {
    setBusy(true);
    try {
      await gitApi.init();
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
      const result = await gitApi.commit(
        gitMessage.trim() || `Tesista: instantánea ${new Date().toLocaleString()}`
      );
      if (!result.success) {
        fail(new Error(result.error || "Git rechazó el commit."), "No se pudo crear el commit.");
      } else {
        setGitMessage("");
        await loadGit();
        notify(`Commit creado: ${result.hash?.slice(0, 8) ?? ""}`);
      }
    } catch (err: any) {
      fail(err, "No se pudo crear el commit.");
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
            <div className="max-w-xl space-y-4">
              <div>
                <h2 className="text-lg font-bold">Respaldos</h2>
                <p className="text-sm text-muted-foreground">
                  Genera un .tar.gz con la base SQLite, un export JSON de cada tabla
                  y todas las notas en Markdown.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Ruta de salida (opcional)
                </label>
                <input
                  value={backupPath}
                  onChange={(e) => setBackupPath(e.target.value)}
                  placeholder="Por defecto: backups/tesista-<fecha>.tar.gz"
                  className="font-mono text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Si se deja vacío, el archivo se crea dentro del proyecto.
                </p>
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
                </div>
              )}

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
                  Estado del repositorio del proyecto e historial de instantáneas.
                </p>
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
                  Git disponible: {gitStatus?.available ? "sí" : "no"}
                </div>
                {gitStatus?.initialized && gitStatus.changedFiles.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-xs text-muted-foreground">
                    {gitStatus.changedFiles.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!gitStatus?.initialized && (
                    <button
                      type="button"
                      onClick={() => void initGit()}
                      disabled={busy || gitStatus?.available === false}
                      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Inicializar repositorio
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void loadGit()}
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Actualizar estado
                  </button>
                </div>
              </div>

              {gitStatus?.initialized && (
                <div className="rounded-lg border border-border p-4">
                  <label className="mb-1 block text-sm font-medium">
                    Mensaje del commit
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={gitMessage}
                      onChange={(e) => setGitMessage(e.target.value)}
                      placeholder="Avance del capítulo 2"
                    />
                    <button
                      type="button"
                      onClick={() => void commit()}
                      disabled={busy}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busy ? "Guardando…" : "Commit"}
                    </button>
                  </div>
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
                  <ul className="divide-y divide-border/60">
                    {gitLog.map((entry) => (
                      <li
                        key={entry.hash}
                        className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{entry.message}</div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-mono">{entry.hash.slice(0, 8)}</span> ·{" "}
                            {entry.author} · {entry.date}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void showDiff(entry)}
                          className="shrink-0 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10"
                        >
                          Ver diff
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
