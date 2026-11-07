"use strict";

// Preferences changed from the tray/app menus at runtime. Stored per profile in
// state.json ("prefs"), separate from config.json, which stays user-edited.

const THEMES = Object.freeze(["system", "light", "dark"]);
const DEFAULTS = Object.freeze({
  theme: "system",
  notificationsDisabled: false,
  soundDisabled: false,
  badgeDisabled: false,
  appIcon: null,
});

function sanitize(raw) {
  const p = { ...DEFAULTS };
  if (!raw || typeof raw !== "object") return p;
  if (THEMES.includes(raw.theme)) p.theme = raw.theme;
  for (const key of ["notificationsDisabled", "soundDisabled", "badgeDisabled"]) {
    if (typeof raw[key] === "boolean") p[key] = raw[key];
  }
  if (typeof raw.appIcon === "string" && raw.appIcon.startsWith("/")) p.appIcon = raw.appIcon;
  return p;
}

/** @param {{ get: Function, set: Function }} state */
function createPrefs(state) {
  let current = sanitize(state.get("prefs"));
  const listeners = new Set();
  return {
    get: (key) => current[key],
    all: () => ({ ...current }),
    set(key, value) {
      if (!(key in DEFAULTS)) throw new Error(`Unknown preference ${key}`);
      const next = sanitize({ ...current, [key]: value });
      if (next[key] === current[key]) return;
      current = next;
      state.set("prefs", current);
      for (const listener of listeners) listener(key, current[key]);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

module.exports = { createPrefs, sanitize, THEMES, DEFAULTS };
