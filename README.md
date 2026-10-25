# Tesista - Plataforma de Gestión de Conocimiento para Tesis Doctorales

**Plataforma de gestión de conocimiento, referencias y cruce de datos para tesis doctorales**  
*(Combinando lo mejor de Zotero, Obsidian y Notion sin manejo de imágenes ni elementos distractores)*

---

## 1. Descripción del Proyecto

Tesista es una plataforma especializada para doctorandos que necesitan gestionar literatura científica, extraer citas textuales, desarrollar notas conceptuales atómicas, cruzar variables en matrices de síntesis y estructurar los capítulos de su tesis doctoral con trazabilidad total de evidencias.

El sistema está optimizado para **texto plano, metadatos estructurados, citas bibliográficas y relaciones multidireccionales**, sin elementos distractores como procesamiento de imágenes pesadas.

### Principios de Diseño

- **Trazabilidad Epistémica**: Cada afirmación en la tesis debe poder rastrearse hasta una nota conceptual, una cita textual y una fuente original con página exacta
- **Almacenamiento Local**: Base de datos SQLite portable y fácil de respaldar (orientada a proyectos de 3 a 5 años)
- **Enfoque en Texto**: Optimizado para texto plano y metadatos
- **Privacidad**: Los datos permanecen en la máquina del usuario

---

## 2. Arquitectura del Proyecto

```
tesista/
├── tesista.md              # Plan de desarrollo original (milestones 1-6)
├── README.md               # Este archivo
├── .gitignore              # Excluye dependencias y artefactos generados
├── package.json            # Dependencias del núcleo (Node.js)
├── tsconfig.json           # Configuración TypeScript
├── data/                   # Base SQLite local (tesista.db)
├── backups/                # Respaldos .tar.gz generados desde la UI
├── export/                 # Capítulos exportados desde la UI
│
├── src/                    # Capa de datos (Node.js + SQLite + TypeScript)
│   ├── types.ts            # Tipos de dominio compartidos
│   ├── citekey.ts          # Algoritmo de claves BibTeX (smith2020, smith2020a...)
│   ├── crossref.ts         # Cliente API pública de CrossRef
│   ├── openalex.ts         # Cliente API pública de OpenAlex
│   ├── bibtex.ts           # Parser y serializador BibTeX (Zotero/Mendeley)
│   ├── link-parser.ts      # Parser de [[wikilinks]], @citekey, !@cite#loc
│   ├── db.ts               # Capa de persistencia SQLite (milestones 1-4)
│   ├── query-parser.ts     # Parser de consultas declarativas (Hito 5)
│   ├── csl.ts              # Motor CSL: APA, Chicago, IEEE, MLA, Nature (Hito 5)
│   ├── pandoc.ts           # Wrapper Pandoc para exportación (Hito 5)
│   ├── export.ts           - Exportación académica: YAML frontmatter, BibTeX pruning (Hito 5)
│   ├── cascade.ts          - Actualización en cascada de citekeys y títulos (Hito 6)
│   ├── integrity.ts        - Diagnóstico de enlaces rotos y huérfanos (Hito 6)
│   ├── fts.ts              - Búsqueda de texto completo FTS5 (Hito 6)
│   ├── backup.ts           - Respaldos .tar.gz (Hito 6)
│   ├── git.ts              - Integración Git (Hito 6)
│   └── editor/             # Esqueleto de extensiones TipTap para el editor de notas
│       └── tiptap-extensions.ts
│
├── server/                 # API REST (Express + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts        # Endpoints REST para todos los recursos
│
└── frontend/               # Interfaz de usuario (React + Vite + Tailwind CSS)
    ├── package.json
    ├── vite.config.mts     # Configuración Vite (ESM) con proxy /api → 3001
    ├── postcss.config.js
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── index.css       # Tailwind v4 + tokens de tema (claro/oscuro)
        ├── api.ts          # Cliente tipado de la API REST
        ├── App.tsx         # Shell, Dashboard y navegación
        └── components/
            ├── Sidebar.tsx             (navegación lateral colapsable)
            ├── SourcesPage.tsx         (fuentes, DOI, citas y etiquetas)
            ├── NotesPage.tsx           (editor de notas con wikilinks, @citekey, transclusión y etiquetas)
            ├── SectionsPage.tsx        (árbol jerárquico, evidencias, progreso y Gap Checker)
            ├── MatrixPage.tsx          (matriz de síntesis y gestor de etiquetas)
            └── SettingsPage.tsx        (tema, mantenimiento, respaldos y Git)
```

