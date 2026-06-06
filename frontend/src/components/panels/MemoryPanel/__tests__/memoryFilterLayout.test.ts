import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filterSource = readFileSync(
  new URL("../MemoryFilter.tsx", import.meta.url),
  "utf8",
);
const componentsCss = readFileSync(
  new URL("../../../../styles/components.css", import.meta.url),
  "utf8",
);
const skillsListSource = readFileSync(
  new URL("../../SkillsPanel/SkillsList.tsx", import.meta.url),
  "utf8",
);
const marketplaceSource = readFileSync(
  new URL("../../MarketplacePanel.tsx", import.meta.url),
  "utf8",
);

test("memory filter trigger uses shared stable panel filter sizing", () => {
  assert.match(filterSource, /data-filter-menu/);
  assert.doesNotMatch(filterSource, /className="panel-search[^"]*h-10/);
  assert.match(filterSource, /panel-filter-trigger/);
  assert.match(filterSource, /panel-filter-trigger__label/);
  assert.match(filterSource, /panel-filter-menu/);
  assert.match(filterSource, /aria-haspopup="menu"/);
  assert.match(filterSource, /aria-expanded=\{open\}/);
  assert.match(filterSource, /role="menu"/);
  assert.match(filterSource, /aria-pressed=\{typeValue === opt\.value\}/);
  assert.match(filterSource, /aria-pressed=\{sourceValue === opt\.value\}/);

  assert.match(
    componentsCss,
    /\.panel-filter-trigger\s*\{[\s\S]*?height:\s*2\.5rem;[\s\S]*?max-width:\s*min\(13rem,\s*42vw\);[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    componentsCss,
    /\.panel-filter-trigger__label\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;/,
  );
  assert.match(
    componentsCss,
    /\.panel-filter-menu\s*\{[\s\S]*?max-height:\s*min\(22rem,\s*calc\(100dvh - 8rem\)\);[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu-accessory \[data-filter-menu\] \.panel-filter-menu\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-height:\s*min\(46dvh,\s*18rem\);/,
  );
});

test("tag filter dropdowns opt into stable mobile filter-menu behavior", () => {
  assert.match(skillsListSource, /data-filter-menu/);
  assert.match(skillsListSource, /panel-filter-trigger/);
  assert.match(skillsListSource, /panel-filter-menu/);
  assert.match(skillsListSource, /aria-haspopup="menu"/);
  assert.match(skillsListSource, /aria-expanded=\{isFilterOpen\}/);
  assert.match(
    skillsListSource,
    /aria-pressed=\{selectedTags\.includes\(tag\)\}/,
  );
  assert.match(marketplaceSource, /data-filter-menu/);
  assert.match(marketplaceSource, /panel-filter-trigger/);
  assert.match(marketplaceSource, /panel-filter-menu/);
  assert.match(marketplaceSource, /aria-haspopup="menu"/);
  assert.match(marketplaceSource, /aria-expanded=\{isFilterOpen\}/);
  assert.match(
    marketplaceSource,
    /aria-pressed=\{selectedTags\.includes\(tag\)\}/,
  );
  assert.match(
    componentsCss,
    /\.panel-header__mobile-menu \.skill-filter-dropdown\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?max-height:\s*min\(46dvh,\s*18rem\);/,
  );
});
