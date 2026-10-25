/**
 * Tesista - Hito 5
 * Parser de consultas declarativas (Embedded Query Engine).
 *
 * Reconoce bloques de código del tipo:
 *
 *   ```query
 *   entity: excerpts
 *   where:
 *     - field: source.title
 *       operator: like
 *       value: "%Foucault%"
 *     - field: excerpts.locator
 *       operator: like
 *       value: "p.%"
 *   combinator: AND
 *   orderBy: excerpts.date_added
 *   orderDir: DESC
 *   limit: 20
 *   ```
 *
 * Traduce la consulta declarativa a SQL nativo usando el motor de filtros
 * existente (buildFilterSQL) y devuelve el resultado listo para renderizar.
 */

import { TesistaDB } from "./db.js";
import type {
  ParsedQuery,
  QueryEntity,
  QueryCondition,
  QueryResult,
  FilterGroup,
  FilterCondition,
  FilterOperator,
} from "./types.js";

/**
 * Parsea el contenido de un bloque ```query ... ``` y devuelve un ParsedQuery.
 * Soporta sintaxis YAML-like simplificada dentro del bloque.
 */
export function parseQueryBlock(block: string): ParsedQuery {
  const lines = block.split("\n").map((l) => l.trimEnd());
  const query: Partial<ParsedQuery> = {
    entity: "sources",
    conditions: [],
    combinator: "AND",
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Saltar vacíos y comentarios
    if (!line || line.startsWith("#")) {
      i += 1;
      continue;
    }

    // entity: <nombre>
    const mEntity = line.match(/^entity:\s*(\S+)/);
    if (mEntity) {
      query.entity = mEntity[1] as QueryEntity;
      i += 1;
      continue;
    }

    // where: (inicio de bloque de condiciones)
    if (line === "where:") {
      i += 1;
      while (i < lines.length) {
        const condLine = lines[i].trim();
        if (!condLine || condLine.startsWith("#")) {
          i += 1;
          continue;
        }
        // Fin del bloque where cuando aparece una clave de nivel superior
        if (/^[a-zA-Z]+:/g.test(condLine) && !condLine.startsWith("-")) {
          break;
        }
        // Cada condición empieza con '- field: ...'
        if (condLine.startsWith("-")) {
          const condition = parseConditionBlock(lines, i);
          if (condition) {
            query.conditions?.push(condition.condition);
            i = condition._nextIndex;
            continue;
          }
        }
        i += 1;
      }
      continue;
    }

    // combinator: AND | OR
    const mComb = line.match(/^combinator:\s*(\S+)/);
    if (mComb) {
      query.combinator = mComb[1] as "AND" | "OR";
      i += 1;
      continue;
    }

    // orderBy: <campo>
    const mOrder = line.match(/^orderBy:\s*(.+)/);
    if (mOrder) {
      query.orderBy = mOrder[1].trim();
      i += 1;
      continue;
    }

    // orderDir: ASC | DESC
    const mDir = line.match(/^orderDir:\s*(\S+)/);
    if (mDir) {
      query.orderDir = mDir[1] as "ASC" | "DESC";
      i += 1;
      continue;
    }

    // limit: <n>
    const mLimit = line.match(/^limit:\s*(\d+)/);
    if (mLimit) {
      query.limit = Number(mLimit[1]);
      i += 1;
      continue;
    }

    // offset: <n>
    const mOffset = line.match(/^offset:\s*(\d+)/);
    if (mOffset) {
      query.offset = Number(mOffset[1]);
      i += 1;
      continue;
    }

    i += 1;
  }

  if (!query.entity) {
    throw new Error("Consulta declarativa: falta el campo 'entity'.");
  }

  return query as ParsedQuery;
}

/**
 * Parsea una condición en bloque YAML (multi-línea) empezando en el índice i.
 * Devuelve la condición y el índice de la siguiente línea a procesar.
 */
function parseConditionBlock(
  lines: string[],
  i: number
): { condition: QueryCondition; _nextIndex: number } | null {
  // Buscar 'field:' dentro de la línea actual o siguiente
  let field = "";
  let operator = "eq";
  let value: string | string[] | null = null;
  let idx = i;

  // La línea actual puede ser '- field: X' o solo '-'
  const firstLine = lines[idx].trim();
  const mField = firstLine.match(/^-\s*field:\s*(.+)/);
  if (mField) {
    field = mField[1].trim();
    idx += 1;
  } else if (firstLine === "-") {
    idx += 1;
  } else {
    return null;
  }

  // Leer sub-claves de la condición (indentadas)
  while (idx < lines.length) {
    const line = lines[idx];
    if (!line.trim()) { idx += 1; continue; }
    // Si ya no está indentada (es nueva condición o clave de nivel superior), parar
    if (!line.startsWith(" ") && !line.startsWith("\t")) break;
    if (line.trim().startsWith("-")) break;

    const trimmed = line.trim();
    const mOp = trimmed.match(/^operator:\s*(.+)/);
    if (mOp) {
      operator = mOp[1].trim();
      idx += 1;
      continue;
    }
    const mVal = trimmed.match(/^value:\s*(.*)/);
    if (mVal) {
      const raw = mVal[1].trim();
      if (raw.startsWith("[") && raw.endsWith("]")) {
        // Array tipo ["a", "b"]
        try {
          value = JSON.parse(raw);
        } catch {
          value = raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
        }
      } else if (raw.startsWith('"') && raw.endsWith('"')) {
        value = raw.slice(1, -1);
      } else {
        value = raw;
      }
      idx += 1;
      continue;
    }
    idx += 1;
  }

  if (!field) return null;

  return {
    condition: { field, operator: operator as FilterOperator, value },
    _nextIndex: idx,
  };
}