---

## 3. Características por Hito

### Hito 1: Núcleo Bibliográfico (Tipo Zotero)

- **Base de datos SQLite local** con tablas `sources` y `excerpts` vinculadas por clave foránea
- **Generación automática de claves BibTeX**: `{apellido}{año}` con sufijo alfabético al colisionar (`smith2020`, `smith2020a`, `smith2020b`...)
- **Ingesta por API externa**: Clientes HTTP para CrossRef y OpenAlex con fallback en cadena
- **Entrada manual**: Si el DOI no existe o la API falla, se permite entrada completa sin bloquear
- **Importación/exportación BibTeX**: Parser y serializador para bibliotecas de Zotero/Mendeley
- **Validaciones obligatorias**:
  - Una cita (`Excerpt`) no puede crearse sin `source_id` asociado a una fuente existente
  - El campo **Página/Localizador** es obligatorio para trazabilidad epistémica

### Hito 2: Motor de Notas Atómicas (Tipo Obsidian)

- **Notas atómicas en Markdown** con título y contenido
- **Wikilinks**: Sintaxis `[[Título de nota]]` con soporte para alias `[[Título|Alias]]`
- **Menciones a fuentes**: Sintaxis `@claveBibTeX` para citar fuentes bibliográficas
- **Transclusión**: Sintaxis `!@claveBibTeX#localizador` para incrustar citas textuales como bloques de cita
- **Tabla de enlaces**: Persistencia de wikilinks, menciones y transclusiones
- **Backlinks**: Consulta de qué notas enlazan a una nota dada
- **Menciones no enlazadas**: Detección de títulos de notas que aparecen en texto plano sin wikilink explícito
- **Búsqueda full-text (FTS5)**: Índice sobre título y contenido de notas

### Hito 3: Matriz de Síntesis (Tipo Notion)

- **Etiquetas tipadas**: `concept`, `methodology`, `stance`, `custom` con color e ícono asociado
- **Vínculos polimórficos**: Tabla `item_tags` que vincula etiquetas con sources, excerpts o notes
- **Motor de filtros booleanos**: Operadores `eq`, `neq`, `like`, `ilike`, `in`, `is_null`, `is_not_null`, `gt`, `gte`, `lt`, `lte`, `has_tag`, `has_not_tag` con combinadores `AND`, `OR` y `NOT`
- **Matriz de síntesis**: Filas = fuentes, Columnas = etiquetas, Celdas = excerpts/notes vinculadas
- **Vistas guardadas**: Configuraciones de filtros, columnas y ordenamiento persistentes

### Hito 4: Estructura Capitular (Ensamblador de Tesis)

- **Árbol jerárquico**: Partes → Capítulos → Secciones → Subsecciones con `parent_id` y `position`
- **Reordenamiento eficiente**: Desplazamiento solo de hermanos afectados al mover nodos
- **Vinculación de evidencias**: Tabla `section_evidences` que asocia secciones con notas o excerpts, con campo `position` para orden lógico
- **Contador de palabras**: Desglose entre texto propio (`own_content`) y palabras de evidencias vinculadas
- **Dashboard de Cobertura (Gap Checker)**:
  - Secciones huérfanas (sin evidencias)
  - Fuentes con estado `filed` sin excerpts vinculados a ninguna sección
  - Balance por capítulo: ratio citas/palabras y progreso vs. meta

### Hito 5: Consultas Dinámicas y Exportación Académica

- **Parser de consultas declarativas**: Bloques ```query ... ``` con sintaxis YAML-like que se traducen a SQL nativo
- **Motor CSL (estilos de cita)**: APA 7th, Chicago Author-Date 17th, IEEE, MLA 9th, Nature
  - Citas entre paréntesis y citas narrativas
  - Múltiples citas agrupadas: `(@clave1#loc1; @clave2#loc2)`
- **Poda bibliográfica (BibTeX pruning)**: Exporta solo las fuentes citadas en un texto específico
- **YAML Frontmatter**: Generación automática de encabezado con título, autor, fecha, abstract, bibliografía y CSL
- **Exportación vía Pandoc**: Conversión de Markdown a PDF, LaTeX, DOCX, ODT, HTML, EPUB

### Hito 6: Rendimiento, Integridad y Experiencia de Usuario

