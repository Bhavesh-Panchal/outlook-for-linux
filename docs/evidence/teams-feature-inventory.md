# R1: teams-for-linux feature inventory

Source of evidence: REA 6.8.0 `analyze-javascript-application` (static, inert parse, no code executed),
run 2026-11-07 on `teams-for-linux/app` (v2.29.0, directory format).

- Artifact sha256: `7134bb6e044600e5542cdda16c334fd3f62611d96ea6a7eee4a761b324bf319b`
- Evidence id: `ev_d9e899015c8af762af5cff4905440a1e8f5a82dfe89c4f51387fc5075cb78eb6`
- Full evidence (125 MB, git-ignored): `.rea-evidence/teams-app.evidence.json`
- Compact extract used below: `docs/evidence/teams-rea-extract.json`
- Coverage: 153/153 JS files parsed, 0 parse failures. Graph coverage is "partial": dynamic IPC
  channel names and inline `<script>` bodies in 8 HTML files were not analyzed, so a missing
  item here does not prove it is absent.

Items marked *(grep)* were confirmed by plain source search, not REA.

## Totals (REA)

| Fact | Count |
|---|---|
| BrowserWindow constructions | 14 |
| Preload entrypoints | 10 |
| contextBridge APIs | 14 (45 exposed members) |
| Literal IPC channels | 99 (+2 dynamic) |
| Main-process handlers | 81 |
| Protocol registrations | 1 (`setAsDefaultProtocolClient`, scheme from config) |

## Windows and preloads (REA)

| Window (file:line) | Preload | Port to core? |
|---|---|---|
| mainAppWindow/browserWindowManager.js:102 (main window) | browser/preload.js | Yes |
| mainAppWindow/index.js:178, :1248 (child/popup windows) | screenSharing/previewWindowPreload.js | Popups yes, preview no |
| login/index.js:31 (NTLM/basic auth dialog) | login/preload.js | Yes |
| _shared/securePrompt.js:81, _shared/createDialogWindow.js:27 | _shared/securePromptPreload.js | Yes |
| webauthn/pinDialog.js:44, webauthn/touchPrompt.js:42 | pinDialogPreload, touchPromptPreload | Yes |
| notificationSystem/NotificationToast.js:13 | notificationToastPreload.js | Yes |
| documentationWindow/index.js:18 | none | Yes |
| gpuInfoWindow/index.js:21 (`chrome://gpu`) | none | Yes |
| screenSharing/service.js:211 | screenPicker/preload.js | No (Teams calls) |
| quickChat/QuickChatModal.js:15 | quickChatModalPreload.js | No (Teams chat) |
| incomingCallToast/index.js:8 | incomingCallToastPreload.js | No (Teams calls) |

Profile dialogs (addProfile, manageProfile), profileSwitcher and joinMeetingDialog expose
contextBridge APIs too; they are created through `_shared/createDialogWindow.js`.

## IPC channels by module (REA)

`M:` = main side, `R:` = renderer side.

**Port to core (generic)**
- index / browser: `get-config`, `get-app-version`, `config-changed`, `config-file-changed`,
  `get-navigation-state`, `navigate-back`, `navigate-forward`, `navigation-state-changed`,
  `set-badge-count`, `tray-update`, `dock-icon-update`, `system-theme-changed`,
  `unhandled-rejection`, `window-error`, `title-bar-overlay-update`
- notifications: `show-notification`, `play-notification-sound`, `notification-show-toast`,
  `notification-toast-init`, `notification-toast-click`
- zoom / partitions: `get-zoom-level`, `save-zoom-level`
- connection: `offline-retry`
- idle: `get-system-idle-state`
- login: `submitForm`
- secure prompt: `secure-prompt:submit`, `secure-prompt:cancel`
- webauthn: `webauthn:create`, `webauthn:get`, `webauthn:pin-submit`, `webauthn:pin-cancel`, `webauthn:touch-cancel`
- profiles: `profile-list`, `profile-get-active`, `profile-switch`, `profile-add`, `profile-remove`,
  `profile-update`, `profile-switcher-state`, `profile-switcher-unread`, `profile-switcher-set-expanded`,
  `profile-switcher-open-add`, `profile-switcher-open-manage`, `add-profile-submit`, `add-profile-cancel`,
  `add-profile-error`, `manage-profile-state`, `manage-profile-rename`, `manage-profile-pin`,
  `manage-profile-remove`, `manage-profile-close`, `manage-profile-error`