/**
 * Ejecuta una ParsedQuery contra la base de datos y devuelve el resultado.
 */
export function executeQuery(db: TesistaDB, query: ParsedQuery): QueryResult {
  // Construir grupo de filtros para el motor existente
  const group: FilterGroup = {
    conditions: query.conditions.map((c) => ({
      field: c.field,
      operator: c.operator,
      value: c.value,
      combinator: query.combinator,
    })),
    combinator: query.combinator,
  };

  const ids = db.filterItems(query.entity as any, group);

  // Obtener items completos según la entidad
  let items: any[] = [];
  for (const id of ids) {
    switch (query.entity) {
      case "sources": {
        const s = db.getSource(id);
        if (s) items.push(s);
        break;
      }
      case "excerpts": {
        const e = db.getExcerpt(id);
        if (e) items.push(e);
        break;
      }
      case "notes": {
        const n = db.getNote(id);
        if (n) items.push(n);
        break;
      }
      case "sections": {
        const s = db.getSection(id);
        if (s) items.push(s);
        break;
      }
      case "tags": {
        const t = db.getTag(id);
        if (t) items.push(t);
        break;
      }
    }
  }

  // Aplicar ordenamiento
  if (query.orderBy) {
    const dir = query.orderDir === "DESC" ? -1 : 1;
    items.sort((a, b) => {
      const av = a[query.orderBy!];
      const bv = b[query.orderBy!];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  // Aplicar offset y limit
  let start = query.offset ?? 0;
  if (start < 0) start = 0;
  let end = query.limit !== undefined ? start + query.limit : items.length;
  if (end > items.length) end = items.length;
  const pagedItems = items.slice(start, end);

  // Generar SQL representativo (para mostrar al usuario)
  const { where, params } = buildFilterSQLRepresentation(group);
  const sql = `SELECT * FROM ${query.entity} ${where ? "WHERE " + where : ""}`;

  return {
    entity: query.entity,
    count: pagedItems.length,
    items: pagedItems,
    sql,
  };
}

/**
 * Genera una representación de lectura del SQL WHERE (solo para mostrar).
 * No usa parámetros reales, solo ilustra la consulta.
 */
function buildFilterSQLRepresentation(group: FilterGroup): {
  where: string;
  params: any[];
} {
  const clauses: string[] = [];
  const params: any[] = [];

  for (const cond of group.conditions) {
    const joiner = clauses.length > 0 ? ` ${group.combinator} ` : "";
    let clause = "";
    switch (cond.operator) {
      case "eq":
        clause = `${cond.field} = ?`;
        params.push(cond.value);
        break;
      case "neq":
        clause = `${cond.field} <> ?`;
        params.push(cond.value);
        break;
      case "like":
        clause = `${cond.field} LIKE ?`;
        params.push(`%${cond.value}%`);
        break;
      case "ilike":
        clause = `LOWER(${cond.field}) LIKE LOWER(?)`;
        params.push(`%${cond.value}%`);
        break;
      case "in": {
        const vals = Array.isArray(cond.value) ? cond.value : [cond.value];
        const placeholders = vals.map(() => "?").join(",");
        clause = `${cond.field} IN (${placeholders})`;
        params.push(...vals);
        break;
      }
      case "is_null":
        clause = `${cond.field} IS NULL`;
        break;
      case "is_not_null":
        clause = `${cond.field} IS NOT NULL`;
        break;
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const opMap: Record<string, string> = {
          gt: ">", gte: ">=", lt: "<", lte: "<=",
        };
        clause = `${cond.field} ${opMap[cond.operator]} ?`;
        params.push(cond.value);
        break;
      }
      default:
        clause = "1 = 1";
    }
    if (clause) clauses.push(`${joiner}(${clause})`);
  }

  return { where: clauses.join(""), params };
}

/**
 * Extrae bloques ```query ... ``` de un contenido Markdown.
 * Devuelve array de { bloque, inicio, fin } para reemplazo posterior.
 */
export function extractQueryBlocks(content: string): Array<{
  block: string;
  start: number;
  end: number;
}> {
  const blocks: Array<{ block: string; start: number; end: number }> = [];
  const re = /```query\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    blocks.push({
      block: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return blocks;
}
