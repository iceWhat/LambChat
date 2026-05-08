import test from "node:test";
import assert from "node:assert/strict";
import { resetMobileViewport } from "../mobile.ts";

test("resetMobileViewport preserves the current page scroll position", async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;
  const scrollCalls: Array<[number, number]> = [];
  const viewportAttributes = new Map<string, string>([
    ["content", "width=device-width, initial-scale=1, maximum-scale=1"],
  ]);

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      scrollX: 14,
      scrollY: 320,
      scrollTo: (x: number, y: number) => {
        scrollCalls.push([x, y]);
      },
      setTimeout,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelector: (selector: string) =>
        selector === 'meta[name="viewport"]'
          ? {
              getAttribute: (name: string) => viewportAttributes.get(name),
              setAttribute: (name: string, value: string) => {
                viewportAttributes.set(name, value);
              },
            }
          : null,
    },
  });

  try {
    resetMobileViewport();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(
      scrollCalls.some(([x, y]) => x === 0 && y === 0),
      false,
    );
    assert.deepEqual(scrollCalls[scrollCalls.length - 1], [14, 320]);
    assert.equal(
      viewportAttributes.get("content"),
      "width=device-width, initial-scale=1, maximum-scale=1",
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});
