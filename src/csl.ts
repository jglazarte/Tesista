/**
 * Tesista - Hito 5
 * Procesamiento de estilos CSL (Citeproc Engine simplificado).
 *
 * Implementa un motor de citas y bibliografía con estilos académicos
 * embebidos (apa, chicago-author-date, ieee, mla, nature) y la capacidad
 * de cargar archivos .csl externos (lectura básica de macros).
 *
 * Nota: para producción se recomienda citeproc-js / citeproc-rs. Este motor
 * cubre los estilos más usados en tesis doctorales de forma simplificada.
 */

import type { Source, CitationStyleDefinition } from "./types.js";
import type { TesistaDB } from "./db.js";
import path from "path";

/* =========================================================================
   1. Estilos embebidos
   ========================================================================= */

function formatAuthorsApa(source: Source): string {
  const authors = source.authors;
  if (authors.length === 0) return "Autor desconocido";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function formatAuthorsIeee(source: Source): string {
  const authors = source.authors;
  if (authors.length === 0) return "Autor desconocido";
  if (authors.length === 1) return authors[0];
  if (authors.length <= 6) return authors.join(", ");
  return `${authors[0]}, et al.`;
}

function formatAuthorsChicago(source: Source): string {
  const authors = source.authors;
  if (authors.length === 0) return "Autor desconocido";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} y ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function formatAuthorsMla(source: Source): string {
  const authors = source.authors;
  if (authors.length === 0) return "Autor desconocido";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} y ${authors[1]}`;
  return `${authors[0]}, et al.`;
}

function formatAuthorsNature(source: Source): string {
  const authors = source.authors;
  if (authors.length === 0) return "Autor desconocido";
  // Nature usa iniciales del nombre y apellidos, separados por comas
  return authors.map((a) => {
    const parts = a.trim().split(/\s+/);
    if (parts.length <= 1) return a;
    const last = parts.pop();
    const initials = parts.map((p) => p.charAt(0).toUpperCase() + ".").join(" ");
    return `${initials} ${last}`;
  }).join(", ");
}

/** Formatea una lista de autores para cita en texto según el estilo. */
export function formatAuthorsForCite(source: Source, styleId: string): string {
  switch (styleId.toLowerCase()) {
    case "apa":
      return formatAuthorsApa(source);
    case "ieee":
      return formatAuthorsIeee(source);
    case "chicago-author-date":
      return formatAuthorsChicago(source);
    case "mla":
      return formatAuthorsMla(source);
    case "nature":
      return formatAuthorsNature(source);
    default:
      return formatAuthorsApa(source);
  }
}

const STYLES: Record<string, CitationStyleDefinition> = {
  apa: {
    id: "apa",
    name: "APA 7th Edition",
    cite: (source, locator) => {
      const auth = formatAuthorsApa(source);
      const year = source.year ?? "s.f.";
      const loc = locator ? `, ${locator}` : "";
      return `(${auth}${loc}, ${year})`;
    },
    citeNarrative: (source, locator) => {
      const auth = formatAuthorsApa(source);
      const year = source.year ?? "s.f.";
      const loc = locator ? `, ${locator}` : "";
      return `${auth} (${year}${loc})`;
    },
    bibliography: (source) => {
      const auth = formatAuthorsApa(source);
      const year = source.year ?? "s.f.";
      const title = source.title;
      const container = source.containerTitle ? `, ${source.containerTitle}` : "";
      const publisher = source.publisher ? `, ${source.publisher}` : "";
      return `${auth} (${year}). ${title}${container}${publisher}.`;
    },
  },
  "chicago-author-date": {
    id: "chicago-author-date",
    name: "Chicago Author-Date 17th",
    cite: (source, locator) => {
      const auth = formatAuthorsChicago(source);
      const year = source.year ?? "s.f.";
      const loc = locator ? `, ${locator}` : "";
      return `(${auth} ${year}${loc})`;
    },
    citeNarrative: (source, locator) => {
      const auth = formatAuthorsChicago(source);
      const year = source.year ?? "s.f.";
      const loc = locator ? `, ${locator}` : "";
      return `${auth} (${year}${loc})`;
    },
    bibliography: (source) => {
      const auth = formatAuthorsChicago(source);
      const year = source.year ?? "s.f.";
      const title = source.title;
      const container = source.containerTitle ? `, ${source.containerTitle}` : "";
      return `${auth} ${year}. "${title}"${container}.`;
    },
  },
  ieee: {
    id: "ieee",
    name: "IEEE",
    cite: (source, _locator) => {
      // IEEE usa número entre corchetes; aquí usamos [AutorAño] como placeholder
      const auth = formatAuthorsIeee(source);
      const year = source.year ?? "s.f.";
      return `[${auth}${year}]`;
    },
    citeNarrative: (source, _locator) => {
      const auth = formatAuthorsIeee(source);
      const year = source.year ?? "s.f.";
      return `${auth} [${year}]`;
    },
    bibliography: (source) => {
      const auth = formatAuthorsIeee(source);
      const title = source.title;
      const container = source.containerTitle ? `, ${source.containerTitle}` : "";
      const year = source.year ?? "s.f.";
      return `${auth}, "${title}"${container}, ${year}.`;
    },
  },
  mla: {
    id: "mla",
    name: "MLA 9th",
    cite: (source, locator) => {
      const auth = formatAuthorsMla(source);
      const loc = locator ? ` ${locator}` : "";
      return `(${auth}${loc})`;
    },
    citeNarrative: (source, locator) => {
      const auth = formatAuthorsMla(source);
      const loc = locator ? ` ${locator}` : "";
      return `${auth} ${loc}`;
    },
    bibliography: (source) => {
      const auth = formatAuthorsMla(source);
      const title = source.title;
      const container = source.containerTitle ? `, ${source.containerTitle}` : "";
      const year = source.year ?? "s.f.";
      return `${auth}. "${TitleCase(title)}"${container}, ${year}.`;
    },
  },
  nature: {
    id: "nature",
    name: "Nature",
    cite: (source, _locator) => {
      // Nature usa números superscript; placeholder [n]
      return "[1]";
    },
    citeNarrative: (source, _locator) => {
      const auth = formatAuthorsNature(source);
      return `${auth}`;
    },
    bibliography: (source) => {
      const auth = formatAuthorsNature(source);
      const title = source.title;
      const container = source.containerTitle ? `, ${source.containerTitle}` : "";
      const year = source.year ?? "s.f.";
      return `${auth}. ${title}${container} (${year}).`;
    },
  },
};

function TitleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Obtiene un estilo por id. Si no existe, devuelve APA por defecto.
 */
export function getCitationStyle(styleId: string): CitationStyleDefinition {
  const style = STYLES[styleId.toLowerCase()];
  if (!style) {
    console.warn(`Estilo CSL "${styleId}" no encontrado. Usando APA por defecto.`);
    return STYLES.apa;
  }
  return style;
}

/**
 * Lista los estilos disponibles.
 */
export function listCitationStyles(): { id: string; name: string }[] {
  return Object.values(STYLES).map((s) => ({ id: s.id, name: s.name }));
}

/**
 * Formatea una cita en texto para una fuente y localizador opcional.
 */
export function formatCite(
  styleId: string,
  source: Source,
  locator?: string
): string {
  return getCitationStyle(styleId).cite(source, locator);
}

/**
 * Formatea una entrada bibliográfica para una fuente.
 */
export function formatBibliographyEntry(
  styleId: string,
  source: Source
): string {
  return getCitationStyle(styleId).bibliography(source);
}

/**
 * Genera una bibliografía completa para una lista de fuentes.
 */
export function generateBibliography(
  styleId: string,
  sources: Source[]
): string {
  const style = getCitationStyle(styleId);
  return sources.map((s) => style.bibliography(s)).join("\n");
}

/* =========================================================================
   2. Carga básica de archivos .csl (XML simplificado)
   ========================================================================= */

/**
 * Intenta leer un archivo .csl y extraer información básica (id, título).
 * El parseo completo de CSL es complejo; esta función solo lee metadatos.
 * Para formateo real se recomienda citeproc-js.
 */
export function loadCslFile(cslPath: string): {
  id: string;
  title: string;
  style: CitationStyleDefinition;
} | null {
  if (!fsExists(cslPath)) return null;

  try {
    const content = fsReadFile(cslPath);
    const idMatch = content.match(/id="([^"]+)"/);
    const titleMatch = content.match(/<title>([^<]*)<\/title>/);
    const styleId = idMatch ? idMatch[1] : path.basename(cslPath, ".csl");
    const styleName = titleMatch ? titleMatch[1] : styleId;

    return {
      id: styleId,
      title: styleName,
      style: STYLES[styleId.toLowerCase()] ?? STYLES.apa,
    };
  } catch {
    return null;
  }
}

function fsExists(filePath: string): boolean {
  try {
    require("fs").statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function fsReadFile(filePath: string): string {
  return require("fs").readFileSync(filePath, "utf-8");
}

/* =========================================================================
   3. Extracción de citas desde texto de manuscrito
   ========================================================================= */

/**
 * Extrae todas las claves BibTeX (@clave) mencionadas en un texto de manuscrito.
 * Soporta @clave, @clave#p45, !@clave#p45, @clave1; @clave2.
 * El localizador se captura hasta el primer espacio, punto y coma o paréntesis.
 */
export function extractCitekeysFromText(text: string): string[] {
  const citekeys = new Set<string>();
  // @clave o !@clave (opcional #locator, locator hasta espacio/;/))
  const re = /!?@([A-Za-z0-9_\-]+)(?:#([^\s;\)]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    citekeys.add(match[1]);
  }
  return Array.from(citekeys);
}

/**
 * Extrae citas con su localizador desde un texto.
 * El localizador se captura hasta el primer espacio, punto y coma o paréntesis.
 */
export function extractCitationsWithLocators(text: string): Array<{
  citekey: string;
  locator?: string;
}> {
  const result: Array<{ citekey: string; locator?: string }> = [];
  const re = /!?@([A-Za-z0-9_\-]+)(?:#([^\s;\)]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    result.push({
      citekey: match[1],
      locator: match[2] ?? undefined,
    });
  }
  return result;
}

/**
 * Parsea una cadena de citas agrupadas separadas por punto y coma.
 * Ejemplo: "@foucault1975#p45; @debord1967#p12; @piketty2019"
 * Devuelve un array de { citekey, locator } en orden de aparición.
 * El localizador se captura hasta el final de la parte (tras dividir por ;).
 */
export function parseCitationGroup(text: string): Array<{
  citekey: string;
  locator?: string;
}> {
  const result: Array<{ citekey: string; locator?: string }> = [];
  const parts = text.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/!?@([A-Za-z0-9_\-]+)#?(.*)/);
    if (m) {
      const locator = m[2] ? m[2].trim() : undefined;
      result.push({
        citekey: m[1],
        locator: locator || undefined,
      });
    }
  }
  return result;
}

/**
 * Formatea múltiples citas agrupadas en un solo paréntesis según el estilo.
 * Ejemplo APA: (Foucault, p. 45, 1975; Debord, p. 12, 1967)
 * Ejemplo IEEE: [Foucault1975; Debord1967]
 */
export function formatCiteMultiple(
  db: TesistaDB,
  styleId: string,
  group: Array<{ citekey: string; locator?: string }>
): string {
  const style = getCitationStyle(styleId);
  const parts: string[] = [];

  for (const cit of group) {
    const source = db.getSourceByCitekey(cit.citekey);
    if (!source) {
      parts.push(`[${cit.citekey}]`);
      continue;
    }
    if (style.citeNarrative && styleId.toLowerCase() === "nature") {
      parts.push(style.cite(source));
    } else {
      parts.push(style.cite(source, cit.locator));
    }
  }

  const separator = styleId.toLowerCase() === "ieee" ? "; " : "; ";
  return `(${parts.join(separator)})`;
}

/**
 * Resuelve grupos de citas agrupadas en un texto.
 * Busca patrones como: (@foucault1975#p45; @debord1967#p12)
 * y los reemplaza por citas formateadas según el estilo.
 */
export function resolveCitationGroupsInText(
  db: TesistaDB,
  text: string,
  styleId: string = "apa"
): string {
  // Patrón para grupos de citas entre paréntesis: (@key1#loc1; @key2#loc2)
  // Captura cualquier contenido entre paréntesis que comience con @
  const groupRe = /\(@[^)]*?\)/g;

  return text.replace(groupRe, (match) => {
    // Quitar los paréntesis externos para parsear el grupo
    const groupText = match.slice(1, -1);
    const citations = parseCitationGroup(groupText);
    if (citations.length === 0) return match;
    return formatCiteMultiple(db, styleId, citations);
  });
}

