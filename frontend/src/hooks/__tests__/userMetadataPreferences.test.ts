import assert from "node:assert/strict";
import test from "node:test";
import { applyUserMetadataPreferences } from "../userMetadataPreferences.ts";

class LocalStorageMock {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

test("applies all persisted user metadata preferences to local storage and events", () => {
  const localStorage = new LocalStorageMock();
  const events: { type: string; detail: unknown }[] = [];
  const languages: string[] = [];

  applyUserMetadataPreferences({
    metadata: {
      language: "zh",
      theme: "dark",
      newlineModifier: "ctrl",
      defaultThinkingLevel: "high",
      sidebarCollapsed: "true",
      defaultModelId: "model-config-id",
      defaultModel: "openai/gpt-4.1",
    },
    localStorage,
    changeLanguage: (language) => {
      languages.push(language);
    },
    dispatchEvent: (event) => {
      events.push({ type: event.type, detail: event.detail });
    },
  });

  assert.equal(localStorage.getItem("language"), "zh");
  assert.equal(localStorage.getItem("lamb-agent-theme"), "dark");
  assert.equal(localStorage.getItem("newlineModifier"), "ctrl");
  assert.equal(localStorage.getItem("defaultThinkingLevel"), "high");
  assert.equal(localStorage.getItem("lamb-sidebar-collapsed"), "true");
  assert.equal(localStorage.getItem("defaultModelId"), "model-config-id");
  assert.equal(localStorage.getItem("defaultModel"), "openai/gpt-4.1");
  assert.deepEqual(languages, ["zh"]);
  assert.deepEqual(events, [
    { type: "theme:external-change", detail: "dark" },
    { type: "thinking-preference-updated", detail: "high" },
    { type: "sidebar-collapsed-changed", detail: true },
    {
      type: "model-preference-updated",
      detail: {
        modelId: "model-config-id",
        modelValue: "openai/gpt-4.1",
      },
    },
  ]);
});
