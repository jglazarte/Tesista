"use client";

import { useState, useEffect } from "react";
import { Link } from "lucide-react";
import { notesApi } from "../api";

export const NotesPage = () => {
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredNotes, setFilteredNotes] = useState<any[]>([]);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const data = await notesApi.list();
      setNotes(data);
      setFilteredNotes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createNote = async () => {
    const title = prompt("Título de la nota:");
    if (!title) return;
    const content = prompt("Contenido (Markdown):", "");
    try {
      const note = await notesApi.create({ title, content: content || "" });
      setNotes([...notes, note]);
      setSelectedNote(note);
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al crear nota");
    }
  };

  const selectNote = (note: any) => {
    setSelectedNote(note);
  };

  const saveNote = async () => {
    if (!selectedNote) return;
    const textarea = document.getElementById("note-content") as HTMLTextAreaElement | null;
    const content = textarea?.value || "";
    try {
      const updated = await notesApi.update(selectedNote.id!, { content });
      setSelectedNote(updated);
      setNotes(notes.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    }
  };

  const insertAtCursor = (text: string) => {
    const textarea = document.getElementById("note-content") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const textValue = textarea.value;
    textarea.value = textValue.substring(0, start) + text + textValue.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  };

  const insertWikilink = () => {
    const target = prompt("Título de la nota a vincular:");
    if (!target) return;
    insertAtCursor(`[[${target}]]`);
  };

  const insertCiteMention = () => {
    const citekey = prompt("Clave BibTeX (@clave):");
    if (!citekey) return;
    insertAtCursor(`@${citekey}`);
  };

  const insertTransclusion = () => {
    const citekey = prompt("Clave BibTeX:");
    const locator = prompt("Localizador (página/párrafo):");
    if (!citekey || !locator) return;
    insertAtCursor(`!@${citekey}#${locator}`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4" />
          <h1 className="text-lg font-semibold">Notas Atómicas</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={createNote}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
            disabled={loading}
          >
            Nueva Nota
          </button>
          <button
            onClick={saveNote}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
            disabled={!selectedNote || loading}
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Lista de notas */}
        <div className="w-1/3 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <input
              className="w-full border border-input rounded-md px-3 py-2 text-sm"
              placeholder="Buscar notas..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                const q = e.target.value.toLowerCase();
                setFilteredNotes(
                  notes.filter(
                    (n) =>
                      n.title.toLowerCase().includes(q) ||
                      n.content.toLowerCase().includes(q)
                  )
                );
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => selectNote(note)}
                className={`w-full text-left p-3 border-b border-border/50 text-sm ${
                  selectedNote?.id === note.id
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <div className="font-medium">{note.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {note.content?.slice(0, 80)}...
                </div>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No hay notas
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-4 bg-background">
            {selectedNote ? (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold mb-2">{selectedNote.title}</h2>
                <div className="text-muted-foreground text-sm mb-4">
                  {selectedNote.createdAt || ""}
                </div>
                <textarea
                  id="note-content"
                  className="w-full h-full min-h-[400px] rounded-md border border-input bg-background p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  defaultValue={selectedNote.content || ""}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p>Selecciona una nota o crea una nueva</p>
              </div>
            )}
          </div>

          {/* Barra de herramientas del editor */}
          <div className="p-3 border-t border-border bg-muted/50 flex flex-wrap gap-2">
            <button
              onClick={insertWikilink}
              className="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Insertar wikilink [[Nota]]"
            >
              [[Nota]]
            </button>
            <button
              onClick={insertCiteMention}
              className="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Insertar mención @citekey"
            >
              @citekey
            </button>
            <button
              onClick={insertTransclusion}
              className="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Insertar transclusión !@cite#locator"
            >
              !@cite#loc
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
