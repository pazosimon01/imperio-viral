// Reproduce un <video> intentando CON sonido. Los navegadores bloquean el
// autoplay con audio hasta que hubo una interacción del usuario en la página;
// si está bloqueado, cae a mudo (y al siguiente hover, tras cualquier clic, ya
// suena). Devuelve true si quedó reproduciendo con sonido.
export async function playWithSound(v: HTMLVideoElement): Promise<boolean> {
  try {
    v.currentTime = 0;
  } catch {}
  v.muted = false;
  v.volume = 0.85;
  try {
    await v.play();
    return !v.muted;
  } catch {
    v.muted = true;
    try {
      await v.play();
    } catch {}
    return false;
  }
}
