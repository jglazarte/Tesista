# Plan de Desarrollo: Tesista
**Plataforma de gestión de conocimiento, referencias y cruce de datos para tesis doctorales**  
*(Combinando lo mejor de Zotero, Obsidian y Notion sin manejo de imágenes ni elementos distractores)*

---

## 1. Visión del Proyecto y Principios de Diseño

* **Propósito:** Brindar al doctorando un entorno centralizado para recopilar literatura, extraer citas exactas, desarrollar notas conceptuales atómicas, cruzar variables en matrices de síntesis y estructurar los capítulos de su tesis con trazabilidad total de evidencias.
* **Enfoque en Texto y Estructura:** No requiere procesamiento de imágenes pesadas; optimizado para texto plano, metadatos estructurados, citas bibliográficas y relaciones multidireccionales.
* **Trazabilidad Epistémica:** Cada afirmación o idea en la tesis debe poder rastrearse hasta una nota conceptual, una cita textual y una fuente original con página exacta.
* **Privacidad y Durabilidad:** Almacenamiento local, portable y fácil de respaldar (orientado a proyectos de 3 a 5 años).

---

## 2. Modelo de Entidades y Relaciones

1. **Fuentes (Sources):** Metadatos bibliográficos, DOI, clave BibTeX única (`@autorAño`), estado de lectura.
2. **Citas (Quotes/Excerpts):** Fragmentos textuales exactos, localizador (página/párrafo), contexto y etiquetas.
3. **Notas Atómicas (Ideas/Concepts):** Elaboraciones teóricas en Markdown, reflexiones y síntesis conectadas con `[[Wikilinks]]`.
4. **Taxonomías (Tags & Descriptores):** Variables, metodologías, escuelas de pensamiento, posturas argumentales.
5. **Estructura de Tesis (Outliner/Capítulos):** Jerarquía de Partes, Capítulos, Secciones y Subsecciones con asignación de evidencias.

---

## 3. Hoja de Ruta por Hitos (Milestones)

### Hito 1: Núcleo Bibliográfico y Extracción de Citas (Fundación tipo Zotero)
> **Objetivo:** Disponer de una base de datos sólida para registrar literatura científica y despiezarla en fragmentos citables.

