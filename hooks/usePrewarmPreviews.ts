"use client";

import { useEffect } from "react";
import { videoPreviewProxy } from "@/lib/img";

// Pre-genera los clips de preview en el servidor apenas carga la página, para
// que al hacer hover ya estén listos (instantáneo). Solo trae 1 byte al cliente
// (el clip se genera y cachea del lado servidor). Se saltea si el navegador
// pide ahorro de datos.
export function usePrewarmPreviews(
  videoUrls: Array<string | null | undefined>,
  max = 12,
  concurrency = 3
) {
  useEffect(() => {
    const conn: any = (navigator as any).connection;
    if (conn?.saveData) return; // respetar "ahorro de datos"

    const urls = videoUrls
      .filter((u): u is string => !!u)
      .slice(0, max)
      .map((u) => videoPreviewProxy(u))
      .filter((u): u is string => !!u);

    let i = 0;
    let active = 0;
    let cancelled = false;
    const controllers: AbortController[] = [];

    function next() {
      if (cancelled) return;
      while (active < concurrency && i < urls.length) {
        const url = urls[i++];
        active++;
        const ac = new AbortController();
        controllers.push(ac);
        // Range 0-1: dispara la generación server-side, casi sin datos al cliente.
        fetch(url, { headers: { Range: "bytes=0-1" }, signal: ac.signal })
          .catch(() => {})
          .finally(() => {
            active--;
            next();
          });
      }
    }
    next();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [videoUrls, max, concurrency]);
}
