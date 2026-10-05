/** Small typed helpers over the static controls in index.html. */

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function radio(name: string): string {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
  return el === null ? "" : el.value;
}

export function onRadio(name: string, handler: () => void): void {
  for (const el of document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
    el.addEventListener("change", handler);
  }
}

export function num(id: string): number {
  return Number(byId<HTMLInputElement | HTMLSelectElement>(id).value);
}

export function checked(id: string): boolean {
  return byId<HTMLInputElement>(id).checked;
}

/** Keeps a range's <output> in sync and calls `handler` on every change. */
export function onRange(id: string, handler: () => void, format: (v: number) => string = String): void {
  const input = byId<HTMLInputElement>(id);
  const out = document.querySelector<HTMLOutputElement>(`output[for="${id}"]`);
  const sync = () => {
    if (out !== null) out.value = format(Number(input.value));
  };
  sync();
  input.addEventListener("input", () => {
    sync();
    handler();
  });
}

/** Shows the art note of whatever control is hovered or focused. */
export function wireNotes(panel: HTMLElement, target: HTMLElement): void {
  const show = (e: Event) => {
    const host = (e.target as HTMLElement).closest<HTMLElement>("[data-note]");
    if (host !== null) target.textContent = host.dataset.note ?? "";
  };
  panel.addEventListener("pointerover", show);
  panel.addEventListener("focusin", show);
  for (const el of panel.querySelectorAll<HTMLElement>("[data-note]")) el.title = el.dataset.note ?? "";
}

export function debounce(fn: () => void, ms: number): () => void {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = window.setTimeout(fn, ms);
  };
}

export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
