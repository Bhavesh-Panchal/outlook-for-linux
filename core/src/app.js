"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, globalShortcut, Menu, nativeImage, nativeTheme, session, shell } = require("electron");
const { validateProduct } = require("./product");
const { loadConfig, profileDataDir } = require("./config");
const { createLinkClassifier, LINK } = require("./links");
const { isPermissionAllowed } = require("./security");
const util = require("./util");
const { createStateStore } = require("./state");
const { createPrefs } = require("./prefs");
const { installBrowserIdentity } = require("./identity");
const { createIpc } = require("./ipc");
const { createMainWindow } = require("./window");
const { createTray } = require("./tray");
const { buildAppMenu, buildTrayMenu } = require("./menu");
const { installDownloads } = require("./downloads");
const { createConnectionMonitor } = require("./connection");
const { createPrompter } = require("./prompt");
const { installEnterpriseAuth } = require("./enterprise");
const { createUpdateChecker } = require("./updates");
const { createActions, installGlobalShortcuts, installDbus, actionFromArgv } = require("./control");

const CORE_ROOT = path.join(__dirname, "..");
const MAX_LOGGED_DENIALS = 100;

function readOptional(file, logger) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") logger.warn("[CONFIG] Could not read a config file", { file, code: error.code });
    return null;
  }
}

function installPermissions(ses, ctx) {
  const base = ctx.product.permissions.filter((p) => p !== "notifications" || ctx.flat["notifications.enabled"]);
  const withNotifications = new Set(base);
  const withoutNotifications = new Set(base.filter((p) => p !== "notifications"));
  // Read per request so the "Disable All Notifications" menu item applies at once.
  const policy = {
    classify: ctx.classify,
    get allowed() {
      return ctx.prefs?.get("notificationsDisabled") ? withoutNotifications : withNotifications;
    },
  };
  const logged = new Set();
  const topLevelUrl = (contents) => {
    try {
      return contents?.getURL();
    } catch {
      return undefined;
    }
  };
  const decide = (contents, permission, details, requestingUrl) => {
    const ok = isPermissionAllowed(
      { permission, requestingUrl, topLevelUrl: topLevelUrl(contents), isMainFrame: details?.isMainFrame, externalURL: details?.externalURL },
      policy,
    );
    const key = `${permission}|${util.redactUrl(requestingUrl)}`;
    if (!ok && logged.size < MAX_LOGGED_DENIALS && !logged.has(key)) {
      logged.add(key);
      ctx.logger.info("[PERMISSIONS] Denied", { permission, origin: util.redactUrl(requestingUrl) });
    }
    return ok;
  };
  ses.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(decide(contents, permission, details, details?.requestingUrl)),
  );
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    decide(contents, permission, details, details?.requestingUrl ?? requestingOrigin),
  );
}

function runSmokeChecks(ctx, main, unread) {
  const contents = main.window.webContents;
  const finish = (code, result) => {
    process.stdout.write(`MS365_SMOKE ${JSON.stringify(result)}\n`);
    setTimeout(() => app.exit(code), 200);
  };
  const timeout = setTimeout(() => finish(2, { ok: false, reason: "timeout" }), 60000);
  contents.on("did-finish-load", async () => {
    if (contents.getURL().startsWith("file:")) return;
    clearTimeout(timeout);
    const unreadFromTitle = unread.count;
    try {
      const page = await contents.executeJavaScript(
        `(async () => {
           await new Promise((r) => setTimeout(r, 300));
           await navigator.setAppBadge(7);
           const prefs = await globalThis.ms365Desktop.getPagePrefs();
           return {
             installed: globalThis.__ms365DesktopInstalled === true,
             bridge: Object.keys(globalThis.ms365Desktop ?? {}).sort(),
             nodeVisible: typeof require !== "undefined" || typeof process !== "undefined",
             notificationWrapped: Notification.name === "Notification" && Object.getPrototypeOf(Notification) !== Function.prototype,
             title: document.title,
             brands: navigator.userAgentData?.brands?.map((b) => b.brand) ?? [],
             pagePrefs: prefs,
           };
         })()`,
      );
      await new Promise((r) => setTimeout(r, 500));
      const result = {
        ...page,
        origin: util.redactUrl(contents.getURL()),
        unreadFromTitle,
        unreadAfterBadge: unread.count,
        sandboxed: main.window.webContents.getLastWebPreferences().sandbox === true,
        contextIsolation: main.window.webContents.getLastWebPreferences().contextIsolation === true,
        trayEnabled: ctx.trayEnabled,
        profile: ctx.profile,
        theme: nativeTheme.themeSource,
        menu: Menu.getApplicationMenu()?.items[0]?.submenu?.items.filter((i) => i.type !== "separator" && i.visible).map((i) => i.label) ?? [],
        userData: app.getPath("userData"),
      };
      const sources = ctx.product.unread.sources;
      const expectTitle = sources.includes("title") ? 3 : 0;
      const expectBadge = sources.includes("badge-api") ? 7 : expectTitle;
      result.ok =
        page.installed && !page.nodeVisible && page.notificationWrapped &&
        unreadFromTitle === expectTitle && result.unreadAfterBadge === expectBadge && result.sandboxed && result.contextIsolation;
      finish(result.ok ? 0 : 1, result);
    } catch (error) {
      finish(1, { ok: false, reason: error.message });
    }
  });
}

