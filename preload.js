// preload.js (CJS)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    // FORWARD EXTRAS (description/privacy/latency/thumbPath)
    scheduleStream: (title, isoUTC, extras = {}) => ipcRenderer.invoke("scheduleStream", { title, isoUTC, ...extras }),

    listUpcoming: () => ipcRenderer.invoke("yt.listUpcoming"),
    deleteBroadcast: (id) => ipcRenderer.invoke("yt.deleteBroadcast", id),

    onLog: (cb) => ipcRenderer.on("scheduler/log", (_e, line) => cb(line)),
    onHeartbeat: (cb) => ipcRenderer.on("scheduler/heartbeat", (_e, hb) => cb(hb)),
    onObs: (cb) => ipcRenderer.on("scheduler/obs", (_e, st) => cb(st)),
    onScheduled: (cb) => ipcRenderer.on("scheduler/scheduled", (_e, data) => cb(data)),

    actionsList: (broadcastId) => ipcRenderer.invoke("actions.list", { broadcastId }),
    actionsAdd: (broadcastId, atISO, type, payload) => ipcRenderer.invoke("actions.add", { broadcastId, atISO, type, payload }),
    actionsDelete: (id) => ipcRenderer.invoke("actions.delete", { id }),

    // defaults helpers (your renderer already calls these)
    loadDefaults: () => ipcRenderer.invoke("defaults.load"),
    saveDefaults: (values) => ipcRenderer.invoke("defaults.save", values),
    pickThumbnail: () => ipcRenderer.invoke("thumb.pick"),

    // go live
    goLive: (broadcastId) => ipcRenderer.invoke("yt.goLive", broadcastId),
    endStream: (broadcastId) => ipcRenderer.invoke("yt.endStream", broadcastId),
    onBroadcast: (cb) => ipcRenderer.on("broadcast/status", (_e, st) => cb(st)),

    onTimezone: (cb) => ipcRenderer.on("scheduler/timezone", (_e, p) => cb(p)),

    // Loading states
    onLoading: (cb) => ipcRenderer.on("scheduler/loading", (_e, data) => cb(data)),



    // OBS Settings
    onOpenOBSSettings: (cb) => ipcRenderer.on("open.obsSettings", (_e) => cb()),
    obsLoadConfig: () => ipcRenderer.invoke("obs.loadConfig"),
    obsSaveConfig: (config) => ipcRenderer.invoke("obs.saveConfig", config),
    obsTestConnection: (config) => ipcRenderer.invoke("obs.testConnection", config),

    // Credentials Management
    onOpenCredentialsSetup: (cb) => ipcRenderer.on("open.credentialsSetup", (_e) => cb()),
    credentialsCheckSetup: () => ipcRenderer.invoke("credentials.checkSetup"),
    credentialsValidate: (path) => ipcRenderer.invoke("credentials.validate", path),
    credentialsPick: () => ipcRenderer.invoke("credentials.pick"),
    credentialsCopyToApp: (sourcePath) => ipcRenderer.invoke("credentials.copyToApp", sourcePath),
    credentialsClearToken: () => ipcRenderer.invoke("credentials.clearToken"),

    // OAuth Status and Control
    oauthStatus: () => ipcRenderer.invoke("oauth.status"),
    oauthCancel: () => ipcRenderer.invoke("oauth.cancel"),

    // Update functions
    updateCheck: () => ipcRenderer.invoke("update.check"),
    updateDownload: () => ipcRenderer.invoke("update.download"),
    updateInstall: () => ipcRenderer.invoke("update.install"),
    
    // Log panel toggle
    toggleLogPanel: () => ipcRenderer.invoke("toggle.logPanel"),
    onUpdateAvailable: (callback) => ipcRenderer.on("update/available", callback),
    onUpdateProgress: (callback) => ipcRenderer.on("update/progress", callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on("update/downloaded", callback),
    onToggleLogPanel: (callback) => ipcRenderer.on("toggle.logPanel", callback),

});
