/**
 * Tesista - Hito 2
 * Esqueleto de extensiones para el motor de edición (TipTap / CodeMirror 6).
 *
 * NOTA: este archivo es código TypeScript pensado para integrarse en el
 * frontend (React/Vue/Svelte + TipTap). No se ejecuta en el CLI de Node.
 * Define los nodos custom y la lógica de autocompletado para:
 *   - [[Wikilinks]] a notas
 *   - @citekey a menciones de fuentes
 *   - !@citekey#locator a transclusión de citas
 *
 * Se integra como extensión custom de TipTap:
 *   import { Wikilink, CiteMention, Transclusion } from './editor/tiptap-extensions';
 *   const editor = new Editor({
 *     extensions: [StarterKit, Wikilink, CiteMention, Transclusion],
 *     ...
 *   });
 */

import {
  Node,
  mergeAttributes,
  Parser,
  Node as ProseMirrorNode,
} from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { suggestion } from "@tiptap/suggestion";

/* =========================================================================
   1. Nodo: Wikilink  [[Título de nota]]
   ========================================================================= */
export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      target: { default: null },
      display: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-type=wikilink]",
        getAttrs: (dom: any) => ({
          target: dom.getAttribute("data-target"),
          display: dom.getAttribute("data-display"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "wikilink" }),
      `[[${HTMLAttributes.display || HTMLAttributes.target}]]`,
    ];
  },

  addCommands() {
    return {
      insertWikilink:
        (target: string, display?: string) =>
        ({ tr, dispatch }) => {
          const node = this.type.create({ target, display });
          if (dispatch) dispatch(tr.replaceSelectionWith(node));
          return true;
        },
    };
  },
});

/* =========================================================================
   2. Nodo: CiteMention  @citekey
   ========================================================================= */
export const CiteMention = Node.create({
  name: "citeMention",
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      citekey: { default: null },
      sourceId: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-type=citeMention]",
        getAttrs: (dom: any) => ({
          citekey: dom.getAttribute("data-citekey"),
          sourceId: dom.getAttribute("data-source-id"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "citeMention" }),
      `@${HTMLAttributes.citekey}`,
    ];
  },
});

/* =========================================================================
   3. Nodo: Transclusion  !@citekey#locator  (bloque de cita incrustado)
   ========================================================================= */
export const Transclusion = Node.create({
  name: "transclusion",
  group: "block",
  content: "text*",
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      citekey: { default: null },
      locator: { default: null },
      sourceId: { default: null },
      excerptId: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type=transclusion]",
        getAttrs: (dom: any) => ({
          citekey: dom.getAttribute("data-citekey"),
          locator: dom.getAttribute("data-locator"),
          sourceId: dom.getAttribute("data-source-id"),
          excerptId: dom.getAttribute("data-excerpt-id"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "transclusion",
        class: "tesista-transclusion",
      }),
      [
        "blockquote",
        { "data-cite": `${HTMLAttributes.citekey}#${HTMLAttributes.locator}` },
        `Cita: ${HTMLAttributes.citekey} — ${HTMLAttributes.locator}`,
      ],
      [
        "div",
        { class: "tesista-transclusion-source" },
        `Fuente: ${HTMLAttributes.citekey} — ${HTMLAttributes.locator}`,
      ],
    ];
  },
});

/* =========================================================================
   4. Autocompletado de sugerencias (popup) para [[ y @
   ========================================================================= */
export const wikiSuggestion = suggestion({
  char: "[[",
  pluginKey: new PluginKey("wikiSuggestion"),
  command: ({ editor, range, props }: any) => {
    if (!props.target) return false;
    editor.chain().focus().insertContent(`[[${props.target}]]`).run();
    return true;
  },
  decorate: (editor: any, view: any) => {}, // se llena con DecorationSet
});

export const citeSuggestion = suggestion({
  char: "@",
  pluginKey: new PluginKey("citeSuggestion"),
  command: ({ editor, range, props }: any) => {
    if (!props.citekey) return false;
    editor.chain().focus().insertContent(`@${props.citekey}`).run();
    return true;
  },
  decorate: (editor: any, view: any) => {},
});

/** Función de utilidad: devuelve lista de candidatos para el popup. */
export function suggestCandidates(
  query: string,
  notes: { id: number; title: string }[],
  sources: { id: number; citekey: string; title: string }[]
) {
  const q = query.toLowerCase();
  const noteHits = notes
    .filter((n) => n.title.toLowerCase().includes(q))
    .map((n) => ({ type: "note" as const, label: n.title, value: n.title }));
  const sourceHits = sources
    .filter((s) => s.citekey.toLowerCase().includes(q))
    .map((s) => ({
      type: "source" as const,
      label: `@${s.citekey}`,
      value: s.citekey,
    }));
  return [...noteHits, ...sourceHits].slice(0, 10);
}
