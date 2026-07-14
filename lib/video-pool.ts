const MAX_ACTIVE = 1;
const active: HTMLVideoElement[] = [];

function release(v: HTMLVideoElement) {
  v.pause();
  v.removeAttribute("src");
  v.load();
}

export function videoPoolRegister(v: HTMLVideoElement) {
  const idx = active.indexOf(v);
  if (idx !== -1) active.splice(idx, 1);
  while (active.length >= MAX_ACTIVE) {
    const old = active.shift();
    if (old) release(old);
  }
  active.push(v);
}

export function videoPoolUnregister(v: HTMLVideoElement) {
  const idx = active.indexOf(v);
  if (idx !== -1) active.splice(idx, 1);
  release(v);
}