function onReady(ctx, userArgs) {
  const { product, flat, logger } = ctx;
  const ses = session.defaultSession;

  const ua = flat["network.userAgent"] ?? util.cleanUserAgent(ses.getUserAgent());
  ses.setUserAgent(ua);
  app.userAgentFallback = ua;
  installBrowserIdentity(app, { mode: flat["network.browserBrand"], userAgent: ua, logger });
  installPermissions(ses, ctx);

  const languages = flat["spellcheck.languages"];
  if (languages.length > 0) {
    const available = new Set(ses.availableSpellCheckerLanguages);
    const usable = languages.filter((l) => available.has(l));
    if (usable.length < languages.length) logger.warn("[SPELLCHECK] Some languages are not available", { requested: languages.length, usable: usable.length });
    if (usable.length > 0) ses.setSpellCheckerLanguages(usable);
  }

  let tray = null;
  let lastCount = 0;
  const showBadge = (count) => {
    const shown = ctx.prefs.get("badgeDisabled") ? 0 : count;
    tray?.setUnread(shown);
    app.setBadgeCount(Math.max(shown, 0));
  };
  const unreadListeners = new Set();
  const unread = util.createUnreadTracker(product.unread.sources, (count) => {
    lastCount = count;
    showBadge(count);
    // Listeners (MQTT) get the real count even when the badge is hidden.
    for (const listener of unreadListeners) {
      try {
        listener(count);
      } catch (error) {
        logger.warn("[UNREAD] Listener failed", { message: error.message });
      }
    }
  });
  const onUnread = (listener) => {
    unreadListeners.add(listener);
    return () => unreadListeners.delete(listener);
  };

  const main = createMainWindow(ctx, {
    onTitle: (title) => unread.fromTitle(util.parseUnreadFromTitle(title, product.unread.titlePattern)),
  });

  ctx.openProtocolUrl = (url) => {
    const scheme = new URL(url).protocol.slice(0, -1).toLowerCase();
    const handler = product.protocols.find((p) => p.scheme === scheme);
    let target = null;
    let external = false;
    try {
      const result = handler?.toUrl(url, ctx) ?? null;
      if (result && typeof result === "object") {
        target = result.url ?? null;
        external = result.external === true;
      } else {
        target = result;
      }
    } catch (error) {
      logger.warn("[PROTOCOL] Handler failed", { scheme, message: error.message });
    }
    const kind = target ? ctx.classify(target) : LINK.BLOCKED;
    if (!external && kind === LINK.APP) {
      main.show();
      main.load(target);
    } else if (/^https:\/\//i.test(target ?? "") && kind !== LINK.BLOCKED) {
      shell.openExternal(target).catch(() => {});
    } else {
      logger.warn("[PROTOCOL] Ignored link: no app URL for it", { scheme });
    }
  };

  const openLaunchTarget = (argv) => {
    const target = util.findLaunchTarget(argv, product.protocols.map((p) => p.scheme));
    if (!target) return false;
    const kind = ctx.classify(target);
    if (kind === LINK.PROTOCOL) {
      ctx.openProtocolUrl(target);
      return true;
    }
    if (kind === LINK.APP) {
      main.load(target);
      return true;
    }
    logger.warn("[LAUNCH] Ignored a launch URL that is not an app page", { url: util.redactUrl(target) });
    return false;
  };

  const ipc = createIpc({ classify: ctx.classify, coreRoot: CORE_ROOT, logger });
  ipc.handle("ms365:set-badge", "web", (_event, value) => unread.fromBadge(value));
  ipc.on("ms365:notification-click", "web", () => main.show());

  const connection = createConnectionMonitor(ctx, main.window);
  ipc.on("ms365:offline-retry", "local", () => connection.retryNow());

  installDownloads(ses, ctx, () => main.window);
  const prompt = createPrompter({ ipc, coreRoot: CORE_ROOT, icon: product.icons.app });
  installEnterpriseAuth(ctx, { app, session: ses, prompt, getWindow: () => main.window });
  const updates = createUpdateChecker(ctx, () => main.window);
  ctx.checkForUpdates = updates.available ? () => updates.check({ manual: true }) : null;

  let extension = {};
  try {
    extension = product.setup?.({ ...ctx, app, main, ipc, unread, onUnread }) ?? {};
  } catch (error) {
    logger.error("[APP] Product setup failed; continuing without its extras", { message: error.message });
  }
  const extras = { productItems: extension.productItems ?? [], settingsItems: extension.menuItems ?? [] };
  const control = createActions(ctx, { app, main, extra: extension.actions ?? {} });
  installGlobalShortcuts(ctx, { app, globalShortcut, control });
  installDbus(ctx, { app, control, getUnread: () => unread.count, onUnread });
  updates.start();

  const pagePrefs = () => ({ silent: ctx.prefs.get("soundDisabled") });
  ipc.handle("ms365:get-page-prefs", "web", () => pagePrefs());
  const pushPagePrefs = () => {
    if (!main.window.isDestroyed()) main.window.webContents.send("ms365:page-prefs", pagePrefs());
  };

  const applyIcon = () => {
    const file = ctx.prefs.get("appIcon");
    const image = file ? nativeImage.createFromPath(file) : null;
    const usable = image && !image.isEmpty() ? image : nativeImage.createFromPath(product.icons.app);
    main.window.setIcon(usable);
    tray?.setIcon(file && image && !image.isEmpty() ? file : null);
  };
  ctx.currentIcon = () => {
    const file = ctx.prefs.get("appIcon");
    const image = file ? nativeImage.createFromPath(file) : null;
    return image && !image.isEmpty() ? image : nativeImage.createFromPath(product.icons.app);
  };

  const rebuildMenus = () => {
    Menu.setApplicationMenu(buildAppMenu(ctx, main, extras));
    tray?.setMenu(buildTrayMenu(ctx, main, extras));
  };
  if (ctx.trayEnabled) tray = createTray(ctx, main, buildTrayMenu(ctx, main, extras));
  rebuildMenus();
  if (ctx.prefs.get("appIcon")) applyIcon();

  ctx.prefs.onChange((key, value) => {
    if (key === "theme") nativeTheme.themeSource = value;
    if (key === "badgeDisabled") showBadge(lastCount);
    if (key === "appIcon") applyIcon();
    if (key === "soundDisabled") pushPagePrefs();
    logger.info("[PREFS] Changed", { key });
    rebuildMenus();
  });

  if (process.env.MS365_SMOKE === "1") runSmokeChecks(ctx, main, unread);

  if (!openLaunchTarget(userArgs)) main.load(ctx.startUrl);
  const firstAction = actionFromArgv(userArgs);
  if (firstAction && firstAction !== "quit") main.window.webContents.once("did-finish-load", () => control.run(firstAction));

  app.on("second-instance", (_event, argv) => {
    // "--action=<name>" controls the running instance without raising it.
    const action = actionFromArgv(argv);
    if (action) {
      control.run(action);
      return;
    }
    main.show();
    openLaunchTarget(argv.slice(1));
  });
  app.on("window-all-closed", () => app.quit());
  logger.info(`[APP] ${product.name} ${product.version} ready`, { profile: ctx.profile, account: ctx.account });
}

