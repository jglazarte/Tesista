/**
 * Tesista - Hito 1
 * Cliente HTTP para la API pública de CrossRef.
 *
 * Endpoint: https://api.crossref.org/works/{doi}
 * Fallback del plan: si el DOI no existe o la API falla, se permite entrada manual
 * sin bloquear al usuario (las funciones devuelven null y el llamante decide).
 */

import type { CrossRefItem, Source } from "./types.js";

const CROSSREF_BASE = "https://api.crossref.org/works";

/** Normaliza una respuesta de CrossRef a un objeto Source parcial (sin citekey). */
function mapCrossRefItem(item: CrossRefItem): Partial<Source> {
  const authors: string[] = (item.author || [])
    .map((a) => a.family || a.given || "")
    .filter(Boolean);

  let year: number | undefined;
  const parts = item.published?.["date-parts"]?.[0]?.[0];
  if (parts) year = Number(parts);

  return {
    title: item.title?.[0] ?? "",
    authors,
    year,
    doi: item.DOI ?? undefined,
    isbn: item.ISBN?.[0] ?? undefined,
    publisher: item.publisher ?? undefined,
    containerTitle: item["container-title"]?.[0] ?? undefined,
    bibtexType: mapCrossRefType(item.type),
    readStatus: "unread",
  };
}

function mapCrossRefType(type?: string): Source["bibtexType"] {
  switch (type) {
    case "journal-article": return "article";
    case "book": return "book";
    case "book-chapter": return "inbook";
    case "proceedings-article":
    case "conference-paper": return "inproceedings";
    case "dissertation": return "thesis";
    default: return "misc";
  }
}

/**
 * Consulta CrossRef por DOI.
 * Devuelve los datos mapeados o null si no se encuentra / falla la red.
 * Nunca lanza al llamante (fallback suave).
 */
export async function fetchCrossRefByDoi(
  doi: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<Partial<Source> | null> {
  const { signal, timeoutMs = 15000 } = options;

  let controller: AbortController | undefined;
  if (!signal) {
    controller = new AbortController();
    setTimeout(() => controller?.abort(), timeoutMs);
  }

  try {
    const res = await fetch(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, {
      signal: signal || controller?.signal,
      headers: { Accept: "application/json", "User-Agent": "tesista/1.0 (mailto:tesista@example.com)" },
    });

    if (!res.ok) return null; // 404 si el DOI no existe, etc.

    const data = (await res.json()) as { message?: CrossRefItem };
    if (!data?.message) return null;

    return mapCrossRefItem(data.message);
  } catch {
    return null; // fallo de red -> fallback a entrada manual
  } finally {
    controller?.abort();
  }
}

/**
 * Intenta obtener metadatos de CrossRef y, si tiene éxito, los fusiona en un
 * Source. Devuelve null si no se pudo (el llamante debe permitir entrada manual).
 */
export async function resolveSourceFromCrossRef(
  doi: string
): Promise<Source | null> {
  const partial = await fetchCrossRefByDoi(doi);
  if (!partial) return null;
  return partial as Source;
}