- **Actualización en cascada**: Al renombrar título de nota o clave BibTeX, se escanea y reemplaza automáticamente todas las instancias `[[Nota Antigua]]` o `@claveAntigua` en el corpus
- **Diagnóstico de integridad**: Detección de enlaces rotos, secciones huérfanas, fuentes no citadas y claves duplicadas
- **Búsqueda de texto completo extendida**: Índices FTS5 para sources, excerpts, notes y sections; búsqueda difusa por trigramas
- **Respaldos**: Paquete `.tar.gz` con base de datos SQLite, JSON de todas las tablas y archivos Markdown planos
- **Integración Git**: Inicialización de repositorio, commits, historial (log), estado (status) y diffs
- **Interfaz completa en el navegador**: Dashboard con métricas, editor de notas grande, gestión de etiquetas, matriz interactiva y panel de configuración (tema oscuro, mantenimiento, respaldos y Git)

---

## 4. Cómo Instalar y Ejecutar

### Prerrequisitos

- **Node.js** v24 o superior
- **npm** v11 o superior
- **Git** (opcional, para integración de control de versiones)
- **Pandoc** (opcional, para exportación a PDF/LaTeX/DOCX)

### Opción 1: Usando el alias `tesista` (recomendado)

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
npm run dev          # desarrollo con recarga (tsx watch)
```

El servidor estará disponible en `http://127.0.0.1:3001`.

Para ejecutar la versión compilada:

```bash
npm run build        # genera server/dist/
npm start            # node dist/server/src/index.js
```

#### Frontend (Interfaz de Usuario)

```bash
cd /home/guille/Proyectos/Tesista/frontend
npm install
npm run dev
```

El frontend estará disponible en `http://localhost:5173` y redirige `/api` al backend.

Para comprobar tipos y generar la build de producción:

```bash
npm run typecheck
npm run build
npm run preview
```

#### Atajos desde la raíz

```bash
npm run dev:server     # inicia solo el backend
npm run dev:frontend   # inicia solo el frontend
npm run typecheck      # verifica el núcleo
npm start              # inicia ambos servicios con scripts/start-tesista.sh
```

### Opción 3: CLI (capa de datos directa)

El núcleo también incluye una interfaz de línea de comandos para pruebas y uso directo:

```bash
cd /home/guille/Proyectos/Tesista
npm install
npm run build        # compila TypeScript a dist/

# Ejemplos de uso:
node dist/index.js add-source "Título del artículo" "Autor" 2020 10.1234/xyz
node dist/index.js add-excerpt 1 "Texto de la cita textual" "p. 45" "Contexto"
node dist/index.js add-note "Mi nota" "Contenido con [[wikilink]] y @citekey"
node dist/index.js add-section "Capítulo 1" chapter
node dist/index.js section-tree
node dist/index.js gap-report
node dist/index.js resolve-doi 10.1038/s41586-020-2012-7
node dist/index.js import-bibtex biblioteca.bib
node dist/index.js export-bibtex
```

> La base de datos se guarda en `data/tesista.db`. Para usar otra ruta, definí `TESISTA_DB=/ruta/a/otra.db` antes de iniciar el backend o la CLI.

---

## 5. Cómo Usar el Sistema

### 1. Gestión de Bibliografía (Hito 1)

1. Ve a **Biblioteca** en la barra lateral
2. Haz clic en **Nueva Fuente** para agregar una referencia
3. Completa título, autores, año, DOI (opcional) y estado de lectura
4. El sistema genera automáticamente la clave BibTeX (ej. `foucault1975`)
5. Usa **Importar DOI** para traer metadatos desde CrossRef/OpenAlex
6. Seleccioná una fuente para agregar citas con **Página/Localizador** obligatorio y etiquetas

### 2. Notas Atómicas (Hito 2)

1. Ve a **Notas Atómicas** en la barra lateral
2. Haz clic en **Nueva Nota**
3. Completa título, contenido Markdown y opcionalmente etiquetas separadas por comas
4. Usa `[[Título de nota]]` para enlazar a otras notas
5. Usa `@claveBibTeX` para mencionar fuentes bibliográficas
6. Usa `!@claveBibTeX#página` para incrustar una cita textual como bloque de cita
7. Guardá con el botón o con `Ctrl/⌘ + S`; consultá **Backlinks** al pie del editor
8. La búsqueda de la lista filtra por título, contenido y etiquetas

