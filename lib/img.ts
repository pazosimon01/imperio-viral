// Transforma una URL de Instagram CDN en una URL del proxy local.
// Otras URLs (no IG) se devuelven tal cual.
export function imgProxy(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
}

// Igual que imgProxy pero para videos (endpoint con soporte de Range/streaming).
// Necesario porque el navegador bloquea los MP4 de IG cargados directo
// (Cross-Origin-Resource-Policy).
export function videoProxy(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) return url;
  return `/api/video?url=${encodeURIComponent(url)}`;
}

// Clip de preview LIVIANO (360p, 6s, ~150KB) generado con ffmpeg. Para los
// previews en hover: carga casi instantáneo incluso con datos en el iPhone.
export function videoPreviewProxy(
  url: string | null | undefined
): string | undefined {
  if (!url) return undefined;
  if (!/cdninstagram\.com|fbcdn\.net/i.test(url)) return url;
  return `/api/preview?url=${encodeURIComponent(url)}`;
}
