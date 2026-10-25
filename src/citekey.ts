/**
 * Tesista - Hito 1
 * Algoritmo seguro de generación de claves BibTeX (citekey).
 *
 * Requisito del plan:
 *   - Clave base: {apellidoPrimerAutor}{año}
 *   - Si ya existe, añadir sufijo alfabético automático:
 *     smith2020, smith2020a, smith2020b, ...
 */

import type { Source } from "./types.js";

const SUFFIXES = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
];

/**
 * Normaliza un apellido para formar parte de una citekey:
 * minúsculas, solo alfanumérico, sin tildes ni caracteres especiales.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes/diacríticos
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20); // limitar longitud para claves legibles
}

/**
 * Extrae el apellido del primer autor de una lista de autores.
 * Acepta formatos "Apellido, Nombre" o "Nombre Apellido".
 */
export function firstAuthorLastName(authors: string[]): string {
  if (!authors || authors.length === 0) return "anon";
  const first = authors[0];
  // Si tiene coma, lo primero antes de la coma es el apellido
  if (first.includes(",")) {
    return first.split(",")[0].trim();
  }
  const parts = first.trim().split(/\s+/);
  return parts[parts.length - 1]; // última palabra como apellido
}

/**
 * Construye la parte base de la citekey: apellido + año.
 * Si no hay año, usa "nd" (no date).
 */
export function buildBaseKey(source: Pick<Source, "authors" | "year">): string {
  const last = firstAuthorLastName(source.authors);
  const year = source.year ? String(source.year) : "nd";
  return `${normalizeName(last)}${year}`;
}

/**
 * Genera una citekey única comprobando contra las claves ya existentes.
 * Devuelve { base, suggested } donde suggested es la clave disponible.
 */
export function generateCitekey(
  source: Pick<Source, "authors" | "year">,
  existingKeys: string[]
): CitekeyResult {
  const base = buildBaseKey(source);
  const existing = new Set(existingKeys);

  if (!existing.has(base)) {
    return { base, suggested: base };
  }

  for (const suffix of SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (!existing.has(candidate)) {
      return { base, suggested: candidate };
    }
  }

  // Fallback extremo: sufijo numérico si se agotaron las letras
  let n = 1;
  while (existing.has(`${base}${n}`)) n += 1;
  return { base, suggested: `${base}${n}` };
}

export interface CitekeyResult {
  base: string;
  suggested: string;
}
