import "./ui/style.css";
import sampleUrl from "./assets/sample.jpg";
import SolverWorker from "./worker/solver.worker.ts?worker";
import { QUALITY_SIZE, type FromWorker, type Mode, type Quality, type Shape, type SolverSettings, type ToWorker, type ValueKey } from "./core/types.ts";
import { inksFor } from "./core/image.ts";
import { makePegs } from "./core/pegs.ts";
import { SegmentStore, ThreadRenderer, drawOverlay, type Look } from "./render/canvas.ts";
import { drawOriginal, drawValueStudy, renderValueScale } from "./render/valueStudy.ts";
import { toSvg } from "./export/svg.ts";
import { toInstructions } from "./export/instructions.ts";
import { byId, checked, debounce, download, num, onRadio, onRange, radio, wireNotes } from "./ui/controls.ts";

const artCanvas = byId<HTMLCanvasElement>("art");
const refCanvas = byId<HTMLCanvasElement>("reference");
const overlay = byId<HTMLCanvasElement>("overlay");
const drop = byId<HTMLDivElement>("drop");

const renderer = new ThreadRenderer(artCanvas);
const store = new SegmentStore();
const worker = new SolverWorker();

let source: ImageBitmap | null = null;
let working: ImageData | null = null;
let look: Look | null = null;
let gen = 0;
let current: Int32Array | null = null;
let computeMs = 0;
let frameRequested = false;

function solverSettings(): SolverSettings {
  return {
    shape: radio("shape") as Shape,
    pegs: num("pegs"),
    quality: radio("quality") as Quality,
    mode: radio("mode") as Mode,
    dark: checked("dark"),
    opacity: num("opacity"),
    maxSegments: num("segments"),
    key: radio("key") as ValueKey,
    contrast: num("contrast"),
    steps: num("steps"),
  };
}

/** Resizes the source so its longest side matches the quality setting. */
function makeWorking(bitmap: ImageBitmap, quality: Quality): ImageData {
  const side = QUALITY_SIZE[quality];
  const scale = side / Math.max(bitmap.width, bitmap.height);
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function send(msg: ToWorker, transfer: Transferable[] = []): void {
  worker.postMessage(msg, transfer);
}

/** Starts a new solve from scratch: image, frame, tone or thread model changed. */
function restart(): void {
  if (source === null) return;
  const s = solverSettings();
  working = makeWorking(source, s.quality);
  gen++;
  store.clear();
  current = null;
  computeMs = 0;
  const pegs = makePegs(s.shape, s.pegs, working.width, working.height);
  look = {
    width: working.width,
    height: working.height,
    pegsX: pegs.x,
    pegsY: pegs.y,
    inks: inksFor(s.mode, s.dark),
    dark: s.dark,
    opacity: s.opacity,
    thickness: num("thickness"),
  };
  renderer.setLook(look);
  refreshReference();
  renderValueScale(byId("valueScale"), working, s);
  byId("statPegs").textContent = String(s.pegs);
  setStats(null);
  setProgress(0, false);
  const pixels = working.data.slice();
  send({ type: "start", gen, width: working.width, height: working.height, pixels, settings: s }, [pixels.buffer]);
  requestDraw();
}

const restartSoon = debounce(restart, 120);

function refreshReference(): void {
  if (working === null) return;
  const view = radio("view");
  if (view === "study") drawValueStudy(refCanvas, working, solverSettings());
  else if (view === "original") drawOriginal(refCanvas, working);
  artCanvas.hidden = view !== "art";
  refCanvas.hidden = view === "art";
}

function requestDraw(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    if (look === null) return;
    renderer.drawUpTo(store, num("segments"));
    drawOverlay(overlay, look, renderer.scaleFactor, checked("showPegs"), checked("showIndicators"), current);
    const shown = Math.min(store.length, num("segments"));
    byId("statSegments").textContent = shown.toLocaleString();
  });
}

function setStats(stats: { average: number; meanSquare: number; variance: number } | null): void {
  byId("statAvg").textContent = stats ? stats.average.toFixed(4) : "-";
  byId("statMse").textContent = stats ? stats.meanSquare.toFixed(5) : "-";
  byId("statVar").textContent = stats ? stats.variance.toFixed(5) : "-";
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.gen !== gen) return;
  if (msg.type === "ready") return;
  store.push(msg.thread, msg.from, msg.to);
  current = msg.current;
  computeMs = msg.elapsedMs;
  if (msg.stats !== null) setStats(msg.stats);
  const speed = computeMs > 0 ? Math.round((store.length / computeMs) * 1000) : 0;
  byId("statSpeed").textContent = `${speed.toLocaleString()} seg/s`;
  setProgress(msg.idle ? 1 : store.length / num("segments"), msg.idle);
  requestDraw();
};

/** Thin bar under the toolbar while the solver works; fades out when it stops. */
function setProgress(share: number, done: boolean): void {
  const bar = byId("progress");
  bar.style.width = `${Math.min(100, share * 100)}%`;
  bar.classList.toggle("done", done);
}

/** Display only: the thread path stays, the drawing is repainted. */
function restyle(): void {
  if (look === null) return;
  look = { ...look, thickness: num("thickness") };
  renderer.setLook(look);
  requestDraw();
}

async function loadBlob(blob: Blob): Promise<void> {
  try {
    source = await createImageBitmap(blob);
    restart();
  } catch {
    byId("note").textContent = "That file could not be read as an image.";
  }
}

async function loadSample(): Promise<void> {
  const res = await fetch(sampleUrl);
  await loadBlob(await res.blob());
}

// Solver inputs.
for (const name of ["shape", "quality", "mode", "key"]) onRadio(name, restart);
byId("dark").addEventListener("change", restart);
byId("steps").addEventListener("change", restart);
onRange("pegs", restartSoon);
onRange("opacity", restartSoon, (v) => v.toFixed(2));
onRange("contrast", restartSoon, (v) => v.toFixed(2));

// Segments: lower shows a prefix of the same path, higher lets the solver continue.
onRange("segments", () => {
  send({ type: "setMax", gen, max: num("segments") });
  if (store.length < num("segments")) setProgress(store.length / num("segments"), false);
  requestDraw();
}, (v) => v.toLocaleString());

// Display only.
onRange("thickness", restyle, (v) => v.toFixed(2));
onRange("blur", () => {
  const v = num("blur");
  artCanvas.style.filter = refCanvas.style.filter = v > 0 ? `blur(${v}px)` : "";
}, (v) => `${v}px`);
onRadio("view", refreshReference);
byId("showPegs").addEventListener("change", requestDraw);
byId("showIndicators").addEventListener("change", requestDraw);

// Picture input.
byId<HTMLInputElement>("file").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void loadBlob(file);
});
byId("sample").addEventListener("click", () => void loadSample());
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("dragging");
});
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragging");
  const file = e.dataTransfer?.files[0];
  if (file) void loadBlob(file);
});

// Output.
byId("downloadSvg").addEventListener("click", () => {
  if (look !== null) download("threading.svg", toSvg(store, look, num("segments")), "image/svg+xml");
});
byId("downloadText").addEventListener("click", () => {
  if (look !== null) {
    download("threading-guide.txt", toInstructions(store, look, num("segments"), radio("shape") as Shape), "text/plain");
  }
});

wireNotes(document.body, byId("note"));
void loadSample();
