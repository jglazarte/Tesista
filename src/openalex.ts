/**
 * Tesista - Hito 1
 * Cliente HTTP para la API pública de OpenAlex.
 *
 * Endpoint: https://api.openalex.org/works/https://doi.org/{doi}
 * Fallback del plan: si el DOI no existe o la API falla, se permite entrada manual
 * sin bloquear al usuario.
 */

import type { OpenAlexWork, Source } from "./types.js";

const OPENALEX_BASE = "https://api.openalex.org/works";

function mapOpenAlexWork(work: OpenAlexWork): Partial<Source> {
  const authors: string[] = (work.authorships || [])
    .map((a) => a.author?.display_name || "")
    .filter(Boolean);

  return {
    title: work.title ?? work.display_name ?? "",
    authors,
    year: work.publication_year ?? undefined,
    doi: work.doi ? work.doi.replace(/^https:\/\/doi\.org\//, "") : undefined,
    isbn: work.isbn?.[0] ?? undefined,
    containerTitle: work.primary_location?.source?.display_name ?? undefined,
    bibtexType: mapOpenAlexType(work.type),
    readStatus: "unread",
  };
}

function mapOpenAlexType(type?: string): Source["bibtexType"] {
  switch (type) {
    case "article": return "article";
    case "book": return "book";
    case "book-chapter": return "inbook";
    case "proceedings": return "inproceedings";
    case "dissertation": return "thesis";
    default: return "misc";
  }
}

/**
 * Consulta OpenAlex por DOI.
 * Devuelve los datos mapeados o null si no se encuentra / falla la red.
 */
export async function fetchOpenAlexByDoi(
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
    const res = await fetch(
      `${OPENALEX_BASE}/https://doi.org/${encodeURIComponent(doi)}`,
      {
        signal: signal || controller?.signal,
        headers: { Accept: "application/json", "User-Agent": "tesista/1.0 (mailto:tesista@example.com)" },
      }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as OpenAlexWork;
    if (!data?.title && !data?.display_name) return null;

    return mapOpenAlexWork(data);
  } catch {
    return null;
  } finally {
    controller?.abort();
  }
}