Esquema de Base de Datos (Persistencia):

        Configurar una base de datos SQLite local (o archivos JSON/YAML con esquema estricto) para almacenar la tabla/colección Sources y la tabla Excerpts relacionadas mediante una clave foránea (source_id).

        Definir un algoritmo seguro para generar la clave BibTeX (citekey): si la clave ya existe (ej. smith2020), añadir un sufijo alfabético automático (smith2020a, smith2020b).

    Integración con APIs Externas (Ingesta):

        Implementar un cliente HTTP para consultar la API pública de CrossRef ([https://api.crossref.org/works/](https://api.crossref.org/works/){doi}) u OpenAlex ([https://api.openalex.org/works/https://doi.org/](https://api.openalex.org/works/https://doi.org/){doi}).

        Manejar fallback: si el DOI no existe o la API falla, permitir la entrada manual completa sin bloquear al usuario.

    Parsing de Archivos BibTeX:

        Utilizar una biblioteca madura de parsing BibTeX (como bibtex-parser en JavaScript/TypeScript o bibtexparser en Python) para transformar bibliotecas exportadas de Zotero/Mendeley en objetos internos de la app.

    Validación de Datos en UI/UX:

        La interfaz no debe permitir crear una cita ("Excerpt") que no esté asociada a una fuente existente (source_id no nulo).

        El campo "Página/Localizador" debe ser obligatorio para asegurar la precisión epistémica desde el primer día.

---

### Hito 2: Motor de Notas Atómicas y Enlaces Bidireccionales (Conexión tipo Obsidian)
> **Objetivo:** Permitir el pensamiento propio interconectado mediante un sistema de notas conceptuales y retroenlaces.

Selección del Motor de Edición (WYSIWYG/Markdown):

        Integrar una librería de edición enriquecida basada en bloques o marcado directo (como TipTap, CodeMirror 6 o ProseMirror).

        Configurar extensiones personalizadas (extensions/nodes) para interceptar la sintaxis de [[ (Wikilinks) y @ (menciones de fuentes) y mostrar un menú emergente de sugerencias (autocomplete popup).

    Parser y Construcción del Grafo de Enlaces:

        Implementar un analizador mediante expresiones regulares o parsing AST para extraer todas las referencias internas ([[...]] y @citekey) al guardar o editar una nota.

        Mantener un índice secundario o tabla relacional Links (source_note_id, target_note_id / target_source_id) para realizar consultas rápidas de backlinks sin tener que escanear todo el disco en cada renderizado.

    Mecanismo de Indexación para Menciones No Enlazadas:

        Utilizar un motor de búsqueda de texto completo local (como SQLite FTS5, FlexSearch o Lunr.js) para indexar los títulos de las notas.

        Al abrir una nota, realizar una búsqueda de coincidencias exactas del título en el resto de la base de conocimiento, excluyendo aquellas notas que ya tengan un enlace explícito.

    Sintaxis de Transclusión (Incrustación de Citas):

        Definir una convención de renderizado dinámico (ejemplo: ![] o !@foucault1975vigilar#p45).

        Al renderizar en el editor, este bloque debe mostrar la cita exacta en un contenedor visual delimitado (tipo bloque de cita) manteniendo un enlace directo a la fuente original.

---

### Hito 3: Base de Datos Relacional y Matriz de Síntesis (Cruce de Datos tipo Notion)
> **Objetivo:** Construir la herramienta analítica fundamental del doctorando: cruzar literatura contra conceptos y variables.

Modelado de Etiquetas Tipadas y Atributos:

        Diseñar una estructura de datos para la tabla Tags que incluya un campo type (ej. concept, methodology, stance, custom) y un color o icono asociado.

        Establecer una tabla intermedia relacional (ItemTags) que vincule polimórficamente o mediante IDs explícitos cada etiqueta con Sources, Excerpts o Notes.

    Arquitectura de la Matriz de Síntesis (Grid UI):

        Utilizar una biblioteca de tablas/grids de alto rendimiento (como TanStack Table, ag-Grid o DataGrid) para manejar el renderizado virtualizado si el cruce de datos incluye decenas de fuentes y variables.

        Las celdas no deben ser texto plano estático: deben actuar como contenedores dinámicos que ejecuten una consulta interna (ej. Obtener Excerpts/Notes donde Source = Fila_ID y Tag/Variable = Columna_ID).

    Optimización de Rendimiento y Carga Perezosa (Lazy Loading):

        En matrices extensas, evitar la carga simultánea de todos los fragmentos de texto completo. Cargar inicialmente identificadores/previsualizaciones breves en las celdas y desplegar un panel lateral o popover con el contenido completo al hacer clic.

    Motor de Filtros y Vistas Persistentes:

        Implementar un evaluador de condiciones booleanas (AND, OR, NOT) respaldado por índices en la base de datos (o consultas precompiladas) para garantizar respuesta instantánea al filtrar.

        Permitir guardar configuraciones de matriz y tableros Kanban como "Vistas Guardadas" (guardando el estado de filtros, ordenamiento y columnas en la base de datos local).

---

### Hito 4: Esquema Capitular y Ensamblador de Tesis (Thesis Builder)
> **Objetivo:** Transformar el repositorio de lecturas e ideas en el manuscrito formal de la tesis doctoral.

Gestión del Árbol Jerárquico (UI & Drag and Drop):

        Utilizar una librería de manipulación de árboles con soporte para arrastrar y soltar (drag-and-drop, como dnd-kit, react-accessible-treeview o SortableJS).

        Al reordenar o anidar nodos (capítulos/secciones), actualizar en la base de datos un esquema de ordenación eficiente (ej. ordenamiento fraccional o índices parent_id + position) para evitar reescribir toda la tabla en cada movimiento.

    Vinculación de Evidencias por Sección:

        Diseñar una tabla relacional SectionEvidences que asocie section_id con note_id o excerpt_id, incluyendo un campo order para permitir la secuencia lógica del argumento dentro de esa sección.

        La interfaz debe permitir arrastrar una cita o nota desde el buscador/panel de biblioteca directamente hacia la columna de evidencias del capítulo activo.

    Lógica del Dashboard de Cobertura (Gap Checker):

        Implementar consultas analíticas (o queries precompiladas) que calculen:

            Capítulos "huérfanos": Registros de secciones cuya cuenta de registros en SectionEvidences sea igual a 0.

            Fuentes no citadas: Registros en Sources con estado Fichado pero cuyos Excerpts asociados no figuren en ninguna SectionEvidences ni estén transcluidos en notas asignadas a secciones.

            Métricas de balance: Cálculo en tiempo real del ratio Citas/Palabras por capítulo para detectar secciones teóricamente desproporcionadas.

    Contador de Palabras y Progresión Visual:

        Integrar un motor de conteo de palabras ligero que distinga entre el texto propio de la sección y el texto correspondiente a las citas transcluidas.

        Mostrar barras de progreso visuales (% de palabras escritas vs. meta orientativa) en la vista general del Outliner.

---

### Hito 5: Consultas Dinámicas y Exportación Académica
> **Objetivo:** Automatizar la recuperación de información y generar salidas compatibles con los estándares de publicación académica.

Parser de Consultas Declarativas (Embedded Query Engine):

        Crear un lexer/parser ligero (utilizando regex o generadores como Peggy / NEARLEY) para reconocer bloques de código especiales (ej. ```query ... ```).

        Traducir las instrucciones declarativas del usuario a consultas SQL nativas (o filtros sobre el índice en memoria) y re-renderizar dinámicamente el resultado en forma de lista o tabla interactiva dentro del documento.

    Integración con Pandoc / CLI o WebAssembly:

        Entorno Escritorio/Local: Invocar el ejecutable CLI de Pandoc mediante procesos secundarios (child process / subprocess) para realizar conversiones directas a PDF, LaTeX o DOCX.

        Entorno Web/Aislado: Compilar o integrar Pandoc via WebAssembly (wasm-pandoc) para procesar la transformación de Markdown a LaTeX/Typst sin depender de instalaciones externas en el sistema operativo.

    Procesamiento de Estilos CSL (Citeproc Engine):

        Integrar una librería JS/TS como citeproc-js o citeproc-rs junto con el repositorio oficial de archivos de estilo .csl.

        Implementar la rutina de "poda bibliográfica" (BibTeX pruning): al exportar un capítulo a LaTeX/BibTeX, el sistema debe analizar los marcadores @clave del manuscrito, filtrar la base de datos general de fuentes y exportar un archivo .bib que contenga exclusivamente las fuentes citadas en ese texto.

    Preservación de Metadatos de Exportación (YAML Frontmatter):

        Al exportar a Markdown o LaTeX, generar automáticamente el encabezado YAML (frontmatter) con título de la tesis, autor, fecha, abstract y ruta al archivo de bibliografía, asegurando compatibilidad nativa con motores de compilación académica.

---

### Hito 6: Rendimiento, Integridad y Experiencia de Usuario
> **Objetivo:** Asegurar confiabilidad técnica absoluta para un proyecto de investigación plurianual.
Gestión de Renombramientos y Actualización en Cascada:

        Implementar un evento de actualización (trigger de BD o evento en la capa de aplicación) que, al modificar el título de una nota o una clave BibTeX (citekey), escanee y reemplace automáticamente todas las instancias [[Nota Antigua]] o @claveAntigua en el corpus.

        Mantener una vista de diagnóstico ("Enlaces Rotos / Huérfanos") que liste los punteros que apuntan a notas o fuentes inexistentes para permitir su reparación manual o reconexión con un clic.

    Indexación y Búsqueda de Texto Completo (FTS):

        Configurar SQLite FTS5 (o FlexSearch / MiniSearch si el entorno es 100% JavaScript en memoria) indexando los campos de texto de Sources, Excerpts, Notes y Sections.

        Habilitar búsqueda difusa (fuzzy search) o por lematización/trigramas para tolerar pequeños errores tipográficos al buscar apellidos de autores, términos en otros idiomas o fragmentos de citas.

    Estrategia de Respaldos (Backup Strategy) y Portabilidad:

        Diseñar una rutina de exportación de "respaldo de un solo clic" que empaquete la base de datos completa junto con los archivos Markdown en un comprimido .zip estructurado.

        Garantizar que la estructura guardada en disco sea totalmente legible y transparente sin necesidad de utilizar la app (carpetas con archivos .md planos e índices .json/.db legibles).

    Integración con Control de Versiones (Git Integration):

        Incorporar una abstracción ligera sobre Git (usando bibliotecas como isomorphic-git o ejecutando comandos nativos de Git en entornos de escritorio) para permitir auto-commits periódicos o por hito de escritura.

        Proporcionar una vista simple de historial de cambios (diffs) para que el usuario pueda comparar versiones anteriores de sus capítulos o notas si necesita recuperar una redacción previa.
