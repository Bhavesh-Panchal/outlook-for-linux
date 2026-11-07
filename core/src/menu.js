"use strict";

// One set of actions, laid out like the teams-for-linux tray menu, used for both
// the tray icon's menu and the window's menu bar.

const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, Menu, app, dialog, nativeImage, session, shell } = require("electron");
const { redactedConfig } = require("./config");

function filterAccelerator(accelerator, reserved) {
  return accelerator && !reserved.has(accelerator.toLowerCase()) ? accelerator : undefined;
}

function openGpuInfo(ctx) {
  const win = new BrowserWindow({ width: 900, height: 700, title: `${ctx.product.name}: GPU info`, autoHideMenuBar: true });
  win.loadURL("chrome://gpu").catch(() => {});
}

async function openConfigFile(ctx) {
  const file = path.join(ctx.configDir, "config.json");
  try {
    fs.mkdirSync(ctx.configDir, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, "{\n}\n", { mode: 0o600 });
  } catch (error) {
    ctx.logger.warn("[MENU] Could not create config.json", { code: error.code });
  }
  const failure = await shell.openPath(file);
  if (failure) shell.openPath(ctx.configDir);
}

function showActiveConfig(ctx, main) {
  const detail = [
    `Profile: ${ctx.profile}   Account: ${ctx.account}`,
    `Config: ${path.join(ctx.configDir, "config.json")} (and /etc/${ctx.product.id}/config.json)`,
    "",
    JSON.stringify(redactedConfig(ctx.flat, ctx.schema), null, 2),
  ].join("\n");
  dialog.showMessageBox(main.window, { type: "info", title: "Active configuration", message: "Active configuration", detail });
}

async function chooseAppIcon(ctx, main) {
  const result = await dialog.showOpenDialog(main.window, {
    title: "Choose App Icon",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
  });
  const file = result.filePaths?.[0];
  if (result.canceled || !file) return;
  if (nativeImage.createFromPath(file).isEmpty()) {
    dialog.showMessageBox(main.window, { type: "warning", message: "That file is not an image this app can use." });
    return;
  }
  ctx.prefs.set("appIcon", file);
}

async function quitClearingStorage(ctx, main) {
  const { response } = await dialog.showMessageBox(main.window, {
    type: "warning",
    buttons: ["Cancel", "Sign out and quit"],
    defaultId: 0,
    cancelId: 0,
    message: "Clear all data for this profile and quit?",
    detail: `This signs you out of ${ctx.product.title} in profile "${ctx.profile}" and removes cached mail, files and settings stored by the web app. Your config.json is kept.`,
  });
  if (response !== 1) return;
  const ses = session.defaultSession;
  await ses.clearStorageData().catch(() => {});
  await ses.clearCache().catch(() => {});
  await ses.clearAuthCache().catch(() => {});
  ctx.logger.info("[APP] Storage cleared; quitting");
  app.quit();
}

