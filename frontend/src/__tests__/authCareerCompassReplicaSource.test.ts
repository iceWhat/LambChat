import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function readSource(path: string): string {
  return readFileSync(resolve(import.meta.dirname, path), "utf8");
}

test("login page carries the LambChat-inspired compact auth layout markers", () => {
  const authPage = readSource("../components/auth/AuthPage.tsx");
  const authStyles = readSource("../styles/auth.css");

  assert.match(authPage, /auth-lamb-shell/);
  assert.match(authPage, /auth-form-surface/);
  assert.match(authPage, /auth\.welcomeBack/);
  assert.match(authPage, /auth\.loginHint/);
  assert.match(authPage, /auth-forgot-row/);
  assert.match(authPage, /auth-social-provider/);
  assert.match(authPage, /auth-illustration-panel/);
  assert.match(authPage, /auth-character-stage/);
  assert.match(authPage, /auth-mobile-spirit/);
  assert.match(authPage, /handleGlobalCharacterPointerMove/);
  assert.match(authPage, /window\.addEventListener\("pointermove"/);
  assert.match(authPage, /auth-lamb-feature-chip/);
  assert.match(authPage, /auth-character-mouth/);
  assert.doesNotMatch(authPage, /auth-login-kicker/);
  assert.doesNotMatch(authPage, /Agent workspace/);
  assert.match(authPage, /auth-field-group/);
  assert.match(authPage, /auth-submit-label/);
  assert.match(authPage, /prefers-reduced-motion: reduce/);

  assert.match(authStyles, /\.auth-lamb-shell/);
  assert.match(authStyles, /\.auth-form-surface/);
  assert.match(authStyles, /\.auth-lamb-pattern/);
  assert.match(authStyles, /\.auth-forgot-row/);
  assert.match(authStyles, /\.auth-social-provider/);
  assert.match(authStyles, /\.auth-illustration-panel/);
  assert.match(authStyles, /\.auth-character-stage/);
  assert.match(authStyles, /\.auth-mobile-spirit/);
  assert.match(authStyles, /background: transparent !important/);
  assert.match(authStyles, /--eye-x/);
  assert.match(authStyles, /--pupil-x/);
  assert.match(authStyles, /--mouth-x/);
  assert.match(authStyles, /--auth-accent/);
  assert.match(authStyles, /--auth-character-tall/);
  assert.match(authStyles, /--auth-character-glow/);
  assert.match(authStyles, /--auth-character-aura/);
  assert.match(authStyles, /\.auth-lamb-feature-chip/);
  assert.doesNotMatch(authStyles, /\.auth-login-kicker/);
  assert.match(authStyles, /\.auth-field-group/);
  assert.match(authStyles, /\.auth-submit-label/);
  assert.match(authStyles, /\.auth-character-antenna/);
  assert.match(authStyles, /\.auth-character-cheek/);
  assert.match(authStyles, /--auth-character-smile/);
  assert.match(authStyles, /auth-character-blink/);
  assert.match(authStyles, /\.auth-character-purple \.auth-character-mouth/);
  assert.match(authStyles, /html\.dark \.auth-character-stage::before/);
  assert.match(
    authStyles,
    /@media \(min-width: 640px\) and \(max-width: 1023px\)/,
  );
  assert.match(authStyles, /@media \(max-width: 1023px\)/);
  assert.match(authStyles, /@media \(max-width: 480px\)/);
});
