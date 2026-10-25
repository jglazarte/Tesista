/**
 * Tesista - Hito 5
 * Integración con Pandoc CLI para exportación académica.
 *
 * Verifica si el ejecutable de Pandoc está disponible en el entorno y lo invoca
 * mediante procesos secundarios para convertir Markdown a PDF, LaTeX o DOCX.
 * Si Pandoc no está instalado, lanza un error descriptivo para que el usuario
 * sepa que debe instalarlo (entorno escritorio) o usar una alternativa WebAssembly.
 */

import { execSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";

export type PandocFormat = "pdf" | "latex" | "docx" | "odt" | "html" | "epub";

/**
 * Intenta localizar el ejecutable de pandoc en el PATH del sistema.
 * Retorna 'pandoc' si se encuentra (asumiendo que está accesible por nombre)
 * o null si no está instalado.
 */
function findPandoc(): string | null {
  try {
    execSync("pandoc --version", {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
    });
    return "pandoc";
  } catch {
    return null;
  }
}

/** Verifica si Pandoc está instalado en el sistema. */
export function isPandocAvailable(): boolean {
  return findPandoc() !== null;
}

/**
 * Devuelve la ruta al ejecutable de pandoc o null si no está disponible.
 */
export function pandocPath(): string | null {
  return findPandoc();
}

/**
 * Obtiene la versión de Pandoc instalada.
 */
export function pandocVersion(): string | null {
  try {
    return execSync("pandoc --version", {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 5000,
    })
      .split("\n")[0]
      .trim();
  } catch {
    return null;
  }
}

/**
 * Convierte un archivo de entrada con Pandoc a un formato de salida.
 *
 * @param inputFile - Ruta al archivo fuente (Markdown/LaTeX)
 * @param outputFile - Ruta de destino (incluye extensión)
 * @param from - Formato de origen (por defecto 'markdown')
 * @param to - Formato de destino (pdf, latex, docx, etc.)
 * @param extraArgs - Argumentos adicionales para pandoc (ej. --citeproc, --bibliography)
 * @returns La ruta del archivo de salida generado
 */
export function convertWithPandoc(
  inputFile: string,
  outputFile: string,
  options: {
    from?: string;
    to: PandocFormat;
    extraArgs?: string[];
    cwd?: string;
  }
): string {
  const pandoc = pandocPath();
  if (!pandoc) {
    throw new Error(
      "Pandoc no está instalado en el sistema. " +
        "Instálalo desde https://pandoc.org/installing.html " +
        "o usa una alternativa WebAssembly (wasm-pandoc) en entornos aislados."
    );
  }

  if (!fs.existsSync(inputFile)) {
    throw new Error(`El archivo de entrada no existe: ${inputFile}`);
  }

  const outDir = path.dirname(outputFile);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const args: string[] = [
    inputFile,
    "-f", options.from ?? "markdown",
    "-t", options.to,
    "-o", outputFile,
  ];

  if (options.extraArgs?.length) {
    args.push(...options.extraArgs);
  }

  try {
    execFileSync(pandoc, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120000,
    });
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    throw new Error(
      `Pandoc falló al convertir "${inputFile}" a "${options.to}":\n` +
        `STDOUT: ${stdout}\nSTDERR: ${stderr}`
    );
  }

  return outputFile;
}

/**
 * Genera un archivo PDF/LaTeX/DOCX a partir de un string de Markdown.
 * Escribe el Markdown en un archivo temporal y lo convierte con Pandoc.
 */
export function convertMarkdown(
  markdown: string,
  options: {
    to: PandocFormat;
    outputFile: string;
    extraArgs?: string[];
    cwd?: string;
    cslPath?: string;
  }
): string {
  const tmpDir = path.resolve(options.cwd ?? process.cwd());
  const tmpFile = path.join(tmpDir, `.tesista-export-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, markdown, "utf-8");

  const outputFileResolved = path.resolve(options.outputFile);

  const extraArgs: string[] = [...(options.extraArgs ?? [])];
  if (options.cslPath) {
    const cslResolved = path.resolve(options.cslPath);
    if (fs.existsSync(cslResolved)) {
      extraArgs.push("--csl", cslResolved);
    }
  }

  try {
    return convertWithPandoc(tmpFile, outputFileResolved, {
      from: "markdown",
      to: options.to,
      extraArgs,
      cwd: tmpDir,
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignorar si ya no existe
    }
  }
}

/**
 * Lista las extensiones de salida soportadas por Pandoc según el formato.
 */
export function outputExtension(format: PandocFormat): string {
  const ext: Record<PandocFormat, string> = {
    pdf: ".pdf",
    latex: ".tex",
    docx: ".docx",
    odt: ".odt",
    html: ".html",
    epub: ".epub",
  };
  return ext[format];
}

/**
 * Información del entorno Pandoc (versión, rutas, disponibilidad).
 */
export function pandocInfo(): {
  available: boolean;
  path: string | null;
  version: string | null;
} {
  const available = isPandocAvailable();
  const p = pandocPath();
  return {
    available,
    path: p,
    version: available ? pandocVersion() : null,
  };
}
