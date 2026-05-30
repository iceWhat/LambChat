import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const welcomePageSource = readFileSync(
  new URL("../WelcomePage.tsx", import.meta.url),
  "utf8",
);
const chatViewSource = readFileSync(
  new URL("../../layout/AppContent/ChatView.tsx", import.meta.url),
  "utf8",
);

test("welcome page switches the plaza to teams when team agent is active", () => {
  assert.match(welcomePageSource, /currentAgent\?: string;/);
  assert.match(welcomePageSource, /selectedTeamId\?: string \| null;/);
  assert.match(
    welcomePageSource,
    /onSelectTeam\?: \(teamId: string \| null\) => void;/,
  );
  assert.match(welcomePageSource, /teamApi\s*\.\s*list\(0,\s*50\)/);
  assert.match(
    welcomePageSource,
    /const showTeamCards =[\s\S]*currentAgent === "team"/,
  );
  assert.match(welcomePageSource, /onClick=\{\(\) => navigate\("\/team"\)\}/);
  assert.match(
    welcomePageSource,
    /onClick=\{\(\) => handleTeamClick\(team\)\}/,
  );
  assert.match(
    welcomePageSource,
    /getWelcomeTeamCards\(teamCards,\s*selectedTeamId\)/,
  );
  assert.match(
    chatViewSource,
    /currentAgent=\{currentAgent\}[\s\S]*selectedTeamId=\{selectedTeamId\}[\s\S]*onSelectTeam=\{onSelectTeam\}/,
  );
});

test("welcome page only projects @ mentions to welcome cards before a role or team is selected", () => {
  assert.match(welcomePageSource, /const isAgentReady = !!currentAgent;/);
  assert.match(
    welcomePageSource,
    /const shouldProjectMentionsToWelcome =\s*isAgentReady &&\s*\(currentAgent === "team"\s*\?\s*!selectedTeamId\s*:\s*!selectedPersonaPresetId\);/,
  );
  assert.match(
    welcomePageSource,
    /onMentionQueryChange=\{\s*shouldProjectMentionsToWelcome\s*\?\s*handleMentionQueryChange\s*:\s*undefined\s*\}/,
  );
});

test("welcome page keeps change role and change team actions visible after selection", () => {
  assert.match(
    welcomePageSource,
    /const canChangePersona =\s*isAgentReady &&\s*currentAgent !== "team" &&\s*!!selectedPersonaPresetId &&\s*!!onClearPersonaPreset;/,
  );
  assert.match(
    welcomePageSource,
    /const canChangeTeam =\s*currentAgent === "team" && !!selectedTeamId && !!onSelectTeam;/,
  );
  assert.match(
    welcomePageSource,
    /const showSelectionActions = canChangePersona \|\| canChangeTeam;/,
  );
  assert.match(
    welcomePageSource,
    /\(showGallerySection\s*\|\|\s*showStarterPrompts\s*\|\|\s*showTeamStarterPrompts\s*\|\|\s*showSelectionActions\)/,
  );
  assert.match(welcomePageSource, /onSelectTeam\?\.\(null\)/);
  assert.match(welcomePageSource, /t\("team\.change", "更换团队"\)/);
});

test("welcome page uses the same skeleton count for role and team choices", () => {
  assert.match(
    welcomePageSource,
    /const teamSkeletonCount = getWelcomePersonaSkeletonCount\(\s*shouldShowTeamSkeletons,\s*displayTeamCards\.length,\s*\);/,
  );
  assert.doesNotMatch(
    welcomePageSource,
    /getWelcomePersonaSkeletonCount\(\s*shouldShowTeamSkeletons,\s*displayTeamCards\.length,\s*6,\s*\)/,
  );
});

test("welcome team plaza renders skeleton cards while teams are loading", () => {
  assert.match(
    welcomePageSource,
    /const personaSkeletonCount = getWelcomePersonaSkeletonCount\(\s*personaPresetsLoading,\s*displayCards\.length,\s*\);/,
  );
  assert.match(
    welcomePageSource,
    /\{showTeamCards &&\s*Array\.from\(\{ length: teamSkeletonCount \}\)/,
  );
  assert.match(
    welcomePageSource,
    /className="welcome-persona-card welcome-persona-skeleton/,
  );
});

test("welcome team plaza treats the first unresolved team request as loading", () => {
  assert.match(
    welcomePageSource,
    /const \[teamCardsLoaded, setTeamCardsLoaded\] = useState\(false\);/,
  );
  assert.match(welcomePageSource, /setTeamCardsLoaded\(false\);/);
  assert.match(welcomePageSource, /setTeamCardsLoaded\(true\);/);
  assert.match(
    welcomePageSource,
    /const shouldShowTeamSkeletons =\s*showTeamCards && \(teamCardsLoading \|\| !teamCardsLoaded\);/,
  );
});

test("welcome page does not treat an unresolved agent as persona mode", () => {
  assert.match(
    welcomePageSource,
    /const showPersonaCards =\s*isAgentReady &&\s*currentAgent !== "team" &&/,
  );
  assert.match(
    welcomePageSource,
    /const showStarterPrompts =\s*isAgentReady &&\s*currentAgent !== "team" &&/,
  );
});