- graph (optional module): `graph-api-get-user-profile`, `graph-api-get-calendar-events`,
  `graph-api-get-calendar-view`, `graph-api-create-calendar-event`, `graph-api-get-mail-messages`

**Teams-only (not ported)**
- presence / calls: `user-status-changed`, `call-connected`, `call-disconnected`,
  `incoming-call-created`, `incoming-call-ended`, `incoming-call-action`, `incoming-call-toast-*`
- screen sharing: `select-source`, `selected-source`, `source-selected`, `choose-desktop-media`,
  `cancel-desktop-media`, `desktop-capturer-get-sources`, `screen-sharing-*`, `get-screen-shar*`,
  `stop-screen-sharing-from-thumbnail`, `resize-preview-window`, `close-view`, `screen-share-port`
- mqtt media: `camera-state-changed`, `microphone-state-changed`, `meeting-started`
- chat / meetings: `quick-chat:*`, `quick-chat-focus`, `graph-api-search-people`,
  `graph-api-send-chat-message`, `join-meeting-*`, `init-dialog`
- teams settings: `get-teams-settings`, `set-teams-settings`
- backgrounds / stickers: `get-custom-bg-list`, `get-sticker-list`, `import-sticker-url`, `delete-sticker`

## Injected browser tools (REA endpoints in browser/preload.js:446–468)

Generic, port: `zoom`, `shortcuts`, `settings`, `theme`, `emulatePlatform`, `webauthnOverride`,
`trayIconRenderer`, `frameless`, `dockIconRenderer`. Also *(grep)*: `mutationTitle`,
`navigationButtons`, `integratedTitleBar`, `trayIconChooser`, `wakeLock`, `browser/notifications/*`.

Teams-only, skip: `cameraResolution`, `cameraAspectRatio`, `disableAutogain`, `ignoreSystemMute`,
`overrideMicConstraints`, `preventDeviceSwitching`, `customStickers`, `speakingIndicator`,
`meetingStartDetector`, `presenceColors`, `mqttStatusMonitor`, `reactHandler`, `activityHub`,
`documentPictureInPicture`, `timestampCopyOverride`.

`tokenCache.js` writes localStorage (REA storage findings): Teams auth token cache workaround.
Not ported until R2/R3 show Outlook/OneDrive need it.

## Host and security facts

*(grep)* Teams-specific host logic lives in `helpers/teamsHosts.js` and is consumed by
`browser/preload.js`, `mainAppWindow/deepLinkRouter.js` and `security/permissions.js`. In the new
core these three consumers read the product descriptor's host list instead.

*(grep)* Hard-coded Microsoft hosts: `login.microsoftonline.com`, `login.microsoft.com`,
`login.live.com` (auth, in `security/permissions.js` AUTH_LOGIN_HOSTS), `graph.microsoft.com` (Graph).
These are shared by all products and belong in core.

*(grep)* Main window webPreferences: `contextIsolation: false`, `sandbox: false`,
`nodeIntegration: false`, with IPC validation compensating. Teams needs this for React DOM access
(`reactHandler`). Outlook/OneDrive have no feature that needs React internals, so the new core
uses `contextIsolation: true` and a contextBridge API. This is a deliberate improvement; revisit
only if R2/R3 show a need.

*(grep)* Link routing: `setWindowOpenHandler` in mainAppWindow/index.js and
profileWindowOpenPolicy.js; non-app links go to `shell.openExternal`. Permission handler grants
device permissions only to trusted origins (configured URL + product hosts + auth hosts);
`openExternal` is allowed for `mailto:` and `tel:` from the main frame.

## Unknowns carried forward

- 63 renderer IPC sends were "ambiguous" (REA could not pair them to one handler). Pairing is
  checked by unit tests in the new core instead.
- Inline scripts in 8 HTML dialogs were not analyzed; they are reviewed by hand when ported.
- Runtime behavior (what Outlook/OneDrive actually request) is not covered by R1; see R2/R3.
