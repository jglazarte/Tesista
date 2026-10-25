/**
 * Tesista - Hito 5
 * Exportación académica: YAML frontmatter, poda bibliográfica (BibTeX pruning),
 * generación de capítulo con citas resueltas y conversión vía Pandoc.
 */

import { TesistaDB } from "./db.js";
import type {
  Source,
  Excerpt,
  Section,
  ExportFormat,
  ExportMetadata,
  PrunedBibliography,
  ExportChapterResult,
} from "./types.js";
import {
  formatCite,
  formatBibliographyEntry,
  generateBibliography,
  extractCitekeysFromText,
  extractCitationsWithLocators,
  getCitationStyle,
  resolveCitationGroupsInText,
} from "./csl.js";
import { convertMarkdown, pandocInfo, outputExtension } from "./pandoc.js";

/**
 * Genera un encabezado YAML frontmatter para exportación a Markdown/LaTeX.
 */
export function generateYamlFrontmatter(metadata: ExportMetadata): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${escapeYaml(metadata.title)}"`);
  lines.push(`author: "${escapeYaml(metadata.author)}"`);
  if (metadata.date) lines.push(`date: "${escapeYaml(metadata.date)}"`);
  else lines.push(`date: "${new Date().toISOString().split("T")[0]}"`);
  if (metadata.abstract) {
    lines.push(`abstract: |`);
    lines.push(`  ${escapeYaml(metadata.abstract).replace(/\n/g, "\n  ")}`);
  }
  if (metadata.bibliographyPath) {
    lines.push(`bibliography: "${escapeYaml(metadata.bibliographyPath)}"`);
  }
  if (metadata.cslPath) {
    lines.push(`csl: "${escapeYaml(metadata.cslPath)}"`);
  }
  if (metadata.language) lines.push(`lang: "${escapeYaml(metadata.language)}"`);
  if (metadata.keywords?.length) {
    lines.push(`keywords:`);
    for (const kw of metadata.keywords) {
      lines.push(`  - "${escapeYaml(kw)}"`);
    }
  }
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

/**
 * Escapa un string para incluirlo en YAML de forma segura.
 */
function escapeYaml(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Poda bibliográfica a partir de una lista explícita de citekeys.
 * Devuelve solo las fuentes que existen en la base de datos, ordenadas por
 * orden de aparición en la lista de citekeys.
 */
export function pruneBibliographyByCitekeys(
  db: TesistaDB,
  citekeys: string[],
  styleId: string = "apa"
): PrunedBibliography {
  const sources: Source[] = [];

  for (const ck of citekeys) {
    const source = db.getSourceByCitekey(ck);
    if (source) sources.push(source);
  }

  // Ordenar por orden de aparición en la lista de citekeys (sin duplicados)
  const seen = new Set<string>();
  const orderedSources: Source[] = [];
  for (const ck of citekeys) {
    if (seen.has(ck)) continue;
    seen.add(ck);
    const source = sources.find((s) => s.citekey === ck);
    if (source) orderedSources.push(source);
  }

  const bibtexContent = sourcesToPrunedBibtex(orderedSources);

  // Deduplicar citekeys en el resultado
  const uniqueCitekeys = Array.from(new Set(citekeys));

  return {
    citekeys: uniqueCitekeys,
    sources: orderedSources,
    bibtexContent,
  };
}

/**
 * Extrae los @clave usados en un texto de manuscrito y devuelve las fuentes
 * correspondientes de la base de datos, generando un archivo .bib podado
 * (solo las fuentes citadas).
 */
export function pruneBibliography(
  db: TesistaDB,
  manuscriptText: string,
  styleId: string = "apa"
): PrunedBibliography {
  const citekeys = extractCitekeysFromText(manuscriptText);
  return pruneBibliographyByCitekeys(db, citekeys, styleId);
}

/**
 * Serializa una lista de fuentes a formato BibTeX (solo las citadas).
 */
function sourcesToPrunedBibtex(sources: Source[]): string {
  const entries: string[] = [];
  for (const s of sources) {
    const key = s.citekey || slugTitle(s.title);
    const type = s.bibtexType || "misc";
    const lines: string[] = [`@${type}{${key},`];

    const add = (name: string, value?: string) => {
      if (value) lines.push(`  ${name} = {${escapeBibtex(value)}},`);
    };

    add("title", s.title);
    if (s.authors?.length) add("author", s.authors.join(" and "));
    if (s.year) add("year", String(s.year));
    add("doi", s.doi);
    add("isbn", s.isbn);
    add("publisher", s.publisher);
    add("journal", s.containerTitle);
    add("booktitle", s.containerTitle);

    lines.push("}");
    entries.push(lines.join("\n"));
  }
  return entries.join("\n\n");
}

function slugTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30) || "source";
}

function escapeBibtex(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\n/g, " ");
}