### 3. Estructura de Tesis (Hito 4)

1. Ve a **Capítulos**
2. Crea Partes, Capítulos, Secciones y Subsecciones
3. Reordena con las flechas **Subir/Bajar** y cambia el padre desde **Editar datos**
4. Vincula evidencias (citas o notas) a cada sección
5. Define un objetivo de palabras y seguí la barra de progreso
6. Usa **Gap Checker** para detectar secciones huérfanas y fuentes no citadas

### 4. Matriz de Síntesis (Hito 3)

1. Abre **Matriz de Síntesis**
2. Elegí el tipo de etiqueta (concepto, metodología, postura, personalizada)
3. Hacé clic en una celda con número para ver las citas y notas que la componen
4. Usa **Etiquetas** para crear, renombrar o eliminar etiquetas del vocabulario

### 5. Exportación Académica (Hito 5)

1. Ve a **Capítulos**, seleccioná una sección y hacé clic en **Exportar**
2. Completá título, autor, fecha y estilo de cita (APA, Chicago, IEEE, MLA, Nature)
3. Elegí si incluir la bibliografía podada y si guardar el archivo en `export/`
4. La exportación genera Markdown con:
   - YAML Frontmatter (título, autor, fecha, abstract, idioma)
   - Citas resueltas según el estilo seleccionado
   - Bibliografía podada (solo fuentes citadas en el texto)
5. Podés **Descargar Markdown** directamente desde el navegador o convertir a PDF, LaTeX, DOCX o Typst mediante Pandoc (si está instalado)

### 6. Configuración (Hito 6)

1. Ve a **Configuración**
2. **General**: activa modo oscuro y autoguardado de notas
3. **Base de datos**: consulta conteos, ejecuta `VACUUM` y genera el reporte de integridad
4. **Respaldos**: crea un `.tar.gz` con la base, JSON de tablas y notas en Markdown
5. **Git**: inicializa el repositorio, revisa cambios, crea commits y consulta el historial/diffs

---

## 6. Endpoints de la API

El backend expone los siguientes endpoints REST:

