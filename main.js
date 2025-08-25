// main.js
import { app, BrowserWindow, ipcMain } from "electron";
import { startScheduler, restartScheduler, schedulerBus } from "./scheduler.js";
import { loadAuth, scheduleLiveStream, listUpcomingBroadcasts, deleteBroadcast, bindBroadcastToDefaultStream, transitionBroadcast } from "./youtube_api.js";

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

ipcMain.handle("scheduleStream", async (_evt, { title, isoUTC }) => {
    return new Promise((resolve, reject) => {
        loadAuth(async (auth) => {
            try {
                const result = await scheduleLiveStream(auth, title, isoUTC); // {id,title,time}
                mainWindow?.webContents.send("scheduler/scheduled", result);

                // --- NEW: schedule auto-transition ---
                const when = new Date(result.time).getTime();
                // Buffer so OBS has started pushing (adjust if your cron starts OBS earlier/later)
                const delay = Math.max(0, when - Date.now() + 20_000);

                setTimeout(() => {
                    loadAuth(async (auth2) => {
                        const send = (m) => BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", m);

                        // 1) Bind broadcast → reusable stream (idempotent)
                        try {
                            const sid = await bindBroadcastToDefaultStream(auth2, result.id);
                            send(`🔗 Bound broadcast ${result.id} → stream ${sid}`);
                        } catch (e) {
                            send(`❌ Bind failed for ${result.id}: ${e?.message || e}`);
                            return;
                        }

                        // 2) Move to TESTING (small retry loop)
                        let testAttempts = 0;
                        const maxTestAttempts = 3;

                        async function goTesting() {
                            testAttempts++;
                            try {
                                await transitionBroadcast(auth2, result.id, "testing");
                                send(`🧪 Broadcast ${result.id} → TESTING`);
                                setTimeout(goLive, 5000); // small settle before live
                            } catch (err) {
                                const msg = err?.message || JSON.stringify(err);
                                send(`⚠️ Testing transition failed: ${msg} — attempt ${testAttempts}/${maxTestAttempts}`);
                                if (/invalid|not.+ready|ingest|transition/i.test(msg) && testAttempts < maxTestAttempts) {
                                    setTimeout(goTesting, 10_000);
                                } else {
                                    send(`❌ Gave up transitioning ${result.id} to TESTING`);
                                }
                            }
                        }

                        // helpers near goLive (once):
                        const NOT_READY = /invalid|not.+ready|ingest|transition|badState|failed/i;
                        const RATE_LIMIT = /rateLimit|quota|userRateLimitExceeded|403|429/i;

                        async function getBroadcastStatus(auth, id) {
                            const yt = google.youtube({ version: "v3", auth });
                            const res = await yt.liveBroadcasts.list({ part: "id,status", id });
                            const b = (res.data.items || [])[0];
                            return b?.status?.lifeCycleStatus; // "created" | "ready" | "testing" | "live" | "complete" ...
                        }

                        // 3) Move to LIVE (retry loop)
                        let liveAttempts = 0;
                        const maxLiveAttempts = 60; // ~10 min with ramped backoff

                        async function goLive() {
                            liveAttempts++;

                            // Guard: if it’s already live/complete, stop retrying.
                            try {
                                const lc = await getBroadcastStatus(auth2, result.id);
                                if (lc === "live") {
                                    send(`🟢 Already LIVE (lifeCycleStatus=live). Stopping retries.`);
                                    return;
                                }
                                if (lc === "complete") {
                                    send(`🏁 Broadcast is COMPLETE. No further transitions.`);
                                    return;
                                }
                            } catch (e) {
                                // non-fatal: status check failed; continue to try live
                            }

                            try {
                                await transitionBroadcast(auth2, result.id, "live");
                                send(`✅ … LIVE`);
                            } catch (err) {
                                const msg = err?.message || JSON.stringify(err);

                                // Stop if the broadcast was deleted / not found
                                if (/not\s*found|404/i.test(msg)) {
                                    send(`🛑 Broadcast no longer exists (404). Aborting retries.`);
                                    return;
                                }

                                // Choose backoff: longer if quota/rate-limit smells, else ramp
                                let wait = Math.min(30_000, 5_000 * liveAttempts);
                                if (RATE_LIMIT.test(msg)) wait = Math.max(wait, 60_000); // cool down harder

                                if (NOT_READY.test(msg) && liveAttempts < maxLiveAttempts) {
                                    send(`⚠️ Live failed: ${msg} — retry ${liveAttempts}/${maxLiveAttempts} in ${Math.round(wait / 1000)}s`);
                                    setTimeout(goLive, wait);
                                } else {
                                    send(`❌ Gave up transitioning ${result.id} to LIVE after ${liveAttempts} attempts. Last error: ${msg}`);
                                }
                            }
                        }

                        // kick off testing shortly after the delay window fires
                        setTimeout(goTesting, 2000);
                    });
                }, delay);
                // --- end NEW ---

                resolve(result);
            } catch (e) {
                reject(e);
            }
        });
    });
});