/**
 * Resuelve citas @clave y transclusiones !@clave#locator en un texto de
 * capítulo, reemplazándolas por citas formateadas según el estilo CSL.
 *
 * Soporte para:
 *   - @foucault1975 -> cita entre paréntesis (Foucault, 1975)
 *   - @foucault1975#p45 -> cita con localizador
 *   - (@foucault1975#p45; @debord1967#p12) -> citas agrupadas
 *   - !@foucault1975#p45 -> bloque de cita (blockquote) con el texto del excerpt
 */
export function resolveCitationsInText(
  db: TesistaDB,
  text: string,
  styleId: string = "apa"
): { resolvedText: string; citedExcerpts: Excerpt[] } {
  const style = getCitationStyle(styleId);
  const citedExcerpts: Excerpt[] = [];
  const citedExcerptIds = new Set<number>();

  // 1. Resolver grupos de citas entre paréntesis: (@key1#loc1; @key2#loc2)
  let resolved = resolveCitationGroupsInText(db, text, styleId);

  // 2. Resolver transclusiones: !@clave#locator -> bloque de cita
  // El localizador se captura hasta el punto y coma, paréntesis de cierre o final
  resolved = resolved.replace(
    /!?@([A-Za-z0-9_\-]+)#([^;\)]*)/g,
    (_match, citekey, locator) => {
      const trimmedLocator = locator.trim();
      const source = db.getSourceByCitekey(citekey);
      if (!source || !source.id) return `[Fuente no encontrada: ${citekey}]`;
      const excerpts = db.listExcerptsBySource(source.id);
      const excerpt = excerpts.find((e) => e.locator === trimmedLocator);
      if (!excerpt) return `[Cita no encontrada: ${citekey}#${trimmedLocator}]`;
      if (!citedExcerptIds.has(excerpt.id!)) {
        citedExcerptIds.add(excerpt.id!);
        citedExcerpts.push(excerpt);
      }
      return `\n> ${excerpt.text}\n> — ${source.title}, ${trimmedLocator}\n`;
    }
  );

  // 3. Resolver menciones simples: @clave (que no sea transclusión)
  resolved = resolved.replace(
    /(?<!\!)@([A-Za-z0-9_\-]+)(?!#)/g,
    (_match, citekey) => {
      const source = db.getSourceByCitekey(citekey);
      if (!source) return `[${citekey}]`;
      return style.cite(source);
    }
  );

  return { resolvedText: resolved, citedExcerpts };
}

/**
 * Exporta un capítulo (sección) a Markdown con:
 *   - YAML frontmatter (metadatos)
 *   - Texto propio de la sección
 *   - Evidencias vinculadas (excerpts y notas) como bloques de cita
 *   - Citaciones @clave resueltas según el estilo CSL
 *   - Bibliografía podada al final (.bib embebido o referencia externa)
 *
 * Devuelve el contenido Markdown listo para guardar o convertir con Pandoc.
 */
export function exportChapter(
  db: TesistaDB,
  sectionId: number,
  options: {
    metadata: ExportMetadata;
    styleId?: string;
    includeBibliography?: boolean;
    bibliographyPath?: string;
  }
): ExportChapterResult {
  const styleId = options.styleId ?? "apa";
  const section = db.getSection(sectionId);
  if (!section) {
    throw new Error(`No existe la sección con id ${sectionId}.`);
  }

  // Recoger evidencias de la sección y sus hijas (para contexto completo)
  const allSections = collectSectionAndDescendants(db, sectionId);

  let fullContent = "";

  for (const sec of allSections) {
    if (!sec.id) continue;
    fullContent += `\n## ${sec.title}\n\n`;
    if (sec.ownContent) {
      fullContent += `${sec.ownContent}\n\n`;
    }
    const evidences = db.getSectionEvidences(sec.id!);
    for (const ev of evidences) {
      if (ev.evidenceType === "excerpt") {
        // Excerpt: buscar texto y locator
        const excerpt = getExcerptById(db, ev.evidenceId);
        if (excerpt) {
          const src = db.getSource(excerpt.sourceId);
          fullContent += `> ${excerpt.text}\n`;
          fullContent += `> — ${src?.title ?? "Fuente desconocida"}, ${excerpt.locator}\n\n`;
        }
      } else {
        const note = db.getNote(ev.evidenceId);
        if (note) {
          fullContent += `> ${note.content}\n`;
          fullContent += `> — Nota: ${note.title}\n\n`;
        }
      }
    }
  }

  // Recolectar citekeys del texto original (incluyendo grupos entre paréntesis)
  // Extraer antes de resolver citas, para capturar @clave en grupos y simples
  const textCitekeys = extractCitekeysFromText(fullContent);

  // Recolectar fuentes de los excerpts vinculados a esta sección y descendientes
  const evidenceCitekeys: string[] = [];
  for (const sec of allSections) {
    const evidences = db.getSectionEvidences(sec.id!);
    for (const ev of evidences) {
      if (ev.evidenceType === "excerpt") {
        const excerpt = getExcerptById(db, ev.evidenceId);
        if (excerpt) {
          const src = db.getSource(excerpt.sourceId);
          if (src?.citekey) evidenceCitekeys.push(src.citekey);
        }
      }
    }
  }

  // Combinar: primero los del texto, luego los de evidencias (sin duplicados, preservando orden)
  const seenCitekeys = new Set<string>();
  const allCitekeys: string[] = [];
  for (const ck of [...textCitekeys, ...evidenceCitekeys]) {
    if (!seenCitekeys.has(ck)) {
      seenCitekeys.add(ck);
      allCitekeys.push(ck);
    }
  }

  // Resolver citas @clave y !@clave#locator en todo el contenido
  const { resolvedText, citedExcerpts } = resolveCitationsInText(
    db,
    fullContent,
    styleId
  );

  // Poda bibliográfica: fuentes citadas en el texto o vinculadas como evidencias
  const pruned = pruneBibliographyByCitekeys(db, allCitekeys, styleId);

  // Generar frontmatter YAML
  const metadata: ExportMetadata = {
    ...options.metadata,
    bibliographyPath: options.bibliographyPath,
  };
  const frontmatter = generateYamlFrontmatter(metadata);

  // Generar entrada bibliográfica formateada
  let bibliographySection = "";
  if (options.includeBibliography !== false && pruned.sources.length > 0) {
    bibliographySection = "\n## Referencias bibliográficas\n\n";
    bibliographySection += generateBibliography(styleId, pruned.sources);
  }

  const content = `${frontmatter}${resolvedText}${bibliographySection}\n`;

  return {
    sectionId,
    sectionTitle: section.title,
    content,
    bibliography: pruned,
    exportFormat: "markdown",
  };
}

/**
 * Recopila una sección y todas sus descendientes (para exportar capítulo completo).
 */
function collectSectionAndDescendants(
  db: TesistaDB,
  sectionId: number
): Section[] {
  const result: Section[] = [];
  const visit = (id: number) => {
    const sec = db.getSection(id);
    if (!sec) return;
    result.push(sec);
    const children = db.listSections().filter((s) => s.parentId === id);
    for (const child of children) visit(child.id!);
  };
  visit(sectionId);
  return result;
}

/**
 * Obtiene un excerpt por id (helper).
 */
function getExcerptById(db: TesistaDB, id: number): Excerpt | null {
  return db.getExcerpt(id);
}

/**
 * Guarda el contenido exportado a un archivo y, opcionalmente, lo convierte
 * con Pandoc al formato de salida deseado.
 */
export async function saveAndConvert(
  result: ExportChapterResult,
  outputDir: string,
  format: ExportFormat = "markdown",
  options?: {
    pandocExtraArgs?: string[];
    cslPath?: string;
  }
): Promise<string> {
  const fs = await import("fs");
  const path = await import("path");

  // Resolver a ruta absoluta para evitar problemas de ruta relativa con Pandoc
  outputDir = path.resolve(outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const mdFile = path.join(outputDir, `${slugFileName(result.sectionTitle)}.md`);
  fs.writeFileSync(mdFile, result.content, "utf-8");

  if (format === "markdown") {
    result.exportFormat = "markdown";
    result.outputPath = mdFile;
    return mdFile;
  }

  const info = pandocInfo();
  if (!info.available) {
    throw new Error(
      `Pandoc no está disponible. No se puede convertir a ${format}. ` +
        `El archivo Markdown se guardó en: ${mdFile}`
    );
  }

  const outExt = outputExtension(format as import("./pandoc.js").PandocFormat);
  const outFile = path.join(
    outputDir,
    `${slugFileName(result.sectionTitle)}${outExt}`
  );

  const extraArgs: string[] = [];
  if (result.bibliography.bibtexContent) {
    const bibFile = path.join(
      outputDir,
      `${slugFileName(result.sectionTitle)}.bib`
    );
    fs.writeFileSync(bibFile, result.bibliography.bibtexContent, "utf-8");
    extraArgs.push("--bibliography", bibFile);
    extraArgs.push("--citeproc");
  }

  // Agregar archivo CSL si se proporciona
  if (options?.cslPath) {
    const cslResolved = path.resolve(options.cslPath);
    if (fs.existsSync(cslResolved)) {
      extraArgs.push("--csl", cslResolved);
    }
  }

  // Agregar argumentos adicionales del usuario
  if (options?.pandocExtraArgs?.length) {
    extraArgs.push(...options.pandocExtraArgs);
  }

  convertMarkdown(result.content, {
    to: format as import("./pandoc.js").PandocFormat,
    outputFile: outFile,
    extraArgs,
    cwd: outputDir,
  });

  result.exportFormat = format;
  result.outputPath = outFile;
  return outFile;
}

function slugFileName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "capitulo";
}
