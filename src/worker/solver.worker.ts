/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from "../core/types.ts";
import { buildTargets, type Targets } from "../core/image.ts";
import { frameMask, makePegs } from "../core/pegs.ts";
import { Solver } from "../core/solver.ts";
import { computeStats } from "../core/stats.ts";

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Time slice per batch: short enough to stay responsive and stream smoothly. */
const SLICE_MS = 14;
const STATS_EVERY_MS = 200;
const BATCH_CAPACITY = 1 << 15;

let gen = -1;
let solver: Solver | null = null;
let targets: Targets | null = null;
let mask: Uint8Array | null = null;
let max = 0;
let done = 0;
let exhausted = false;
let running = false;
let elapsed = 0;
let lastStats = 0;

// Zero delay scheduling: setTimeout is clamped to 4 ms after a few nested calls.
const channel = new MessageChannel();
channel.port1.onmessage = () => run();
const schedule = () => channel.port2.postMessage(0);

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "start") {
    const t0 = performance.now();
    gen = msg.gen;
    const s = msg.settings;
    const pegs = makePegs(s.shape, s.pegs, msg.width, msg.height);
    targets = buildTargets(msg.pixels, msg.width, msg.height, s);
    mask = frameMask(s.shape, msg.width, msg.height);
    solver = new Solver(msg.width, pegs, targets);
    max = s.maxSegments;
    done = 0;
    exhausted = false;
    elapsed = 0;
    lastStats = 0;
    post({
      type: "ready", gen, pegsX: pegs.x, pegsY: pegs.y,
      threads: solver.threads, cached: solver.cached, setupMs: performance.now() - t0,
    });
    if (!running) {
      running = true;
      schedule();
    }
  } else if (msg.type === "setMax") {
    if (msg.gen !== gen) return;
    max = msg.max;
    if (!running && !exhausted && done < max) {
      running = true;
      schedule();
    }
  } else {
    gen = -1;
    solver = null;
  }
};

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(msg, transfer);
}

function run(): void {
  const s = solver;
  if (s === null || targets === null || mask === null) {
    running = false;
    return;
  }
  const t0 = performance.now();
  const limit = Math.min(max - done, BATCH_CAPACITY);
  const thread = new Uint8Array(Math.max(0, limit));
  const from = new Uint16Array(thread.length);
  const to = new Uint16Array(thread.length);
  let k = 0;
  while (k < limit) {
    if (!s.step()) {
      exhausted = true;
      break;
    }
    thread[k] = s.lastThread;
    from[k] = s.lastFrom;
    to[k] = s.lastTo;
    k++;
    if ((k & 15) === 0 && performance.now() - t0 > SLICE_MS) break;
  }
  done += k;
  const now = performance.now();
  elapsed += now - t0;
  const idle = exhausted || done >= max;
  let stats = null;
  if (idle || now - lastStats > STATS_EVERY_MS) {
    stats = computeStats(targets, mask);
    lastStats = performance.now();
  }
  const th = thread.slice(0, k);
  const fr = from.slice(0, k);
  const tt = to.slice(0, k);
  post(
    {
      type: "segments", gen, thread: th, from: fr, to: tt,
      current: s.current.slice(), stats, idle, exhausted, elapsedMs: elapsed,
    },
    [th.buffer, fr.buffer, tt.buffer],
  );
  if (idle) running = false;
  else schedule();
}
