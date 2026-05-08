import assert from "node:assert/strict";
import test from "node:test";
import { getUserMessageActionButtonVisibilityClass } from "../UserMessageBubble";

test("keeps user message action buttons visible for the latest message", () => {
  const className = getUserMessageActionButtonVisibilityClass(true);

  assert.equal(className.includes("opacity-0"), false);
  assert.equal(className.includes("group-hover:opacity-100"), false);
});

test("hides older user message action buttons until hover", () => {
  const className = getUserMessageActionButtonVisibilityClass(false);

  assert.equal(className.includes("opacity-0"), true);
  assert.equal(className.includes("group-hover:opacity-100"), true);
});
