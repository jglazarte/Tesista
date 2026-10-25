"use client";

import { useState, useEffect } from "react";
import { matrixApi } from "../api";

export const MatrixPage = () => {
  const [matrix, setMatrix] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const data = await matrixApi.build({ tagType: "concept", rowLimit: 50 });
      setMatrix(data);
    } catch (e: any) {
      alert(e.response?.data?.error || "Error al construir matriz");
    } finally { setLoading(false); }
  };

  useEffect(() => { loadMatrix(); }, []);

  return (
    <div className="h-full flex flex-col">
      <header className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
        <h1 className="text-xl font-bold">Matriz de Síntesis</h1>
        <button onClick={loadMatrix} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 disabled:opacity-50" disabled={loading}>{loading ? "Calculando..." : "Reconstruir matriz"}</button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {!matrix ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><p>Haz clic en "Reconstruir matriz" para generar la vista</p></div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-background z-10">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground border-b border-border">Fuente</th>
                  {matrix.columns.map((col: any) => (
                    <th key={col.id} className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground border-b border-border w-20">{col.name}</th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground border-b border-border w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row: any) => {
                  const rowCells = matrix.cells.filter((c: any) => c.rowId === row.id);
                  const rowTotal = rowCells.reduce((sum: number, c: any) => sum + c.itemCount, 0);
                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-3 text-left text-sm font-medium truncate max-w-[200px]"><span className="font-mono text-xs text-muted-foreground mr-2">{row.citekey}</span>{row.title}</td>
                      {matrix.columns.map((col: any) => {
                        const cell = rowCells.find((c: any) => c.columnTagId === col.id);
                        return (
                          <td key={col.id} className="px-3 py-3 text-right text-sm border-b border-border/50">
                            {cell?.itemCount > 0 ? <span className="font-bold text-lg">{cell.itemCount}</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-right text-sm font-semibold border-b border-border/50">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
