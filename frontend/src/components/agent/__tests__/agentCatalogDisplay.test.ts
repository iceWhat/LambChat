import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAgentDescription,
  resolveAgentDisplayName,
} from "../agentCatalog";

const t = (key: string) => `i18n:${key}`;

const agent = {
  id: "search",
  name: "agents.search.name",
  description: "agents.search.description",
  labels: {
    zh: {
      name: "搜索助手",
      description: "面向检索和复杂任务",
    },
    en: {
      name: "Research Agent",
      description: "For research and complex tasks",
    },
  },
};

test("resolves agent display metadata from the current locale", () => {
  assert.equal(resolveAgentDisplayName(agent, "zh-CN", t), "搜索助手");
  assert.equal(
    resolveAgentDescription(agent, "zh-CN", t),
    "面向检索和复杂任务",
  );
});

test("falls back through configured languages before legacy i18n keys", () => {
  assert.equal(resolveAgentDisplayName(agent, "ja", t), "搜索助手");
  assert.equal(
    resolveAgentDescription({ ...agent, labels: {} }, "ja", t),
    "i18n:agents.search.description",
  );
});
