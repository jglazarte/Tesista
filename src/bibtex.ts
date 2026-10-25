/**
 * Tesista - Hito 1
 * Parser y serializador BibTeX.
 *
 * Transforma bibliotecas exportadas de Zotero/Mendeley en objetos internos
 * (Source) y viceversa, para importar/exportar bibliografías.
 */

import type { Source, NewSource } from "./types.js";

interface RawEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/**
 * Parsea una cadena BibTeX (uno o varios @entrada) y devuelve un array de
 * crudos. Maneja llaves anidadas en los valores entre { ... }.
 */
export function parseBibtex(bibtex: string): RawEntry[] {
  const entries: RawEntry[] = [];
  let i = 0;
  const n = bibtex.length;

  while (i < n) {
    // saltar espacios y comentarios no entrada
    while (i < n && bibtex[i] !== "@") i += 1;
    if (i >= n) break;
    i += 1; // saltar '@'

    // leer tipo de entrada hasta '{'
    let type = "";
    while (i < n && bibtex[i] !== "{" && bibtex[i] !== "," && !/\s/.test(bibtex[i])) {
      type += bibtex[i];
      i += 1;
    }
    type = type.trim().toLowerCase();
    if (!type) continue;

    // esperar '{'
    while (i < n && bibtex[i] !== "{") i += 1;
    if (i >= n) break;
    i += 1; // saltar '{'

    // leer clave hasta la primera ',' (o fin de campos)
    let key = "";
    while (i < n && bibtex[i] !== ",") {
      key += bibtex[i];
      i += 1;
    }
    key = key.trim();
    if (!key) continue;

    if (i < n) i += 1; // saltar ','

    // leer campos hasta encontrar el '}' que cierra la entrada (contando llaves)
    const fields: Record<string, string> = {};
    let depth = 0;
    let fieldName = "";
    let fieldValue = "";
    let readingName = true;

    while (i < n) {
      const ch = bibtex[i];
      if (ch === "{") { depth += 1; fieldValue += ch; i += 1; continue; }
      if (ch === "}") {
        depth -= 1;
        if (depth < 0) break; // cierra la entrada
        fieldValue += ch;
        i += 1;
        continue;
      }
      if (depth === 0 && ch === ",") {
        // fin de un campo
        if (fieldName) fields[fieldName.trim()] = fieldValue.trim();
        fieldName = "";
        fieldValue = "";
        readingName = true;
        i += 1;
        continue;
      }
      if (readingName && depth === 0 && ch === "=") {
        readingName = false;
        i += 1;
        continue;
      }
      if (readingName) {
        fieldName += ch;
      } else {
        fieldValue += ch;
      }
      i += 1;
    }
    if (fieldName) fields[fieldName.trim()] = fieldValue.trim();

    entries.push({ type, key, fields });
  }

  return entries;
}

function unwrapBraces(value: string): string {
  let v = value;
  if (v.startsWith("{") && v.endsWith("}")) {
    v = v.slice(1, -1);
  }
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\'/g, "'").replace(/\\`/g, "`").replace(/\\"/g, '"');
}

/**
 * Convierte una entrada BibTeX cruda en un NewSource parcial.
 */
export function rawEntryToSource(entry: RawEntry): NewSource {
  const f = entry.fields;
  const authorsRaw = f.author || f.editor || "";
  const authors = splitBibtexNames(authorsRaw).map((a) => unwrapBraces(a));

  let year: number | undefined;
  if (f.year) year = Number(f.year.replace(/\D/g, "")) || undefined;

  return {
    title: unwrapBraces(f.title || ""),
    authors,
    year,
    doi: unwrapBraces(f.doi || "") || undefined,
    isbn: unwrapBraces(f.isbn || "") || undefined,
    publisher: unwrapBraces(f.publisher || "") || undefined,
    containerTitle:
      unwrapBraces(f.journal || f.booktitle || f["container-title"] || "") ||
    undefined,
    bibtexType: mapBibtexType(entry.type) as Source["bibtexType"],
    readStatus: "unread",
  };
}

/**
 * Convierte un NewSource en una entrada BibTeX cruda (sin citekey asignada aún;
 * se usa el campo title como clave temporal si no hay citekey).
 */
export function sourceToBibtexEntry(source: NewSource & { citekey?: string }): string {
  const key = source.citekey || slugTitle(source.title);
  const type = source.bibtexType || "misc";
  const lines: string[] = [`@${type}{${key},`];

  const add = (name: string, value?: string) => {
    if (value) lines.push(`  ${name} = {${escapeBibtex(value)}},`);
  };

  add("title", source.title);
  if (source.authors?.length) {
    add("author", source.authors.join(" and "));
  }
  if (source.year) add("year", String(source.year));
  add("doi", source.doi);
  add("isbn", source.isbn);
  add("publisher", source.publisher);
  add("journal", source.containerTitle);
  add("booktitle", source.containerTitle);

  lines.push("}");
  return lines.join("\n");
}

/** Serializa un array de fuentes a formato BibTeX. */
export function sourcesToBibtex(sources: Array<Source & { citekey: string }>): string {
  return sources.map((s) => sourceToBibtexEntry(s as any)).join("\n\n");
}

/* -------------------- helpers privados -------------------- */

function splitBibtexNames(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/\s+and\s+/i)
    .map((n) => n.trim().replace(/^{|}$/g, ""))
    .filter(Boolean);
}

function mapBibtexType(type: string): Source["bibtexType"] {
  switch (type.toLowerCase()) {
    case "article": return "article";
    case "book": return "book";
    case "inbook": return "inbook";
    case "inproceedings":
    case "proceedings": return "inproceedings";
    case "phdthesis":
    case "mastersthesis":
    case "thesis": return "thesis";
    default: return "misc";
  }
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
