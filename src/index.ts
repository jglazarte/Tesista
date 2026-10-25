#!/usr/bin/env node
/**
 * Tesista - Hito 1 & 2: Núcleo Bibliográfico + Notas Atómicas y Enlaces Bidireccionales
 *
 * Uso:
 *   node dist/index.ts <comando> [args]
 *
 * Comandos Hito 1:
 *   add-source <titulo> [autor] [anio] [doi]
 *   add-excerpt <sourceId> <texto> <localizador> [contexto]
 *   list-sources
 *   list-excerpts [sourceId]
 *   resolve-doi <doi>
 *   import-bibtex <archivo.bib>
 *   export-bibtex
 *   citekey <autor> <anio>
 *
 * Comandos Hito 2 (NUEVO):
 *   add-note <titulo> <contenido>
 *   list-notes
 *   show-note <id>
 *   backlinks <noteId>
 *   outgoing <noteId>
 *   unlinked <noteId>
 *   search <consulta>
 *   transclude <citekey> <localizador>
 */

import { TesistaDB } from "./db.js";
import { extractLinks } from "./link-parser.js";
import type { FilterGroup, ExportFormat } from "./types.js";

const db = new TesistaDB();

function print(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

function restFrom(index: number): string {
  return process.argv.slice(index).join(" ");
}

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    /* ---------------- Hito 1 ---------------- */
    case "add-source": {
      const [title, author, year, doi] = args;
      if (!title) {
        console.error("Uso: add-source <titulo> [autor] [anio] [doi]");
        process.exit(1);
      }
      const source = db.createSource({
        title,
        authors: author ? [author] : [],
        year: year ? Number(year) : undefined,
        doi,
        readStatus: "unread",
      });
      console.log("Fuente creada:");
      print(source);
      break;
    }

    case "add-excerpt": {
      const [sourceId, text, locator, context] = args;
      if (!sourceId || !text || !locator) {
        console.error(
          "Uso: add-excerpt <sourceId> <texto> <localizador> [contexto]"
        );
        process.exit(1);
      }
      const excerpt = db.createExcerpt({
        sourceId: Number(sourceId),
        text,
        locator,
        context,
      });
      console.log("Cita creada:");
      print(excerpt);
      break;
    }

    case "list-sources": {
      print(db.listSources());
      break;
    }

    case "list-excerpts": {
      const [sourceId] = args;
      if (sourceId) {
        print(db.listExcerptsBySource(Number(sourceId)));
      } else {
        print(db.listExcerpts());
      }
      break;
    }

    case "resolve-doi": {
      const [doi] = args;
      if (!doi) {
        console.error("Uso: resolve-doi <doi>");
        process.exit(1);
      }
      console.log(`\n>>> Probando CrossRef con DOI: ${doi}`);
      const crossref = await fetchCrossRef(doi);
      if (crossref) {
        console.log("CrossRef OK:");
        print(crossref);
      } else {
        console.log("CrossRef no devolvió resultados. Probando OpenAlex...");
        const openalex = await fetchOpenAlex(doi);
        if (openalex) {
          console.log("OpenAlex OK:");
          print(openalex);
        } else {
          console.log(
            "Ambas APIs fallaron o no existen -> entrada manual requerida (fallback)."
          );
        }
      }
      break;
    }

    case "import-bibtex": {
      const [file] = args;
      if (!file) {
        console.error("Uso: import-bibtex <archivo.bib>");
        process.exit(1);
      }
      const fs = await import("fs");
      const path = await import("path");
      const content = fs.readFileSync(path.resolve(file), "utf-8");
      const { parseBibtex, rawEntryToSource } = await import("./bibtex.js");
      const entries = parseBibtex(content);
      let imported = 0;
      for (const entry of entries) {
        const source = rawEntryToSource(entry);
        db.createSource(source);
        imported += 1;
      }
      console.log(`Importadas ${imported} fuentes desde ${file}`);
      break;
    }

    case "export-bibtex": {
      const { sourcesToBibtex } = await import("./bibtex.js");
      const sources = db.listSources();
      console.log(sourcesToBibtex(sources as any));
      break;
    }

    case "citekey": {
      const [author, year] = args;
      if (!author || !year) {
        console.error("Uso: citekey <autor> <anio>");
        process.exit(1);
      }
      const { generateCitekey } = await import("./citekey.js");
      const existing = db.listSources().map((s) => s.citekey);
      const result = generateCitekey(
        { authors: [author], year: Number(year) },
        existing
      );
      console.log(`Base: ${result.base}`);
      console.log(`Sugerida: ${result.suggested}`);
      break;
    }

    /* ---------------- Hito 2 ---------------- */
    case "add-note": {
      const [title, ...contentParts] = args;
      if (!title || contentParts.length === 0) {
        console.error("Uso: add-note <titulo> <contenido>");
        process.exit(1);
      }
      const note = db.createNote({
        title,
        content: contentParts.join(" "),
      });
      console.log("Nota creada:");
      print(note);
      console.log("\nEnlaces extraídos y persistidos:");
      print(db.getOutgoingLinksResolved(note.id!));
      break;
    }

    case "list-notes": {
      print(db.listNotes());
      break;
    }

    case "show-note": {
      const [id] = args;
      if (!id) {
        console.error("Uso: show-note <id>");
        process.exit(1);
      }
      const note = db.getNote(Number(id));
      if (!note) {
        console.error(`No existe la nota ${id}`);
        process.exit(1);
      }
      print(note);
      console.log("\nEnlaces salientes:");
      print(db.getOutgoingLinksResolved(Number(id)));
      console.log("\nBacklinks (quién enlaza a esta nota):");
      print(db.getBacklinks(Number(id)));
      console.log("\nMenciones no enlazadas en esta nota:");
      print(db.findUnlinkedMentions(Number(id)));
      break;
    }

    case "backlinks": {
      const [id] = args;
      if (!id) {
        console.error("Uso: backlinks <noteId>");
        process.exit(1);
      }
      print(db.getBacklinks(Number(id)));
      break;
    }

    case "outgoing": {
      const [id] = args;
      if (!id) {
        console.error("Uso: outgoing <noteId>");
        process.exit(1);
      }
      print(db.getOutgoingLinksResolved(Number(id)));
      break;
    }

    case "unlinked": {
      const [id] = args;
      if (!id) {
        console.error("Uso: unlinked <noteId>");
        process.exit(1);
      }
      print(db.findUnlinkedMentions(Number(id)));
      break;
    }

    case "search": {
      const query = restFrom(3);
      if (!query) {
        console.error("Uso: search <consulta>");
        process.exit(1);
      }
      print(db.searchNotes(query));
      break;
    }

    case "transclude": {
      const [citekey, locator] = args;
      if (!citekey || !locator) {
        console.error("Uso: transclude <citekey> <localizador>");
        process.exit(1);
      }
      const excerpt = db.resolveTransclusion(citekey, locator);
      if (!excerpt) {
        console.log(
          `No se encontró una cita para @${citekey} en "${locator}"`
        );
        break;
      }
      const source = db.getSource(excerpt.sourceId);
      console.log("Transclusión resuelta:");
      print({
        excerpt,
        source: source
          ? { id: source.id, title: source.title, citekey: source.citekey }
          : null,
        render: `!@${citekey}#${locator} → "${excerpt.text}" (p. ${excerpt.locator})`,
      });
      break;
    }

    case "parse-links": {
      const content = restFrom(3);
      if (!content) {
        console.error("Uso: parse-links <contenido>");
        process.exit(1);
      }
      print(extractLinks(content));
      break;
    }

    /* ---------------- Hito 3 ---------------- */
    case "add-tag": {
      const [name, type, color, icon] = args;
      if (!name || !type) {
        console.error("Uso: add-tag <nombre> <tipo> [color] [icono]");
        console.log("Tipos: concept, methodology, stance, custom");
        process.exit(1);
      }
      const tag = db.createTag({
        name,
        type: type as any,
        color,
        icon,
      });
      console.log("Etiqueta creada:");
      print(tag);
      break;
    }

    case "list-tags": {
      const [type] = args;
      print(db.listTags(type as any));
      break;
    }

    case "add-item-tag": {
      const [itemType, itemId, tagId] = args;
      if (!itemType || !itemId || !tagId) {
        console.error(
          "Uso: add-item-tag <source|excerpt|note> <id_item> <id_tag>"
        );
        process.exit(1);
      }
      const link = db.addTagToItem({
        itemType: itemType as any,
        itemId: Number(itemId),
        tagId: Number(tagId),
      });
      console.log("Vínculo ítem-etiqueta creado:");
      print(link);
      break;
    }

    case "list-item-tags": {
      const [itemType, itemId] = args;
      if (!itemType || !itemId) {
        console.error(
          "Uso: list-item-tags <source|excerpt|note> <id_item>"
        );
        process.exit(1);
      }
      print(db.getTagsForItem(itemType as any, Number(itemId)));
      break;
    }

    case "build-matrix": {
      const [tagType, rowLimit] = args;
      const result = db.buildMatrix({
        tagType: (tagType as any) ?? "concept",
        rowLimit: rowLimit ? Number(rowLimit) : undefined,
      });
      console.log("Matriz de síntesis:");
      print(result);
      break;
    }

    case "filter-sources": {
      const json = restFrom(3);
      if (!json) {
        console.error("Uso: filter-sources <json_filtro>");
        process.exit(1);
      }
      let group: FilterGroup;
      try {
        group = JSON.parse(json);
      } catch {
        console.error("El filtro debe ser JSON válido.");
        process.exit(1);
      }
      const ids = db.filterItems("sources", group);
      console.log(`IDs de fuentes que coinciden: ${ids.join(", ") || "(ninguna)"}`);
      const sources = ids.map((id) => db.getSource(id)).filter(Boolean);
      print(sources);
      break;
    }

    case "save-view": {
      const [name, ...configParts] = args;
      if (!name || configParts.length === 0) {
        console.error("Uso: save-view <nombre> <config_json>");
        process.exit(1);
      }
      const view = db.saveView({
        name,
        configJson: configParts.join(" "),
      });
      console.log("Vista guardada:");
      print(view);
      break;
    }

    case "list-views": {
      print(db.listSavedViews());
      break;
    }

    /* ---------------- Hito 4 ---------------- */
    case "add-section": {
      const [title, type, parentId, position] = args;
      if (!title || !type) {
        console.error("Uso: add-section <titulo> <tipo> [parentId] [position]");
        console.log("Tipos: part, chapter, section, subsection");
        process.exit(1);
      }
      const section = db.createSection({
        title,
        type: type as any,
        parentId: parentId ? Number(parentId) : undefined,
        position: position ? Number(position) : undefined,
      });
      console.log("Sección creada:");
      print(section);
      break;
    }

    case "list-sections": {
      print(db.listSections());
      break;
    }

    case "section-tree": {
      print(db.getSectionTree());
      break;
    }

    case "reorder-section": {
      const [id, parentId, position] = args;
      if (!id) {
        console.error("Uso: reorder-section <id> [parentId] [position]");
        process.exit(1);
      }
      const ok = db.reorderSection(Number(id), {
        parentId: parentId ? Number(parentId) : undefined,
        position: position ? Number(position) : undefined,
      });
      console.log(ok ? "Sección reordenada." : "No se encontró la sección.");
      break;
    }

    case "add-evidence": {
      const [sectionId, evidenceType, evidenceId, position] = args;
      if (!sectionId || !evidenceType || !evidenceId) {
        console.error(
          "Uso: add-evidence <sectionId> <note|excerpt> <evidenceId> [position]"
        );
        process.exit(1);
      }
      const ev = db.addEvidenceToSection({
        sectionId: Number(sectionId),
        evidenceType: evidenceType as any,
        evidenceId: Number(evidenceId),
        position: position ? Number(position) : undefined,
      });
      console.log("Evidencia vinculada:");
      print(ev);
      break;
    }

    case "list-evidences": {
      const [sectionId] = args;
      if (!sectionId) {
        console.error("Uso: list-evidences <sectionId>");
        process.exit(1);
      }
      print(db.getSectionEvidences(Number(sectionId)));
      break;
    }

    case "word-count": {
      const [sectionId] = args;
      if (!sectionId) {
        console.error("Uso: word-count <sectionId>");
        process.exit(1);
      }
      print(db.countSectionWords(Number(sectionId)));
      break;
    }

    case "gap-report": {
      print(db.getGapReport());
      break;
    }

    case "delete-section": {
      const [id] = args;
      if (!id) {
        console.error("Uso: delete-section <id>");
        process.exit(1);
      }
      const ok = db.deleteSection(Number(id));
      console.log(ok ? "Sección eliminada." : "No se encontró la sección.");
      break;
    }

    case "delete-evidence": {
      const [id] = args;
      if (!id) {
        console.error("Uso: delete-evidence <id>");
        process.exit(1);
      }
      const ok = db.removeEvidenceFromSection(Number(id));
      console.log(ok ? "Evidencia eliminada." : "No se encontró la evidencia.");
      break;
    }

    case "delete-note": {
      const [id] = args;
      if (!id) {
        console.error("Uso: delete-note <id>");
        process.exit(1);
      }
      const ok = db.deleteNote(Number(id));
      console.log(ok ? "Nota eliminada." : "No se encontró la nota.");
      break;
    }

    /* ---------------- Hito 5 ---------------- */
    case "query": {
      const json = restFrom(3);
      if (!json) {
        console.error("Uso: query <json_consulta>");
        process.exit(1);
      }
      let q: any;
      try {
        q = JSON.parse(json);
      } catch {
        console.error("La consulta debe ser JSON válido.");
        process.exit(1);
      }
      const { executeQuery } = await import("./query-parser.js");
      const result = executeQuery(db, q);
      print(result);
      break;
    }

    case "query-block": {
      const content = restFrom(3);
      if (!content) {
        console.error("Uso: query-block <contenido_bloque_query>");
        process.exit(1);
      }
      const { parseQueryBlock, executeQuery } = await import("./query-parser.js");
      const parsed = parseQueryBlock(content);
      const result = executeQuery(db, parsed);
      console.log("Consulta parseada:");
      print(parsed);
      console.log("Resultado:");
      print(result);
      break;
    }

    case "extract-citekeys": {
      const content = restFrom(3);
      if (!content) {
        console.error("Uso: extract-citekeys <texto_manuscrito>");
        process.exit(1);
      }
      const { extractCitekeysFromText, extractCitationsWithLocators } = await import("./csl.js");
      console.log("Claves:", extractCitekeysFromText(content));
      console.log("Con localizadores:", extractCitationsWithLocators(content));
      break;
    }

    case "resolve-citations": {
      const content = args[0];
      const styleId = args[1];
      if (!content) {
        console.error('Uso: resolve-citations "<texto>" [estilo]');
        console.log("Estilos: apa, chicago-author-date, ieee, mla, nature");
        process.exit(1);
      }
      const { resolveCitationsInText } = await import("./export.js");
      const { resolvedText, citedExcerpts } = resolveCitationsInText(
        db,
        content,
        styleId ?? "apa"
      );
      console.log("Texto resuelto:");
      console.log(resolvedText);
      console.log("Excerpts citados:", citedExcerpts.length);
      break;
    }

    case "prune-bibtex": {
      const content = args[0];
      const styleId = args[1];
      if (!content) {
        console.error('Uso: prune-bibtex "<texto_manuscrito>" [estilo]');
        process.exit(1);
      }
      const { pruneBibliography } = await import("./export.js");
      const pruned = pruneBibliography(db, content, styleId ?? "apa");
      console.log("Claves citadas:", pruned.citekeys.join(", "));
      console.log("Fuentes:", pruned.sources.length);
      console.log("--- BibTeX podado ---");
      console.log(pruned.bibtexContent);
      break;
    }

    case "yaml-frontmatter": {
      const [title, author, date, abstract] = args;
      if (!title || !author) {
        console.error("Uso: yaml-frontmatter <titulo> <autor> [fecha] [resumen]");
        process.exit(1);
      }
      const { generateYamlFrontmatter } = await import("./export.js");
      console.log(
        generateYamlFrontmatter({
          title,
          author,
          date,
          abstract,
        })
      );
      break;
    }

    case "export-chapter": {
      const [sectionId, format, outputDir, cslPath] = args;
      if (!sectionId) {
        console.error("Uso: export-chapter <sectionId> [markdown|latex|pdf|docx] [outputDir] [cslPath]");
        process.exit(1);
      }
      const { exportChapter, saveAndConvert } = await import("./export.js");
      const result = exportChapter(db, Number(sectionId), {
        metadata: {
          title: `Capítulo: ${sectionId}`,
          author: "Autor de la tesis",
          date: new Date().toISOString().split("T")[0],
          cslPath,
        },
        styleId: "apa",
        includeBibliography: true,
      });
      console.log("--- Markdown generado (primeros 2000 chars) ---");
      console.log(result.content.slice(0, 2000));
      console.log("--- Bibliografía podada ---");
      console.log(`Claves: ${result.bibliography.citekeys.join(", ")}`);
      console.log(`Fuentes: ${result.bibliography.sources.length}`);

      const fmt = (format as ExportFormat) ?? "markdown";
      const dir = outputDir || "./export";
      try {
        const out = await saveAndConvert(result, dir, fmt, { cslPath });
        console.log(`Archivo exportado: ${out}`);
      } catch (err: any) {
        console.error("Error al exportar/convertir:", err.message);
      }
      break;
    }

    case "pandoc-info": {
      const { pandocInfo, pandocVersion } = await import("./pandoc.js");
      const info = pandocInfo();
      console.log("Disponible:", info.available);
      console.log("Ruta:", info.path ?? "(no instalado)");
      console.log("Versión:", info.version ?? pandocVersion() ?? "(no instalado)");
      break;
    }

    case "list-styles": {
      const { listCitationStyles } = await import("./csl.js");
      print(listCitationStyles());
      break;
    }

    /* ---------------- Hito 6 ---------------- */
    case "cascade-note-title": {
      const [id, newTitle] = args;
      if (!id || !newTitle) {
        console.error("Uso: cascade-note-title <noteId> <nuevoTitulo>");
        process.exit(1);
      }
      const { renameNoteCascade } = await import("./cascade.js");
      const result = renameNoteCascade(db, Number(id), newTitle);
      console.log(`Notas actualizadas: ${result.updatedNotes}`);
      for (const r of result.replacements) {
        console.log(
          `  - Nota ${r.noteId} (${r.noteTitle}): ${r.replacementsCount} reemplazo(s)`
        );
      }
      break;
    }

    case "cascade-citekey": {
      const [id, newCitekey] = args;
      if (!id || !newCitekey) {
        console.error("Uso: cascade-citekey <sourceId> <nuevaCitekey>");
        process.exit(1);
      }
      const { renameCitekeyCascade } = await import("./cascade.js");
      const result = renameCitekeyCascade(db, Number(id), newCitekey);
      console.log(`Notas actualizadas: ${result.updatedNotes}`);
      for (const r of result.replacements) {
        console.log(
          `  - Nota ${r.noteId} (${r.noteTitle}): ${r.replacementsCount} reemplazo(s)`
        );
      }
      break;
    }

    case "integrity-check": {
      const { getIntegrityReport } = await import("./integrity.js");
      const report = getIntegrityReport(db);
      print(report);
      break;
    }

    case "search-fts": {
      const query = restFrom(3);
      const [entity] = args;
      if (!query) {
        console.error("Uso: search-fts <consulta> [entidad]");
        console.log("Entidades: sources, excerpts, notes, sections, all");
        process.exit(1);
      }
      const { searchFullText } = await import("./fts.js");
      const results = searchFullText(db, query, {
        entity: (entity as any) ?? "all",
        fuzzy: true,
        limit: 20,
      });
      console.log(`Resultados: ${results.length}`);
      for (const r of results) {
        console.log(
          `  [${r.entity}] ${r.title} (id ${r.id}): ${r.snippet}`
        );
      }
      break;
    }

    case "backup": {
      const [outputPath] = args;
      if (!outputPath) {
        console.error("Uso: backup <archivo.tar.gz>");
        process.exit(1);
      }
      const { createBackup, isBackupAvailable } = await import("./backup.js");
      if (!isBackupAvailable()) {
        console.error("El comando 'tar' no está disponible en el sistema.");
        process.exit(1);
      }
      const result = createBackup(db, outputPath);
      console.log(`Respaldo creado: ${result.outputPath}`);
      console.log(`Formato: ${result.format}, Tamaño: ${result.sizeBytes} bytes`);
      console.log(`Archivos incluidos: ${result.includedFiles.length}`);
      break;
    }

    case "git-init": {
      const [dir] = args;
      const { gitInit, isGitAvailable, isGitRepo } = await import("./git.js");
      if (!isGitAvailable()) {
        console.error("Git no está instalado en el sistema.");
        process.exit(1);
      }
      const targetDir = dir ?? process.cwd();
      if (isGitRepo(targetDir)) {
        console.log(`Ya es un repositorio Git: ${targetDir}`);
      } else {
        gitInit(targetDir);
        console.log(`Repositorio Git inicializado en: ${targetDir}`);
      }
      break;
    }

    case "git-commit": {
      const message = restFrom(3);
      const [dir] = args;
      if (!message) {
        console.error('Uso: git-commit "<mensaje>" [dir]');
        process.exit(1);
      }
      const {
        gitCommit,
        isGitAvailable,
        ensureGitUser,
      } = await import("./git.js");
      if (!isGitAvailable()) {
        console.error("Git no está instalado en el sistema.");
        process.exit(1);
      }
      const targetDir = dir ?? process.cwd();
      ensureGitUser(targetDir);
      const result = gitCommit(targetDir, message);
      if (result.success) {
        console.log(`Commit creado: ${result.hash}`);
      } else {
        console.error("Error al crear commit:");
        console.error(result.error);
        process.exit(1);
      }
      break;
    }

    case "git-log": {
      const [maxCount] = args;
      const [dir] = args.slice(1);
      const { gitLog, isGitAvailable } = await import("./git.js");
      if (!isGitAvailable()) {
        console.error("Git no está instalado en el sistema.");
        process.exit(1);
      }
      const targetDir = dir ?? process.cwd();
      const entries = gitLog(targetDir, maxCount ? Number(maxCount) : 20);
      console.log(`Historial (${entries.length} commits):`);
      for (const e of entries) {
        console.log(
          `  ${e.hash.slice(0, 7)} | ${e.date} | ${e.author} | ${e.message}`
        );
      }
      break;
    }

    case "git-status": {
      const [dir] = args;
      const { gitStatus, isGitAvailable } = await import("./git.js");
      if (!isGitAvailable()) {
        console.error("Git no está instalado en el sistema.");
        process.exit(1);
      }
      const targetDir = dir ?? process.cwd();
      const status = gitStatus(targetDir);
      console.log(`Inicializado: ${status.initialized}`);
      console.log(`Limpio: ${status.clean}`);
      console.log(`Archivos cambiados: ${status.changedFiles.length}`);
      for (const f of status.changedFiles) {
        console.log(`  - ${f}`);
      }
      break;
    }

    case "git-diff": {
      const [from, to, file] = args;
      const { gitDiff, isGitAvailable } = await import("./git.js");
      if (!isGitAvailable()) {
        console.error("Git no está instalado en el sistema.");
        process.exit(1);
      }
      const diff = gitDiff(process.cwd(), { from, to, file });
      console.log(diff || "(sin diferencias)");
      break;
    }

    default: {
      console.log(
        "Tesista - Núcleo Bibliográfico + Notas Atómicas + Matriz de Síntesis + Estructura Capitular + Integridad"
      );
      console.log("Hito 1: add-source, add-excerpt, list-sources, list-excerpts,");
      console.log("        resolve-doi, import-bibtex, export-bibtex, citekey");
      console.log("Hito 2: add-note, list-notes, show-note, backlinks, outgoing,");
      console.log("        unlinked, search, transclude, parse-links");
      console.log("Hito 3: add-tag, list-tags, add-item-tag, list-item-tags,");
      console.log("        build-matrix, filter-sources, save-view, list-views");
      console.log("Hito 4: add-section, list-sections, section-tree, reorder-section,");
      console.log("        delete-section, add-evidence, list-evidences, delete-evidence,");
      console.log("        word-count, gap-report, delete-note");
      console.log("Hito 5: query, query-block, extract-citekeys, resolve-citations,");
      console.log("        prune-bibtex, yaml-frontmatter, export-chapter, pandoc-info,");
      console.log("        list-styles");
      console.log("Hito 6: cascade-note-title, cascade-citekey, integrity-check,");
      console.log("        search-fts, backup, git-init, git-commit, git-log,");
      console.log("        git-status, git-diff");
      process.exit(1);
    }
  }

  db.close();
}

async function fetchCrossRef(doi: string) {
  const { resolveSourceFromCrossRef } = await import("./crossref.js");
  return resolveSourceFromCrossRef(doi);
}

async function fetchOpenAlex(doi: string) {
  const { fetchOpenAlexByDoi } = await import("./openalex.js");
  return fetchOpenAlexByDoi(doi);
}

main().catch((err) => {
  console.error("Error:", err);
  db.close();
  process.exit(1);
});
