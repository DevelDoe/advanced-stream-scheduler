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
    onBroadcast: (cb) => ipcRenderer.on("broadcast/status", (_e, st) => cb(st)),

    onTimezone: (cb) => ipcRenderer.on("scheduler/timezone", (_e, p) => cb(p)),

});
