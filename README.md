# Tesista

**Plataforma de gestión de conocimiento, referencias y cruce de datos para tesis doctorales**  
*(Combinando lo mejor de Zotero, Obsidian y Notion sin manejo de imágenes ni elementos distractores)*

---

## Índice

1. [Descripción](#descripción)
2. [Arquitectura del Proyecto](#arquitectura-del-proyecto)
3. [Características por Hito](#características-por-hito)
4. [Cómo Instalar y Ejecutar](#cómo-instalar-y-ejecutar)
5. [Uso del Sistema](#uso-del-sistema)
6. [Endpoints de la API](#endpoints-de-la-api)
7. [Tecnologías Utilizadas](#tecnologías-utilizadas)
8. [Estructura de Archivos](#estructura-de-archivos)
9. [Roadmap](#roadmap)

---

## Descripción

Tesista es una plataforma especializada para doctorandos que necesitan gestionar literatura científica, extraer citas textuales, desarrollar notas conceptuales atómicas, cruzar variables en matrices de síntesis y estructurar los capítulos de su tesis doctoral con trazabilidad total de evidencias.

El sistema está optimizado para **texto plano, metadatos estructurados, citas bibliográficas y relaciones multidireccionales**, sin elementos distractores como procesamiento de imágenes pesadas.

### Principios de Diseño

- **Trazabilidad Epistémica**: Cada afirmación en la tesis debe poder rastrearse hasta una nota conceptual, una cita textual y una fuente original con página exacta.
- **Almacenamiento Local**: Base de datos SQLite portátil y fácil de respaldar (orientada a proyectos de 3 a 5 años).
- **Enfoque en Texto**: Optimizado para texto plano y metadatos, sin procesamiento de imágenes.
- **Privacidad**: Los datos permanecen en la máquina del usuario.

---

## Arquitectura del Proyecto

```
tesista/
├── tesista.md              # Plan de desarrollo original (milhitos 1-6)
├── README.md               # Este archivo
├── package.json            # Dependencias del núcleo (Node.js)
├── tsconfig.json           # Configuración TypeScript
│
├── src/                    # Capa de datos (Node.js + SQLite + TypeScript)
│   ├── types.ts            # Tipos de dominio compartidos
│   ├── citekey.ts          # Algoritmo de claves BibTeX (smith2020, smith2020a...)
│   ├── crossref.ts         # Cliente API pública de CrossRef
│   ├── openalex.ts         # Cliente API pública de OpenAlex
│   ├── bibtex.ts           # Parser y serializador BibTeX (Zotero/Mendeley)
│   ├── link-parser.ts      # Parser de [[wikilinks]], @citekey, !@cite#locator
│   ├── db.ts               # Capa de persistencia SQLite (todos los hitos 1-4)
│   ├── query-parser.ts     # Parser de consultas declarativas (Hito 5)
│   ├── csl.ts              # Motor de estilos CSL: APA, Chicago, IEEE, MLA, Nature (H5)
│   ├── pandoc.ts           # Wrapper CLI de Pandoc para exportación (H5)
│   ├── export.ts           # Exportación académica: YAML frontmatter, BibTeX pruning (H5)
│   ├── cascade.ts          # Actualización en cascada de citas y títulos (H6)
│   ├── integrity.ts        # Diagnóstico de enlaces rotos y huérfanos (H6)
│   ├── fts.ts              # Búsqueda de texto completo FTS5 + trigramas (H6)
│   ├── backup.ts           # Estrategia de respaldos .tar.gz (H6)
│   ├── git.ts              # Integración con Git: init, commit, log, status, diff (H6)
│   └── editor/             # Esqueleto de extensiones TipTap para el editor de notas
│       └── tiptap-extensions.ts
│
├── server/                 # API REST (Express + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts        # Endpoints REST para todos los recursos
│
├── frontend/               # Interfaz de usuario (React + Vite + Tailwind CSS)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── index.css
│       ├── api.ts          # Cliente de API REST
│       ├── App.tsx         # Componente principal con navegación
│       └── components/
│           ├── Sidebar.tsx       (navegación lateral)
│           ├── SearchBar.tsx     (búsqueda)
│           ├── SourcesPage.tsx   (gestión de fuentes bibliográficas)
│           └── NotesPage.tsx     (editor de notas con wikilinks y citas)
│
└── scripts/
    └── start-tesista.sh    # Script para iniciar backend + frontend
```

---

## Características por Hito

### Hito 1: Núcleo Bibliográfico (Tipo Zotero)

- **Base de datos SQLite local** con tablas `sources` y `excerpts` vinculadas por clave foránea.
- **Generación automática de claves BibTeX**: `{apellido}{año}` con sufijo alfabético al colisionar (`smith2020`, `smith2020a`, `smith2020b`...).
- **Ingesta por API externa**: Cliente HTTP para CrossRef y OpenAlex con fallback en cadena.
- **Entrada manual**: Si el DOI no existe o la API falla, se permite entrada completa sin bloquear.
- **Importación/exportación BibTeX**: Parser y serializador para bibliotecas de Zotero/Mendeley.
- **Validaciones obligatorias**:
  - Una cita (`Excerpt`) no puede crearse sin `source_id` asociado a una fuente existente.
  - El campo **Página/Localizador** es obligatorio para trazabilidad epistémica.

### Hito 2: Motor de Notas Atómicas (Tipo Obsidian)

- **Notas atómicas en Markdown** con título y contenido.
- **Wikilinks**: Sintaxis `[[Título de nota]]` con soporte para alias `[[Título|Alias]]`.
- **Menciones a fuentes**: Sintaxis `@claveBibTeX` para citar fuentes bibliográficas.
- **Transclusión**: Sintaxis `!@clave#localizador` para incrustar citas textuales como bloques de cita.
- **Tabla de enlaces**: Persistencia de wikilinks, menciones y transclusiones en tabla `links`.
- **Backlinks**: Consulta de qué notas enlazan a una nota dada.
- **Menciones no enlazadas**: Detección de títulos de notas que aparecen en texto plano sin wikilink explícito.
- **Búsqueda full-text (FTS5)**: Índice sobre título y contenido de notas con triggers de auto-sincronización.

### Hito 3: Matriz de Síntesis (Tipo Notion)

- **Etiquetas tipadas**: `concept`, `methodology`, `stance`, `custom` con color e ícono asociado.
- **Vínculos polimórficos**: Tabla `item_tags` que vincula etiquetas con sources, excerpts o notes.
- **Motor de filtros booleanos**: Operadores `eq`, `neq`, `like`, `ilike`, `in`, `is_null`, `is_not_null`, `gt`, `gte`, `lt`, `lte`, `has_tag`, `has_not_tag` con combinadores `AND`, `OR` y `NOT`.
- **Matriz de síntesis**: Filas = fuentes, Columnas = etiquetas, Celdas = excerpts/notes vinculadas con vista de preview y conteo.
- **Vistas guardadas**: Configuraciones de filtros, columnas y ordenamiento persistentes en base de datos.

### Hito 4: Estructura Capitular (Ensamblador de Tesis)

- **Árbol jerárquico**: Partes → Capítulos → Secciones → Subsecciones con `parent_id` y `position`.
- **Reordenamiento eficiente**: Desplazamiento solo de hermanos afectados al mover nodos (sin reescribir toda la tabla).
- **Vinculación de evidencias**: Tabla `section_evidences` que asocia secciones con notas o excerpts, con campo `position` para orden lógico.
- **Contador de palabras**: Desglose entre texto propio (`own_content`) y palabras de evidencias vinculadas.
- **Dashboard de Cobertura (Gap Checker)**:
  - Secciones huérfanas (sin evidencias).
  - Fuentes con estado `filed` sin excerpts vinculados a ninguna sección.
  - Balance por capítulo: ratio citas/palabras y progreso vs. meta de palabras.

### Hito 5: Consultas Dinámicas y Exportación Académica

- **Parser de consultas declarativas**: Bloques ```query ... ``` con sintaxis YAML-like que se traducen a SQL nativo.
- **Motor CSL (estilos de cita)**: APA 7th, Chicago Author-Date 17th, IEEE, MLA 9th, Nature.
  - Citas entre paréntesis y citas narrativas.
  - Múltiples citas agrupadas: `(@clave1#loc1; @clave2#loc2)`.
- **Poda bibliográfica (BibTeX pruning)**: Exporta solo las fuentes citadas en un texto específico.
- **YAML Frontmatter**: Generación automática de encabezado con título, autor, fecha, abstract, bibliografía y CSL.
- **Exportación vía Pandoc**: Conversión de Markdown a PDF, LaTeX, DOCX, ODT, HTML, EPUB.

### Hito 6: Rendimiento, Integridad y UX

- **Actualización en cascada**: Al renombrar título de nota o clave BibTeX, se escanea y reemplaza automáticamente todas las instancias `[[Nota Antigua]]` o `@claveAntigua` en el corpus.
- **Diagnóstico de integridad**: Detección de enlaces rotos (wikilinks a notas inexistentes, menciones a fuentes inexistentes, transclusiones con localizador inválido), secciones huérfanas, fuentes no citadas y claves duplicadas.
- **Búsqueda de texto completo extendida**: Índices FTS5 para sources, excerpts, notes y sections; búsqueda difusa por trigramas como fallback.
- **Respaldos**: Paquete `.tar.gz` con base de datos SQLite, JSON de todas las tablas y archivos Markdown planos.
- **Integración Git**: Inicialización de repositorio, commits, historial (log), estado (status) y diffs.

---

## Cómo Instalar y Ejecutar

### Prerrequisitos

- **Node.js** v24 o superior
- **npm** v11 o superior
- **Git** (opcional, para integración de control de versiones)
- **Pandoc** (opcional, para exportación a PDF/LaTeX/DOCX)

### Opción 1: Usando el alias (recomendado)

El alias `tesista` está configurado en `~/.zshrc`. Simplemente ejecuta:

```zsh
tesista
```

Esto iniciará ambos servicios en paralelo:
- **Backend API**: `http://localhost:3001`
- **Frontend UI**: `http://localhost:5173`

Presiona `Ctrl+C` para detener ambos servicios.

### Opción 2: Manual

#### Backend (Servidor API)

```bash
cd /home/guille/Proyectos/Tesista/server
npm install
npx tsx src/index.ts
```

El servidor estará disponible en `http://localhost:3001`.

#### Frontend (Interfaz de Usuario)

```bash
cd /home/guille/Proyectos/Tesista/frontend
npm install
npm run dev
```

El frontend estará disponible en `http://localhost:5173`.

### Opción 3: CLI (capa de datos directa, sin servidor)

El núcleo también incluye una interfaz de línea de comandos para pruebas y uso directo:

```bash
cd /home/guille/Proyectos/Tesista
npm install
npx tsc              # Compila TypeScript a dist/

# Ejemplos de uso:
node dist/index.ts add-source "Título del artículo" "Autor" 2020 10.1234/xyz
node dist/index.ts add-excerpt 1 "Texto de la cita textual" "p. 45" "Contexto"
node dist/index.ts add-note "Mi nota" "Contenido con [[Wikilink]] y @citekey"
node dist/index.ts add-section "Capítulo 1" chapter
node dist/index.ts section-tree
node dist/index.ts gap-report
node dist/index.ts resolve-doi 10.1038/s41586-020-2012-7
node dist/index.ts import-bibtex biblioteca.bib
node dist/index.ts export-bibtex
```

---

## Uso del Sistema

### 1. Gestión de Bibliografía (Hito 1)

1. Accede a **Biblioteca** en la barra lateral.
2. Haz clic en **Nueva Fuente** para agregar una referencia.
3. Completa título, autores, año, DOI (opcional) y estado de lectura.
4. El sistema genera automáticamente la clave BibTeX (ej. `foucault1975`).
5. Agrega citas textuales con **Página/Localizador** obligatorio.

### 2. Notas Atómicas (Hito 2)

1. Accede a **Notas Atómicas**.
2. Crea una nota con título y contenido Markdown.
3. Usa `[[Título de nota]]` para enlazar a otras notas.
4. Usa `@claveBibTeX` para mencionar fuentes bibliográficas.
5. Usa `!@clave#p45` para incrustar una cita textual como bloque de cita.
6. Consulta **Backlinks** para ver qué notas enlazan a la actual.

### 3. Estructura de Tesis (Hito 4)

1. Accede a **Capítulos**.
2. Crea Partes, Capítulos, Secciones y Subsecciones.
3. Arrastra y suelta para reordenar (funcionalidad en la capa de datos).
4. Vincula evidencias (citas o notas) a cada sección.
5. Usa **Gap Report** para detectar secciones huérfanas y fuentes no citadas.
6. Monitorea el **balance de palabras** por capítulo.

### 4. Matriz de Síntesis (Hito 3)

1. Crea etiquetas tipadas (concepto, metodología, postura, personalizada).
2. Vincula etiquetas a fuentes, citas y notas.
3. Construye una matriz con fuentes como filas y etiquetas como columnas.
4. Cada celda muestra los excerpts y notas que cruzan esa fuente con esa etiqueta.

### 5. Exportación Académica (Hito 5)

1. Desde una sección de capítulo, exporta a Markdown con:
   - YAML Frontmatter (título, autor, fecha, abstract, bibliografía, CSL).
   - Citas resueltas según el estilo seleccionado (APA, Chicago, IEEE, MLA, Nature).
   - Bibliografía podada (solo fuentes citadas en el texto).
2. Opcionalmente, convierte a PDF, LaTeX o DOCX mediante Pandoc.

---

## Endpoints de la API

El backend expone los siguientes endpoints REST:

### Fuentes (`/api/sources`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/sources` | Listar todas las fuentes |
| GET | `/api/sources/:id` | Obtener fuente por ID |
| GET | `/api/sources/citekey/:citekey` | Obtener fuente por clave BibTeX |
| POST | `/api/sources` | Crear nueva fuente |
| PUT | `/api/sources/:id` | Actualizar fuente |
| DELETE | `/api/sources/:id` | Eliminar fuente |

### Citas (`/api/excerpts`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/excerpts` | Listar citas (opcional `?sourceId=`) |
| GET | `/api/excerpts/:id` | Obtener cita por ID |
| POST | `/api/excerpts` | Crear nueva cita |
| PUT | `/api/excerpts/:id` | Actualizar cita |
| DELETE | `/api/excerpts/:id` | Eliminar cita |

### Notas (`/api/notes`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/notes` | Listar todas las notas |
| GET | `/api/notes/:id` | Obtener nota por ID |
| POST | `/api/notes` | Crear nueva nota |
| PUT | `/api/notes/:id` | Actualizar nota |
| DELETE | `/api/notes/:id` | Eliminar nota |
| GET | `/api/notes/:id/outgoing` | Enlaces salientes de una nota |
| GET | `/api/notes/:id/backlinks` | Backlinks (quién enlaza a la nota) |
| GET | `/api/notes/:id/unlinked` | Menciones no enlazadas |
| GET | `/api/notes/search?q=` | Búsqueda full-text en notas |
| GET | `/api/notes/transclude?citekey=&locator=` | Resolver transclusión |

### Etiquetas (`/api/tags`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tags` | Listar etiquetas (opcional `?type=`) |
| POST | `/api/tags` | Crear nueva etiqueta |
| POST | `/api/item-tags` | Vincular etiqueta a ítem |
| GET | `/api/items/:itemType/:itemId/tags` | Etiquetas de un ítem |

### Secciones (`/api/sections`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/sections` | Listar todas las secciones |
| GET | `/api/sections/tree` | Obtener árbol jerárquico |
| POST | `/api/sections` | Crear sección |
| GET | `/api/sections/:id` | Obtener sección por ID |
| PUT | `/api/sections/:id` | Actualizar sección |
| POST | `/api/sections/:id/reorder` | Reordenar sección |
| DELETE | `/api/sections/:id` | Eliminar sección |

### Evidencias (`/api/evidences`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/evidences` | Vincular evidencia a sección |
| GET | `/api/sections/:sectionId/evidences` | Evidencias de una sección |
| DELETE | `/api/evidences/:id` | Eliminar evidencia |

### Otros (`/api`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/gap-report` | Reporte de cobertura (huérfanos, no citadas, balance) |
| POST | `/api/matrix` | Construir matriz de síntesis |
| GET | `/api/views` | Listar vistas guardadas |
| POST | `/api/views` | Guardar vista |
| POST | `/api/cascade/note-title` | Renombrar nota con cascada |
| POST | `/api/cascade/citekey` | Renombrar citekey con cascada |
| POST | `/api/search/fts` | Búsqueda de texto completo |
| GET | `/api/integrity` | Diagnóstico de integridad |
| POST | `/api/backup` | Crear respaldo .tar.gz |
| POST | `/api/export/chapter` | Exportar capítulo a Markdown |

---

## Tecnologías Utilizadas

### Backend
- **Node.js** v24
- **TypeScript**
- **SQLite** (`better-sqlite3`) - Base de datos local
- **Express** - Servidor API REST
- **CORS** - Middleware de origen cruzado

### Frontend
- **React** v19
- **Vite** - Herramienta de construcción
- **TypeScript**
- **Tailwind CSS** v4 - Estilos
- **Axios** - Cliente HTTP
- **Lucide React** - Iconos
- **@tiptap/react** - Editor de texto enriquecido (esqueleto)

### Dependencias del Núcleo
- **better-sqlite3** - SQLite síncrono para Node.js
- **node-fetch** (nativo en Node 24) - Cliente HTTP para APIs externas

---

## Estructura de Datos (SQLite)

### Tablas Principales

| Tabla | Descripción |
|-------|-------------|
| `sources` | Fuentes bibliográficas (título, autores, año, DOI, citekey, estado de lectura) |
| `excerpts` | Citas textuales con localizador obligatorio (FK a sources) |
| `notes` | Notas atómicas en Markdown |
| `links` | Enlaces entre notas (wikilinks, menciones a fuentes, transclusiones) |
| `notes_fts` | Índice FTS5 para búsqueda en notas |
| `tags` | Etiquetas tipadas (concept, methodology, stance, custom) |
| `item_tags` | Vínculo polimórfico etiqueta → ítem (source/excerpt/note) |
| `saved_views` | Configuraciones de matriz y filtros guardadas |
| `sections` | Árbol jerárquico de partes/capítulos/secciones |
| `section_evidences` | Evidencias vinculadas a secciones con orden |

---

## Roadmap

- [x] **Hito 1**: Núcleo Bibliográfico
- [x] **Hito 2**: Notas Atómicas y Enlaces Bidireccionales
- [x] **Hito 3**: Matriz de Síntesis
- [x] **Hito 4**: Estructura Capitular y Gap Checker
- [x] **Hito 5**: Consultas Dinámicas y Exportación Académica
- [x] **Hito 6**: Rendimiento, Integridad y UX

### Posibles Mejoras Futuras

- Interfaz de arrastrar y soltar para reordenar secciones (frontend)
- Integración completa de TipTap como editor de notas en el frontend
- Soporte para archivos CSL externos (.csl)
- Sincronización con Git remoto
- Exportación directa a LaTeX con BibTeX
- Modo oscuro completo en el frontend

---

## Licencia

MIT License - Véase el archivo LICENSE para más detalles.

---

## Soporte

Para problemas o sugerencias, abre un issue en el repositorio del proyecto.
