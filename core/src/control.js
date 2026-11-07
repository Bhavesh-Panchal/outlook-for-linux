"use strict";

// Remote control of a running app, in three ways that share one action list:
//   global shortcuts   "shortcuts.global": { "toggle": "Ctrl+Alt+O", "newMail": "Ctrl+Alt+M" }
//   command line       outlook-for-linux --action=toggle   (reaches the running instance)
//   D-Bus (opt-in)     busctl --user call io.github.ms365_for_linux.outlook_for_linux \
//                        /io/github/ms365_for_linux/outlook_for_linux io.github.ms365_for_linux.Control Run s toggle
// After teams-for-linux globalShortcuts/ and dbus/controlService.js (GPL-3.0-or-later).

const CONTROL_OPTIONS = Object.freeze({
  "shortcuts.global": {
    type: "object",
    default: {},
    describe: "System-wide shortcuts: action name to accelerator, e.g. {\"toggle\": \"Ctrl+Alt+O\"}. On Wayland the desktop asks once to allow them",
  },
  "dbus.enabled": { type: "boolean", default: false, describe: "Offer a D-Bus control interface on the session bus (Run, ListActions, GetUnreadCount, UnreadChanged)" },
});

const ACTION_RE = /^[a-zA-Z][a-zA-Z0-9-]{0,31}$/;

/** D-Bus names for a product id, e.g. outlook-for-linux. Pure. */
function dbusNames(productId) {
  const leaf = productId.replaceAll("-", "_");
  return {
    busName: `io.github.ms365_for_linux.${leaf}`,
    objectPath: `/io/github/ms365_for_linux/${leaf}`,
    interfaceName: "io.github.ms365_for_linux.Control",
  };
}

/** Action requested on a command line, or null. Pure. */
function actionFromArgv(argv) {
  for (const arg of argv) {
    if (typeof arg === "string" && arg.startsWith("--action=")) {
      const name = arg.slice("--action=".length);
      return ACTION_RE.test(name) ? name : null;
    }
  }
  return null;
}

/** Validate shortcuts.global against known actions. Pure. */
function shortcutBindings(config, actions) {
  const bindings = [];
  const problems = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) return { bindings, problems: ["shortcuts.global must be an object"] };
  for (const [action, accelerator] of Object.entries(config)) {
    if (!actions.has(action)) problems.push(`shortcuts.global: unknown action "${action}" (known: ${[...actions.keys()].join(", ")})`);
    else if (typeof accelerator !== "string" || accelerator.trim() === "") problems.push(`shortcuts.global.${action} must be an accelerator string`);
    else bindings.push({ action, accelerator: accelerator.trim() });
  }
  return { bindings, problems };
}

function createActions(ctx, { app, main, extra = {} }) {
  const actions = new Map([
    ["show", { describe: "Show and focus the window", run: () => main.show() }],
    ["hide", { describe: "Hide the window", run: () => main.window.hide() }],
    ["toggle", { describe: "Show or hide the window", run: () => main.toggle() }],
    ["reload", { describe: "Reload the page", run: () => main.window.webContents.reload() }],
    ["home", { describe: `Return to ${ctx.product.homeLabel}`, run: () => (main.show(), main.load(ctx.startUrl)) }],
    ["quit", { describe: "Quit the app", run: () => app.quit() }],
  ]);
  for (const [name, spec] of Object.entries(extra)) {
    if (ACTION_RE.test(name) && typeof spec?.run === "function") actions.set(name, spec);
  }
  return {
    actions,
    run(name) {
      const action = actions.get(name);
      if (!action) {
        ctx.logger.warn("[CONTROL] Unknown action", { name });
        return false;
      }
      action.run();
      return true;
    },
  };
}

function installGlobalShortcuts(ctx, { app, globalShortcut, control }) {
  const { bindings, problems } = shortcutBindings(ctx.flat["shortcuts.global"], control.actions);
  for (const p of problems) ctx.logger.warn(`[SHORTCUTS] ${p}`);
  for (const { action, accelerator } of bindings) {
    let ok;
    try {
      ok = globalShortcut.register(accelerator, () => control.run(action));
    } catch (error) {
      ctx.logger.warn("[SHORTCUTS] Invalid accelerator", { action, accelerator, message: error.message });
      continue;
    }
    if (!ok) ctx.logger.warn("[SHORTCUTS] Shortcut is taken by another app or not allowed by the desktop", { action, accelerator });
  }
  if (bindings.length > 0) app.on("will-quit", () => globalShortcut.unregisterAll());
  return bindings.length;
}

function installDbus(ctx, { app, control, getUnread, onUnread }) {
  if (!ctx.flat["dbus.enabled"] || process.platform !== "linux") return null;
  let dbus;
  try {
    dbus = require("@homebridge/dbus-native");
  } catch {
    ctx.logger.warn("[DBUS] @homebridge/dbus-native is not installed; D-Bus control disabled");
    return null;
  }
  const names = dbusNames(ctx.product.id);
  // Separate profiles need separate names.
  const busName = ctx.profile === "default" ? names.busName : `${names.busName}.${ctx.profile.replaceAll("-", "_")}`;
  const iface = {
    name: names.interfaceName,
    methods: { Run: ["s", "b"], ListActions: ["", "as"], GetUnreadCount: ["", "i"] },
    signals: { UnreadChanged: ["i", "count"] },
    properties: {},
  };
  let bus;
  try {
    bus = dbus.sessionBus();
  } catch (error) {
    ctx.logger.warn("[DBUS] No session bus", { message: error.message });
    return null;
  }
  bus.connection.on("error", () => ctx.logger.warn("[DBUS] Session bus connection failed"));
  bus.requestName(busName, 0x4, (error, result) => {
    if (error || (result !== 1 && result !== 4)) {
      ctx.logger.warn("[DBUS] Could not own the bus name (another instance?)", { busName });
      return;
    }
    const impl = Object.create(null);
    impl.Run = (name) => (typeof name === "string" ? control.run(name) : false);
    impl.ListActions = () => [...control.actions.keys()];
    impl.GetUnreadCount = () => getUnread();
    bus.exportInterface(impl, names.objectPath, iface);
    onUnread((count) => {
      try {
        bus.sendSignal(names.objectPath, names.interfaceName, "UnreadChanged", "i", [count]);
      } catch {
        // bus gone; nothing to do
      }
    });
    ctx.logger.info("[DBUS] Control interface ready", { busName });
  });
  app.on("will-quit", () => {
    try {
      bus.connection.end();
    } catch {
      // already closed
    }
  });
  return busName;
}

module.exports = { CONTROL_OPTIONS, dbusNames, actionFromArgv, shortcutBindings, createActions, installGlobalShortcuts, installDbus };
