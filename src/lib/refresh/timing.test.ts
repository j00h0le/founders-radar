import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCountAnimator, createElapsedTimer, formatElapsed } from "@/lib/refresh/timing";

function clock() {
  let now = 0;
  const frames: Array<(() => void) | null> = [];
  return {
    now: () => now,
    set(value: number) {
      now = value;
    },
    requestFrame(callback: () => void) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame(handle: number) {
      frames[handle - 1] = null;
    },
    frames,
  };
}

describe("elapsed timer", () => {
  it("starts at zero and advances with the monotonic clock", () => {
    const time = clock();
    const samples: number[] = [];
    const timer = createElapsedTimer({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
      onChange: (elapsed) => samples.push(elapsed),
    });
    timer.start();
    assert.equal(timer.isRunning(), true);
    assert.deepEqual(samples, [0]);
    time.set(420);
    time.frames[0]?.();
    assert.equal(timer.read(), 420);
    assert.equal(formatElapsed(timer.read()), "00:00.42");
  });

  it("stops on success and does not keep counting", () => {
    const time = clock();
    const timer = createElapsedTimer({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
    });
    timer.start();
    time.set(1740);
    assert.equal(timer.stop(), 1740);
    assert.equal(timer.isRunning(), false);
    assert.equal(formatElapsed(1740), "00:01.74");
    time.set(9000);
    time.frames[0]?.();
    assert.equal(timer.read(), 1740);
  });

  it("stops on failure", () => {
    const time = clock();
    const timer = createElapsedTimer({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
    });
    timer.start();
    time.set(800);
    assert.equal(timer.stop(), 800);
    assert.equal(timer.isRunning(), false);
  });

  it("cleans up the scheduled frame", () => {
    const time = clock();
    const timer = createElapsedTimer({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
    });
    timer.start();
    timer.stop();
    assert.equal(time.frames[0], null);
    time.set(5000);
    assert.equal(timer.read(), 0);
  });
});

describe("count animation", () => {
  it("moves toward the known value and never past it", () => {
    const time = clock();
    const samples: number[] = [];
    const animator = createCountAnimator({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
      onChange: (value) => samples.push(value),
    });
    animator.to(100, false);
    time.set(10_000);
    time.frames[0]?.();
    assert.equal(samples.at(-1), 100);
    assert.ok(samples.every((value) => value <= 100));
    assert.equal(animator.isRunning(), false);
  });

  it("stops when the refresh ends", () => {
    const time = clock();
    const animator = createCountAnimator({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
      onChange: () => {},
    });
    animator.to(500, false);
    animator.stop();
    assert.equal(animator.isRunning(), false);
    assert.equal(time.frames[0], null);
    assert.equal(animator.current(), 0);
  });

  it("jumps to the real value when reduced motion is requested", () => {
    const time = clock();
    let shown = 0;
    const animator = createCountAnimator({
      now: time.now,
      requestFrame: time.requestFrame,
      cancelFrame: time.cancelFrame,
      onChange: (value) => {
        shown = value;
      },
    });
    animator.to(1707, true);
    assert.equal(shown, 1707);
    assert.equal(animator.isRunning(), false);
    assert.equal(time.frames.length, 0);
  });
});
