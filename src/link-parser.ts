/**
 * Tesista - Hito 2
 * Parser de referencias internas para notas atómicas.
 *
 * Sintaxis soportada:
 *   [[Título de nota]]                          -> wikilink a nota
 *   [[Título|Texto mostrado]]                   -> wikilink con alias
 *   @foucault1975                               -> mención a fuente (citekey)
 *   !@foucault1975#p45                          -> transclusión de cita (con localizador)
 *
 * Devuelve las referencias encontradas con su tipo, target y raw original,
 * para que la capa de aplicación persista la tabla Links y construya el grafo.
 */

import type { LinkRef, LinkType } from "./types.js";

/**
 * Expresión regular combinada que captura los tres tipos de referencia en un
 * solo pase sobre el contenido.
 *
 * Grupos:
 *   1 -> '!' si es transclusión (undefined si no)
 *   2 -> citekey (para @ / !@)
 *   3 -> locator tras '#' (solo transclusión)
 *   4 -> contenido de [[...]] (wikilink)
 */
const LINK_RE =
  /(!?)\@([A-Za-z0-9_\-]+)(?:#([^\s\]]+))?|\[\[([^\]]+)\]\]/g;

/**
 * Extrae todas las referencias de un contenido Markdown.
 * El orden de aparición se preserva.
 */
export function extractLinks(content: string): LinkRef[] {
  const refs: LinkRef[] = [];
  const seen = new Set<string>(); // evita duplicados idénticos en la misma nota

  for (const match of content.matchAll(LINK_RE)) {
    const [raw, bang, citekey, locator, wiki] = match;
    const index = match.index ?? 0;

    if (wiki !== undefined) {
      // Wikilink: [[Target]] o [[Target|Alias]]
      const [target, alias] = wiki.split("|").map((s) => s.trim());
      const key = `wikilink|${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        type: "wikilink",
        target,
        raw: alias ? `[[${wiki}]]` : `[[${target}]]`,
      });
      continue;
    }

    if (citekey) {
      const key = `${bang ? "transclusion" : "cite_mention"}|${citekey}|${locator ?? ""}|${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        type: (bang ? "transclusion" : "cite_mention") as LinkType,
        target: citekey,
        locator: locator ?? undefined,
        raw,
      });
    }
  }

  return refs;
}

/**
 * Extrae únicamente los targets de wikilink (títulos de notas), útil para
 * construir la lista de notas referenciadas desde una nota.
 */
export function extractWikilinkTargets(content: string): string[] {
  return extractLinks(content)
    .filter((r) => r.type === "wikilink")
    .map((r) => r.target);
}

/**
 * Extrae únicamente las menciones a fuentes (@citekey), sin transclusiones.
 */
export function extractCiteMentions(content: string): Array<{
  citekey: string;
  raw: string;
}> {
  return extractLinks(content)
    .filter((r) => r.type === "cite_mention")
    .map((r) => ({ citekey: r.target, raw: r.raw }));
}

/**
 * Extrae únicamente las transclusiones (!@cite#locator).
 */
export function extractTransclusions(content: string): Array<{
  citekey: string;
  locator: string;
  raw: string;
}> {
  return extractLinks(content)
    .filter((r) => r.type === "transclusion")
    .map((r) => ({
      citekey: r.target,
      locator: r.locator ?? "",
      raw: r.raw,
    }));
}

/**
 * Determina si un texto plano contiene una mención al título de una nota
 * ya sin wikilinks (mención no enlazada). Se busca el título como palabra
 * completa para evitar falsos positivos por substrings.
 */
export function titleMentionRegex(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "g");
}
