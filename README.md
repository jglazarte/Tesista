# Tesista - Plataforma de Gestión de Conocimiento para Tesis Doctorales

## Descripción

Tesista es una plataforma de gestión de conocimiento, referencias y cruce de datos para tesis doctorales, combinando lo mejor de Zotero, Obsidian y Notion sin manejo de imágenes ni elementos distractores.

## Arquitectura

```
tesista/
├── tesista.md              # Plan de desarrollo del proyecto
├── package.json            # Dependencias del núcleo (Node.js)
├── tsconfig.json           # Configuración TypeScript
├── src/                    # Capa de datos (Node.js + SQLite)
│   ├── types.ts            # Tipos de dominio
│   ├── citekey.ts          # Algoritmo de claves BibTeX
│   ├── crossref.ts         # Cliente API CrossRef
│   ├── openalex.ts         # Cliente API OpenAlex
│   ├── bibtex.ts           # Parser/serializador BibTeX
│   ├── link-parser.ts      # Parser de wikilinks y menciones
│   ├── db.ts               # Capa de persistencia SQLite
│   ├── editor/             # Esqueleto de extensiones TipTap
│   ├── query-parser.ts     # Parser de consultas declarativas (H5)
│   ├── csl.ts              # Motor de estilos CSL (H5)
│   ├── pandoc.ts           # Wrapper Pandoc CLI (H5)
│   ├── export.ts           # Exportación académica (H5)
│   ├── cascade.ts          # Actualización en cascada (H6)
│   ├── integrity.ts        # Diagnóstico de integridad (H6)
│   ├── fts.ts              # Búsqueda de texto completo (H6)
│   ├── backup.ts           # Estrategia de respaldos (H6)
│   └── git.ts              # Integración con Git (H6)
├── server/                 # API REST (Express + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts        # Endpoints REST
└── frontend/               # Interfaz de usuario (React + Vite + Tailwind)
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── tsconfig.json
    ├── index.html
    ├── .env
    └── src/
        ├── main.tsx
        ├── index.css
        ├── api.ts          # Cliente de API REST
        ├── App.tsx         # Componente principal
        └── components/
            ├── Sidebar.tsx
            ├── SearchBar.tsx
            ├── SourcesPage.tsx
            └── NotesPage.tsx
```

## Hitos Implementados

| Hito | Nombre | Estado | Descripción |
|------|--------|--------|-------------|
| 1 | Núcleo Bibliográfico | ✅ | SQLite (sources + excerpts), citekey único con sufijo, CrossRef/OpenAlex + fallback, BibTeX import/export, validaciones obligatorias |
| 2 | Notas Atómicas | ✅ | Notas Markdown, wikilinks `[[...]]`, menciones `@citekey`, transclusión `!@cite#loc`, tabla Links, backlinks, menciones no enlazadas, FTS5 |
| 3 | Matriz de Síntesis | ✅ | Tags tipados, item_tags polimórfico, motor de filtros booleanos, matriz filas×columnas, vistas guardadas |
| 4 | Estructura Capitular | ✅ | Árbol sections con parent_id+position, section_evidences, gap checker, contador de palabras propio vs citas |
| 5 | Consultas Dinámicas y Exportación | ✅ | Parser de consultas declarativas, motor CSL (APA, Chicago, IEEE, MLA, Nature), poda bibliográfica, YAML frontmatter, export a Markdown/PDF/DOCX vía Pandoc |
| 6 | Rendimiento, Integridad y UX | ✅ | Actualización en cascada de citekeys/títulos, diagnóstico de enlaces rotos, búsqueda FTS extendida, respaldos .tar.gz, integración Git |

## Cómo Ejecutar

### Backend (API REST)

```bash
cd /home/guille/Proyectos/Tesista/server
npm install
npm run dev          # Inicia con tsx en puerto 3001
```

### Frontend

```bash
cd /home/guille/Proyectos/Tesista/frontend
npm install
npm run dev          # Inicia con Vite en puerto 5173
```

El frontend se conecta automáticamente al backend en `http://localhost:3001` mediante proxy de Vite.

## Comandos CLI (alternativa al frontend)

El núcleo también incluye un CLI para pruebas:

```bash
cd /home/guille/Proyectos/Tesista
npm install
npx tsc              # Compila TypeScript
node dist/index.ts add-source "Título" "Autor" 2020
node dist/index.ts add-note "Nota" "Contenido con [[wikilink]] y @citekey"
node dist/index.ts section-tree
node dist/index.ts gap-report
```

## Características Clave

- **Almacenamiento local**: SQLite portable, fácil de respaldar
- **Trazabilidad epistémica**: Cada cita tiene localizador (página/párrafo) obligatorio
- **Claves BibTeX automáticas**: `smith2020`, `smith2020a`, `smith2020b`...
- **Wikilinks**: `[[Título de nota]]` para enlazar notas
- **Menciones**: `@citekey` para citar fuentes
- **Transclusión**: `!@citekey#p45` para incrustar citas
- **Matriz de síntesis**: Cruzar fuentes × conceptos con filtros booleanos
- **Gap Checker**: Detecta secciones huérfanas y fuentes no citadas
- **Exportación académica**: Markdown/LaTeX/PDF/DOCX con citas CSL y bibliografía podada
- **Respaldos**: Paquete .tar.gz con BD, JSON y Markdown planos
- **Git**: Auto-commits e historial de cambios

## Licencia

MIT