/**
 * Start a product. Call once from the product's main script.
 * @param {object} descriptor product descriptor (see docs/product-descriptor.md)
 */
function startApp(descriptor) {
  // A remote-debugging port gives any local process full control of the signed-in
  // session. Packaged builds refuse to start with it (the fuses already block
  // --inspect and NODE_OPTIONS). Developers can set MS365_ALLOW_REMOTE_DEBUGGING=1.
  const debugSwitch = ["remote-debugging-port", "remote-debugging-pipe", "remote-debugging-address"].find((s) => app.commandLine.hasSwitch(s));
  if (debugSwitch && app.isPackaged && process.env.MS365_ALLOW_REMOTE_DEBUGGING !== "1") {
    console.error(`[SECURITY] Refusing to start with --${debugSwitch}. Set MS365_ALLOW_REMOTE_DEBUGGING=1 to allow it.`);
    app.exit(1);
    return;
  }
  const product = validateProduct(descriptor);
  const bootLogger = util.createLogger("info");
  const configDir = path.join(app.getPath("appData"), product.id);
  const userArgs = process.argv.slice(process.defaultApp ? 2 : 1);

  const loaded = loadConfig({
    product,
    systemConfigText: readOptional(path.join("/etc", product.id, "config.json"), bootLogger),
    userConfigText: readOptional(path.join(configDir, "config.json"), bootLogger),
    argv: userArgs,
  });
  const logger = util.createLogger(loaded.flat["logging.level"]);
  for (const warning of loaded.warnings) logger.warn(`[CONFIG] ${warning}`);

  // Notification headers: KDE uses app.name, GNOME the desktop entry's Name.
  app.setName(product.name);
  app.setPath("userData", process.env.MS365_USER_DATA_DIR || profileDataDir(configDir, loaded.profile, path.join));
  if (process.platform === "linux") {
    app.setDesktopName(process.env.FLATPAK_ID ? `${process.env.FLATPAK_ID}.desktop` : `${product.id}.desktop`);
  }

  const flat = loaded.flat;
  if (flat["performance.disableGpu"]) app.disableHardwareAcceleration();
  // Chromium follows fontconfig's subpixel (RGB) setting, which gives coloured,
  // heavier-looking text than Firefox on the same desktop. Grayscale matches Firefox.
  if (flat["appearance.fontAntialiasing"] === "grayscale") app.commandLine.appendSwitch("disable-lcd-text");
  if (flat["network.proxyServer"]) app.commandLine.appendSwitch("proxy-server", flat["network.proxyServer"]);
  if (flat["network.authServerAllowlist"]) app.commandLine.appendSwitch("auth-server-allowlist", flat["network.authServerAllowlist"]);

  // Global shortcuts on Wayland go through the desktop portal.
  if (process.platform === "linux" && Object.keys(flat["shortcuts.global"] ?? {}).length > 0 && process.env.XDG_SESSION_TYPE === "wayland") {
    app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
  }

  // "--action=quit" with no running instance has nothing to do.
  if (actionFromArgv(userArgs) === "quit" && app.requestSingleInstanceLock()) {
    app.exit(0);
    return;
  }

  // One instance per profile: the lock lives in the profile's userData.
  if (!app.requestSingleInstanceLock()) {
    logger.info("[APP] Already running for this profile; handing over");
    app.quit();
    return;
  }

  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });

  const ctx = {
    product,
    config: loaded.config,
    flat,
    schema: loaded.schema,
    prefs: null,
    profile: loaded.profile,
    account: loaded.account,
    startUrl: loaded.startUrl,
    configDir,
    coreRoot: CORE_ROOT,
    logger,
    trayEnabled: flat["tray.enabled"],
    isQuitting: () => quitting,
    classify: createLinkClassifier(product, {
      extraAppOrigins: [loaded.startUrl],
      allowInsecureHttp: flat["network.allowInsecureHttp"],
    }),
    state: null,
    openProtocolUrl: () => {},
  };

  app
    .whenReady()
    .then(() => {
      ctx.state = createStateStore(path.join(app.getPath("userData"), "state.json"), logger);
      ctx.prefs = createPrefs(ctx.state);
      nativeTheme.themeSource = ctx.prefs.get("theme");
      onReady(ctx, userArgs);
    })
    .catch((error) => {
      logger.error("[APP] Startup failed", { message: error.message, stack: error.stack });
      app.exit(1);
    });
}

module.exports = { startApp };