| Módulo | Endpoint | Método | Descripción |
|--------|----------|--------|-------------|
| Sources | `/api/sources` | GET | Listar todas las fuentes |
| Sources | `/api/sources/:id` | GET | Obtener fuente por ID |
| Sources | `/api/sources/citekey/:citekey` | GET | Obtener fuente por clave BibTeX |
| Sources | `/api/sources` | POST | Crear nueva fuente |
| Sources | `/api/sources/:id` | PUT | Actualizar fuente |
| Sources | `/api/sources/:id` | DELETE | Eliminar fuente |
| Sources | `/api/sources/import-doi` | POST | Importar metadatos por DOI (CrossRef → OpenAlex) |
| Excerpts | `/api/excerpts` | GET | Listar citas |
| Excerpts | `/api/excerpts/:id` | GET | Obtener cita por ID |
| Excerpts | `/api/excerpts` | POST | Crear nueva cita |
| Excerpts | `/api/excerpts/:id` | PUT | Actualizar cita |
| Excerpts | `/api/excerpts/:id` | DELETE | Eliminar cita |
| Notes | `/api/notes` | GET | Listar todas las notas |
| Notes | `/api/notes/:id` | GET | Obtener nota por ID |
| Notes | `/api/notes` | POST | Crear nueva nota (acepta `tags`) |
| Notes | `/api/notes/:id` | PUT | Actualizar nota y sus etiquetas |
| Notes | `/api/notes/:id` | DELETE | Eliminar nota |
| Notes | `/api/notes/search?q=` | GET | Búsqueda full-text en notas |
| Notes | `/api/notes/:id/outgoing` | GET | Enlaces salientes de una nota |
| Notes | `/api/notes/:id/backlinks` | GET | Notas que enlazan a esta |
| Notes | `/api/notes/:id/unlinked` | GET | Menciones sin wikilink |
| Notes | `/api/notes/transclude?citekey=&locator=` | GET | Resolver transclusión |
| Sections | `/api/sections` | GET | Listar todas las secciones |
| Sections | `/api/sections/tree` | GET | Obtener árbol jerárquico con conteos |
| Sections | `/api/sections` | POST | Crear sección |
| Sections | `/api/sections/:id` | GET | Obtener sección por ID |
| Sections | `/api/sections/:id` | PUT | Actualizar sección (incluye `parentId: null`) |
| Sections | `/api/sections/:id/reorder` | POST | Reordenar sección |
| Sections | `/api/sections/:id` | DELETE | Eliminar sección |
| Sections | `/api/sections/:id/word-count` | GET | Conteo de palabras de sección |
| Sections | `/api/sections/:id/evidences` | GET | Evidencias de una sección |
| SectionEvidences | `/api/evidences` | POST | Vincular evidencia a sección |
| SectionEvidences | `/api/evidences/:id` | DELETE | Eliminar evidencia |
| Gap Report | `/api/gap-report` | GET | Reporte de cobertura y balance por capítulo |
| Tags | `/api/tags` | GET | Listar etiquetas |
| Tags | `/api/tags` | POST | Crear o recuperar etiqueta por nombre |
| Tags | `/api/tags/:id` | PUT | Actualizar etiqueta |
| Tags | `/api/tags/:id` | DELETE | Eliminar etiqueta y sus vínculos |
| ItemTags | `/api/item-tags` | POST | Vincular etiqueta a ítem |
| ItemTags | `/api/item-tags/:id` | DELETE | Quitar vínculo por ID |
| ItemTags | `/api/items/:itemType/:itemId/tags` | GET | Etiquetas de un ítem |
| ItemTags | `/api/items/:itemType/:itemId/tags` | PUT | Reemplazar etiquetas de un ítem |
| Matrix | `/api/matrix` | POST | Construir matriz de síntesis |
| SavedViews | `/api/views` | GET | Listar vistas guardadas |
| SavedViews | `/api/views` | POST | Guardar vista |
| Cascade | `/api/cascade/note-title` | POST | Renombrar nota con cascada |
| Cascade | `/api/cascade/citekey` | POST | Renombrar citekey con cascada |
| FTS | `/api/search/fts` | POST | Búsqueda de texto completo |
| Integrity | `/api/integrity` | GET | Diagnóstico de integridad |
| Stats | `/api/stats` | GET | Conteos de fuentes, citas, notas, secciones, etiquetas y enlaces |
| Backup | `/api/backup` | POST | Crear respaldo .tar.gz (`outputPath` opcional) |
| Export | `/api/export/chapter` | POST | Exportar capítulo (Markdown/LaTeX/PDF/DOCX/Typst) |
| Git | `/api/git/status` | GET | Estado del repositorio |
| Git | `/api/git/log?limit=` | GET | Historial de commits |
| Git | `/api/git/diff?from=&to=&file=` | GET | Diff entre commits |
| Git | `/api/git/commit` | POST | Crear commit |
| Git | `/api/git/init` | POST | Inicializar repositorio |
| Maintenance | `/api/maintenance/vacuum` | POST | Compactar la base SQLite |

---

## 7. Tecnologías Utilizadas

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

### Dependencias del Núcleo
- **better-sqlite3** - SQLite síncrono para Node.js
- **node-fetch** (nativo en Node 24) - Cliente HTTP para APIs externas

---

## 8. Estructura de Datos (SQLite)

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

## 9. Roadmap (Hitos Completados)

| Hito | Nombre | Estado |
|------|--------|--------|
| 1 | Núcleo Bibliográfico | ✅ Completado |
| 2 | Notas Atómicas y Enlaces Bidireccionales | ✅ Completado |
| 3 | Matriz de Síntesis y Filtros | ✅ Completado |
| 4 | Estructura Capitular y Gap Checker | ✅ Completado |
| 5 | Consultas Dinámicas y Exportación Académica | ✅ Completado |
| 6 | Rendimiento, Integridad y UX | ✅ Completado |

### Mejoras Futuras Posibles

- Arrastrar y soltar para reordenar secciones (hoy se usan flechas Subir/Bajar)
- Editor enriquecido con TipTap (el editor actual es Markdown plano)
- Migraciones de esquema versionadas y tests automatizados
- Paginación en listados grandes y optimización de consultas del árbol/matriz
- Botón de exportación de capítulos directamente desde la UI
- Soporte para archivos CSL externos (.csl)
- Sincronización con Git remoto
- Exportación directa a LaTeX con BibTeX

---

## 10. Licencia

MIT License - Véase el archivo LICENSE para más detalles.

---

## 11. Soporte

Para problemas o sugerencias, abre un issue en el repositorio del proyecto.