function about(ctx, main) {
  const { product } = ctx;
  dialog.showMessageBox(main.window, {
    type: "info",
    title: `About ${product.name}`,
    icon: ctx.currentIcon?.() ?? undefined,
    message: `${product.name} ${product.version}`,
    detail: [
      product.description,
      "",
      `Profile: ${ctx.profile}   Account: ${ctx.account}`,
      `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
      "",
      "Unofficial. Not affiliated with or endorsed by Microsoft.",
      "License: GPL-3.0-or-later",
    ].join("\n"),
  });
}

/**
 * The shared action list.
 * @param {object} ctx app context (with prefs, schema)
 * @param {object} main main window controller
 * @param {{ productItems?: object[], settingsItems?: object[] }} extras from product.setup()
 */
function actionItems(ctx, main, { productItems = [], settingsItems = [] } = {}) {
  const { product, prefs } = ctx;
  const reserved = new Set((product.reservedShortcuts ?? []).map((s) => s.toLowerCase()));
  const acc = (a) => filterAccelerator(a, reserved);
  const contents = () => main.window.webContents;
  const theme = prefs.get("theme");
  const pref = (key) => prefs.get(key);
  const notificationsAllowedByConfig = ctx.flat["notifications.enabled"];
  const hasUnread = product.unread.sources.length > 0;

  return [
    { label: "Open", accelerator: acc("Ctrl+O"), click: () => main.show() },
    ...productItems,
    { label: `Return to ${product.homeLabel}`, click: () => (main.show(), main.load(ctx.startUrl)) },
    { label: "Refresh", accelerator: acc("F5"), click: () => contents().reload() },
    { label: "Hide", accelerator: acc("Ctrl+H"), click: () => main.window.hide() },
    {
      label: "Debug",
      submenu: [
        { label: "Open DevTools", accelerator: acc("F12"), click: () => (main.show(), contents().openDevTools({ mode: "detach" })) },
        { label: "Open GPU Info", click: () => openGpuInfo(ctx) },
        { label: "Force refresh (ignore cache)", accelerator: acc("Ctrl+F5"), click: () => contents().reloadIgnoringCache() },
      ],
    },
    { type: "separator" },
    {
      label: "Settings",
      submenu: [
        { label: "Show Active Configuration…", click: () => showActiveConfig(ctx, main) },
        { label: "Open config file", click: () => openConfigFile(ctx) },
        { label: "Open config folder", click: () => shell.openPath(ctx.configDir) },
        ...(settingsItems.length > 0 ? [{ type: "separator" }, ...settingsItems] : []),
      ],
    },
    {
      label: "Theme",
      submenu: [
        { label: "Follow system", type: "radio", checked: theme === "system", click: () => prefs.set("theme", "system") },
        { label: "Light", type: "radio", checked: theme === "light", click: () => prefs.set("theme", "light") },
        { label: "Dark", type: "radio", checked: theme === "dark", click: () => prefs.set("theme", "dark") },
      ],
    },
    {
      label: "App Icon",
      submenu: [
        { label: "Choose App Icon…", click: () => chooseAppIcon(ctx, main) },
        { label: "Reset to default", enabled: pref("appIcon") !== null, click: () => prefs.set("appIcon", null) },
      ],
    },
    {
      label: "Zoom",
      submenu: [
        { label: "Zoom in", accelerator: acc("Ctrl+="), click: () => main.zoom("in") },
        { label: "Zoom in", accelerator: acc("Ctrl+Plus"), visible: false, acceleratorWorksWhenHidden: true, click: () => main.zoom("in") },
        { label: "Zoom out", accelerator: acc("Ctrl+-"), click: () => main.zoom("out") },
        { label: "Reset zoom", accelerator: acc("Ctrl+0"), click: () => main.zoom("reset") },
      ],
    },
    {
      label: "Notifications",
      submenu: [
        {
          label: "Disable All Notifications",
          type: "checkbox",
          enabled: notificationsAllowedByConfig,
          checked: !notificationsAllowedByConfig || pref("notificationsDisabled"),
          click: (item) => prefs.set("notificationsDisabled", item.checked),
        },
        { label: "Disable Notification Sound", type: "checkbox", checked: pref("soundDisabled"), click: (item) => prefs.set("soundDisabled", item.checked) },
        ...(hasUnread
          ? [{ label: "Disable Badge Count", type: "checkbox", checked: pref("badgeDisabled"), click: (item) => prefs.set("badgeDisabled", item.checked) }]
          : []),
      ],
    },
    { type: "separator" },
    { label: "About", click: () => about(ctx, main) },
    {
      label: "Help",
      submenu: [
        ...(product.homepage ? [{ label: `${product.name} Documentation`, click: () => shell.openExternal(product.homepage) }] : []),
        ...(product.homepage ? [{ label: "GitHub Project", click: () => shell.openExternal(product.homepage) }] : []),
        ...(product.bugs ? [{ label: "Report an Issue", click: () => shell.openExternal(product.bugs) }] : []),
        ...(product.supportUrl ? [{ label: `Microsoft ${product.title} Support`, click: () => shell.openExternal(product.supportUrl) }] : []),
        ...(ctx.checkForUpdates ? [{ type: "separator" }, { label: "Check for Updates…", click: () => ctx.checkForUpdates() }] : []),
      ],
    },
    { type: "separator" },
    { label: "Quit (Clear Storage)", click: () => quitClearingStorage(ctx, main) },
    { label: "Quit", accelerator: acc("Ctrl+Q"), click: () => app.quit() },
  ];
}

/** Window menu bar: the action list under the product name, plus Edit and Go. */
function buildAppMenu(ctx, main, extras) {
  const contents = () => main.window.webContents;
  return Menu.buildFromTemplate([
    { label: ctx.product.name, submenu: actionItems(ctx, main, extras) },
    { role: "editMenu" },
    {
      label: "&View",
      submenu: [{ role: "togglefullscreen" }, { type: "separator" }, { label: "Back", accelerator: "Alt+Left", click: () => contents().navigationHistory.goBack() }, { label: "Forward", accelerator: "Alt+Right", click: () => contents().navigationHistory.goForward() }],
    },
  ]);
}

function buildTrayMenu(ctx, main, extras) {
  // Accelerators are shown as hints only; tray menus do not capture keys.
  return Menu.buildFromTemplate(actionItems(ctx, main, extras));
}

module.exports = { actionItems, buildAppMenu, buildTrayMenu, filterAccelerator };
