export function formatElapsed(ms: number) {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const centiseconds = Math.floor((clamped % 1_000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

type FrameHandle = number;

export function createElapsedTimer(options: {
  now: () => number;
  requestFrame: (callback: () => void) => FrameHandle;
  cancelFrame: (handle: FrameHandle) => void;
  onChange?: (elapsedMs: number) => void;
}) {
  let handle: FrameHandle | null = null;
  let start = 0;
  let elapsed = 0;
  let running = false;

  const tick = () => {
    if (!running) return;
    elapsed = options.now() - start;
    options.onChange?.(elapsed);
    handle = options.requestFrame(tick);
  };

  return {
    isRunning() {
      return running;
    },
    read() {
      return elapsed;
    },
    start() {
      if (running) return;
      running = true;
      start = options.now();
      elapsed = 0;
      options.onChange?.(0);
      handle = options.requestFrame(tick);
    },
    stop() {
      if (!running) return elapsed;
      running = false;
      if (handle !== null) options.cancelFrame(handle);
      handle = null;
      elapsed = options.now() - start;
      return elapsed;
    },
  };
}

export function createCountAnimator(options: {
  now: () => number;
  requestFrame: (callback: () => void) => FrameHandle;
  cancelFrame: (handle: FrameHandle) => void;
  onChange: (value: number) => void;
}) {
  let handle: FrameHandle | null = null;
  let current = 0;
  let running = false;

  const cancel = () => {
    if (handle !== null) options.cancelFrame(handle);
    handle = null;
    running = false;
  };

  return {
    current() {
      return current;
    },
    isRunning() {
      return running;
    },
    to(target: number, reducedMotion: boolean) {
      cancel();
      if (reducedMotion || target === current) {
        current = target;
        options.onChange(current);
        return;
      }
      const from = current;
      const delta = target - from;
      const duration = Math.min(600, Math.max(160, Math.abs(delta) * 0.35));
      const started = options.now();
      running = true;
      const tick = () => {
        const progress = Math.min(1, (options.now() - started) / duration);
        const eased = 1 - (1 - progress) ** 3;
        const next = Math.round(from + delta * eased);
        const clamped = delta > 0 ? Math.min(next, target) : Math.max(next, target);
        current = clamped;
        options.onChange(current);
        if (progress < 1) {
          handle = options.requestFrame(tick);
          return;
        }
        running = false;
        current = target;
        options.onChange(target);
      };
      handle = options.requestFrame(tick);
    },
    stop() {
      cancel();
    },
  };
}
