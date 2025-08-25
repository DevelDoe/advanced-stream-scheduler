// preload.js (CJS)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    scheduleStream: (title, isoUTC) => ipcRenderer.invoke("scheduleStream", { title, isoUTC }),
    listUpcoming: () => ipcRenderer.invoke("yt.listUpcoming"), // ← new
    deleteBroadcast: (id) => ipcRenderer.invoke("yt.deleteBroadcast", id), // ← new
    onLog: (cb) => ipcRenderer.on("scheduler/log", (_e, line) => cb(line)),
    onHeartbeat: (cb) => ipcRenderer.on("scheduler/heartbeat", (_e, hb) => cb(hb)),
    onObs: (cb) => ipcRenderer.on("scheduler/obs", (_e, st) => cb(st)),
    onScheduled: (cb) => ipcRenderer.on("scheduler/scheduled", (_e, data) => cb(data)),
});
