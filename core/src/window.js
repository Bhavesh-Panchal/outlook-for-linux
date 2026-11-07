"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { BrowserWindow, Menu, clipboard, nativeTheme, screen, shell } = require("electron");
const { LINK, decideWindowOpen, decideNavigation } = require("./links");
const { restorableBounds, redactUrl } = require("./util");

const MIN_SIZE = Object.freeze({ width: 640, height: 480 });
const DEFAULT_SIZE = Object.freeze({ width: 1280, height: 860 });
const ZOOM_STEP = 0.5;
const ZOOM_LIMIT = 4;

function webPreferences() {
  return {
    preload: path.join(__dirname, "preload", "web.js"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webviewTag: false,
    spellcheck: true,
    safeDialogs: true,
    navigateOnDragDrop: false,
  };
}

function openExternal(url, ctx) {
  if (ctx.classify(url) === LINK.BLOCKED) return;
  shell.openExternal(url).catch((error) => {
    ctx.logger.warn("[LINKS] Could not open link externally", { url: redactUrl(url), message: error.message });
  });
}

function showContextMenu(contents, params, ctx) {
  const items = [];
  const separator = () => {
    if (items.length > 0 && items.at(-1).type !== "separator") items.push({ type: "separator" });
  };

  if (params.misspelledWord) {
    for (const word of params.dictionarySuggestions.slice(0, 6)) {
      items.push({ label: word, click: () => contents.replaceMisspelling(word) });
    }
    if (params.dictionarySuggestions.length === 0) items.push({ label: "No suggestions", enabled: false });
    items.push({
      label: "Add to dictionary",
      click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    });
    separator();
  }
  if (params.linkURL) {
    if (/^https?:/i.test(params.linkURL)) {
      items.push({ label: "Open link in browser", click: () => openExternal(params.linkURL, ctx) });
    }
    items.push({ label: "Copy link address", click: () => clipboard.writeText(params.linkURL) });
    separator();
  }
  if (params.mediaType === "image" && params.hasImageContents) {
    items.push({ label: "Copy image", click: () => contents.copyImageAt(params.x, params.y) });
    separator();
  }
  const flags = params.editFlags ?? {};
  if (params.isEditable && flags.canCut) items.push({ role: "cut" });
  if (flags.canCopy && params.selectionText) items.push({ role: "copy" });
  if (params.isEditable && flags.canPaste) items.push({ role: "paste" }, { role: "pasteAndMatchStyle" });
  if (params.isEditable && flags.canSelectAll) items.push({ role: "selectAll" });

  while (items.at(-1)?.type === "separator") items.pop();
  if (items.length > 0) Menu.buildFromTemplate(items).popup();
}

/** Link routing, navigation guard and context menu for one webContents and its popups. */
function attachContentsPolicy(contents, ctx) {
  contents.setWindowOpenHandler(({ url }) => {
    const kind = ctx.classify(url);
    let decision = decideWindowOpen(kind);
    // A product may send a child window to the browser or deny it, never widen
    // what the core would allow.
    const override = ctx.product.routeLink?.(url, kind, ctx);
    if (decision === "child" && (override === "external" || override === "deny")) decision = override;
    if (decision === "child") {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          icon: ctx.product.icons.app,
          autoHideMenuBar: true,
          minWidth: 400,
          minHeight: 300,
          webPreferences: webPreferences(),
        },
      };
    }
    if (decision === "external") openExternal(url, ctx);
    if (decision === "protocol") ctx.openProtocolUrl(url);
    return { action: "deny" };
  });

  contents.on("did-create-window", (child) => {
    child.setMenuBarVisibility(false);
    attachContentsPolicy(child.webContents, ctx);
  });

  contents.on("will-navigate", (event) => {
    const url = event.url;
    const decision = decideNavigation(url, ctx.classify(url));
    if (decision === "allow") return;
    event.preventDefault();
    if (decision === "external") openExternal(url, ctx);
    if (decision === "protocol") ctx.openProtocolUrl(url);
    if (decision === "deny") ctx.logger.warn("[LINKS] Blocked navigation", { url: redactUrl(url) });
  });

  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("context-menu", (_event, params) => showContextMenu(contents, params, ctx));
}

function readCustomCss(file, logger) {
  if (!file) return null;
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    logger.warn("[CSS] Could not read appearance.customCSSFile", { code: error.code });
    return null;
  }
}

/**
 * @param {object} ctx app context
 * @param {{ onTitle: (title: string) => void }} hooks
 */
function createMainWindow(ctx, { onTitle }) {
  const { product, flat, state, logger } = ctx;
  const saved = state.get("window") ?? {};
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const bounds = restorableBounds(saved.bounds, workAreas, MIN_SIZE) ?? { ...DEFAULT_SIZE };

  const win = new BrowserWindow({
    title: product.title,
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    icon: product.icons.app,
    frame: flat["window.frame"],
    autoHideMenuBar: flat["window.menubar"] === "auto",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1f1f" : "#ffffff",
    webPreferences: webPreferences(),
  });
  if (flat["window.menubar"] === "hidden") win.setMenuBarVisibility(false);
  if (saved.maximized) win.maximize();

  const startHidden = flat["window.startMinimized"] && ctx.trayEnabled;
  win.once("ready-to-show", () => {
    if (!startHidden) win.show();
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    state.set("window", { bounds: win.getNormalBounds(), maximized: win.isMaximized() });
  };
  for (const name of ["resize", "move", "maximize", "unmaximize"]) win.on(name, saveBounds);

  win.on("close", (event) => {
    saveBounds();
    state.flush();
    if (!ctx.isQuitting() && flat["window.closeToTray"] && ctx.trayEnabled) {
      event.preventDefault();
      win.hide();
    }
  });

  const contents = win.webContents;
  attachContentsPolicy(contents, ctx);
  contents.on("page-title-updated", (_event, title) => onTitle(title));

  const zoomLevel = () => {
    const z = state.get("zoomLevel");
    return Number.isFinite(z) ? z : 0;
  };
  const setZoom = (level) => {
    const clamped = Math.max(-ZOOM_LIMIT, Math.min(ZOOM_LIMIT, level));
    contents.setZoomLevel(clamped);
    state.set("zoomLevel", clamped);
  };
  contents.on("zoom-changed", (_event, direction) => setZoom(zoomLevel() + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP)));

  contents.on("did-finish-load", () => {
    contents.setZoomLevel(zoomLevel());
    if (contents.getURL().startsWith("file:")) return;
    const css = readCustomCss(flat["appearance.customCSSFile"], logger);
    if (css) contents.insertCSS(css).catch(() => {});
  });

  const show = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  return {
    window: win,
    load(url) {
      win.loadURL(url).catch((error) => {
        // Network failures are handled by the connection monitor.
        logger.debug("[WINDOW] loadURL rejected", { code: error.code });
      });
    },
    show,
    toggle() {
      if (win.isVisible() && win.isFocused()) win.hide();
      else show();
    },
    zoom(direction) {
      if (direction === "reset") setZoom(0);
      else setZoom(zoomLevel() + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP));
    },
  };
}

module.exports = { createMainWindow, attachContentsPolicy, webPreferences };
