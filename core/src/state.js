"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * JSON state in <userData>/state.json, written atomically and debounced.
 * Corrupt or missing state starts empty.
 */
function createStateStore(file, logger, { delayMs = 500 } = {}) {
  let data = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed;
  } catch (error) {
    if (error.code !== "ENOENT") logger.warn("[STATE] Ignoring unreadable state file", { code: error.code ?? "parse" });
  }
  let timer = null;

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (error) {
      logger.warn("[STATE] Could not save state", { code: error.code });
    }
  };

  return {
    get: (key) => data[key],
    set(key, value) {
      data[key] = value;
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}

module.exports = { createStateStore };
