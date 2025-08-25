// main.js
import { app, BrowserWindow, ipcMain } from "electron";
import { startScheduler, restartScheduler, schedulerBus } from "./scheduler.js";
import { loadAuth, scheduleLiveStream, listUpcomingBroadcasts, deleteBroadcast } from "./youtube_api.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let lastHB = Date.now();

schedulerBus.on("heartbeat", () => {
    lastHB = Date.now();
});

setInterval(() => {
    const stale = Date.now() - lastHB > 90_000;
    if (stale) {
        console.warn("⚠️ Heartbeat stale; restarting scheduler…");
        try {
            restartScheduler();
        } catch (e) {
            console.error("Restart failed:", e);
        }
        BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", "⚠️ Heartbeat stale; restarted scheduler.");
    }
}, 20_000);

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
    createWindow();
    startScheduler();

    // Forward scheduler bus events to renderer
    schedulerBus.on("log", (line) => mainWindow?.webContents.send("scheduler/log", line));
    schedulerBus.on("heartbeat", (hb) => mainWindow?.webContents.send("scheduler/heartbeat", hb));
    schedulerBus.on("obs_status", (st) => mainWindow?.webContents.send("scheduler/obs", st));
    // schedulerBus.on("py_status", (st) => mainWindow?.webContents.send("scheduler/py", st));
});

// Handle schedule request from renderer
ipcMain.handle("scheduleStream", async (_evt, { title, isoUTC }) => {
    return new Promise((resolve, reject) => {
        loadAuth(async (auth) => {
            try {
                const result = await scheduleLiveStream(auth, title, isoUTC); // return {id,title,time}
                mainWindow?.webContents.send("scheduler/scheduled", result); // 🔔 notify UI
                resolve(result);
            } catch (e) {
                reject(e);
            }
        });
    });
});

// List upcoming
ipcMain.handle(
    "yt.listUpcoming",
    async () =>
        new Promise((resolve, reject) => {
            loadAuth(async (auth) => {
                try {
                    resolve(await listUpcomingBroadcasts(auth));
                } catch (e) {
                    reject(e);
                }
            });
        })
);

// Delete one
ipcMain.handle(
    "yt.deleteBroadcast",
    async (_evt, id) =>
        new Promise((resolve, reject) => {
            loadAuth(async (auth) => {
                try {
                    const out = await deleteBroadcast(auth, id);
                    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🗑️ Deleted broadcast ${id}`);
                    resolve(out);
                } catch (e) {
                    reject(e);
                }
            });
        })
);
