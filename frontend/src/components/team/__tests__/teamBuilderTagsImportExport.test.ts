import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrapperSource = readFileSync(
  new URL("../TeamBuilderWrapper.tsx", import.meta.url),
  "utf8",
);
const builderSource = readFileSync(
  new URL("../TeamBuilder.tsx", import.meta.url),
  "utf8",
);

test("team builder list exposes search, tag filter, import, and export controls", () => {
  assert.match(wrapperSource, /searchValue=\{query\}/);
  assert.match(wrapperSource, /searchAccessory=/);
  assert.match(wrapperSource, /PersonaTagFilterDropdown/);
  assert.match(wrapperSource, /handleExport/);
  assert.match(wrapperSource, /handleImportFile/);
  assert.match(wrapperSource, /Download/);
  assert.match(wrapperSource, /Upload/);
});

test("team editor persists team tags", () => {
  assert.match(builderSource, /teamTagsInput/);
  assert.match(builderSource, /inputToTags\(teamTagsInput\)/);
  assert.match(builderSource, /tagsToInput\(team\.tags\)/);
});

test("team editor persists member model overrides", () => {
  assert.match(builderSource, /model_id:\s*null/);
  assert.match(builderSource, /model_id:\s*m\.model_id \?\? null/);
  assert.match(builderSource, /handleModelChange/);
  assert.match(builderSource, /modelApi\s*\.\s*listAvailable\(\)/);
  assert.match(builderSource, /useOptionalSettingsContext/);
  assert.match(wrapperSource, /record\.model_id/);
  assert.match(wrapperSource, /model_id:\s*[\s\S]*record\.model_id[\s\S]*:\s*null/);
});

test("team editor persists member agent mode overrides", () => {
  assert.match(builderSource, /agent_id:\s*null/);
  assert.match(builderSource, /agent_id:\s*m\.agent_id \?\? null/);
  assert.match(builderSource, /handleAgentChange/);
  assert.match(builderSource, /agentApi\s*\.\s*list\(\)/);
  assert.match(wrapperSource, /record\.agent_id/);
  assert.match(wrapperSource, /agent_id:\s*[\s\S]*record\.agent_id[\s\S]*:\s*null/);
});
