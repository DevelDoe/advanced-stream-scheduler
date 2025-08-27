// main.js
import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import electronLog from "electron-log";
import { startScheduler, restartScheduler, schedulerBus } from "./scheduler.js";
import {
    loadAuth,
    scheduleLiveStream,
    listUpcomingBroadcasts,
    deleteBroadcast,
    bindBroadcastToDefaultStream,
    transitionBroadcast,
    setBroadcastThumbnail,
    listActiveBroadcasts,
    checkCredentialsSetup,
    validateCredentials,
} from "./youtube_api.js";
import os from "os";
import fs from "fs";
import path from "path";
import { scheduleOneOffAction, cancelOneOffAction } from "./scheduler.js"; // new exports we just added
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

console.log("[env] userData:", app.getPath("userData"));
console.log("[env] app.name:", app.name, " productName:", app.getName?.() ?? "(n/a)");
console.log("[env] appData:", app.getPath("appData"), " home:", os.homedir());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACTIONS_PATH = path.join(app.getPath("userData"), "actions.json");
const DEFAULTS_PATH = path.join(app.getPath("userData"), "upload_defaults.json");
const SCENE_FLOW_PATH = path.join(app.getPath("userData"), "scene_flow.json");
const RECURRING_PATH = path.join(app.getPath("userData"), "recurring.json");
const OBS_CONFIG_PATH = path.join(app.getPath("userData"), "obs_config.json");

let lastHB = Date.now();
let actions = [];
let mainWindow;
let applicationMenu; // Store reference to menu for updates

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

function loadActions() {
    try {
        return JSON.parse(fs.readFileSync(ACTIONS_PATH, "utf-8"));
    } catch {
        return [];
    }
}

function saveActions(list) {
    fs.writeFileSync(ACTIONS_PATH, JSON.stringify(list, null, 2));
}

// helper to load/save defaults
function loadDefaults() {
    try {
        return JSON.parse(fs.readFileSync(DEFAULTS_PATH, "utf-8"));
    } catch {
        return {};
    }
}
function saveDefaults(obj) {
    fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(obj || {}, null, 2));
}

function loadSceneFlow() {
    try {
        return JSON.parse(fs.readFileSync(SCENE_FLOW_PATH, "utf-8"));
    } catch {
        return { steps: [] };
    }
}
function saveSceneFlow(flow) {
    fs.writeFileSync(SCENE_FLOW_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), ...(flow || {}) }, null, 2));
}

// Find a broadcast's "base" time. Prefer the explicit "start" action; fallback to earliest action.
function getBroadcastBaseTimeISO(broadcastId) {
    const list = actions.filter((a) => a.broadcastId === broadcastId);
    if (!list.length) return null;
    const start = list.find((a) => a.type === "start");
    if (start?.at) return start.at;
    const earliest = list.reduce((m, a) => (new Date(a.at) < new Date(m.at) ? a : m), list[0]);
    return earliest?.at || null;
}

// Recompute and save flow template from a broadcast's actions (relative to base time).
function recomputeAndSaveFlowTemplate(broadcastId) {
    const baseISO = getBroadcastBaseTimeISO(broadcastId);
    if (!baseISO) return;
    const baseMs = new Date(baseISO).getTime();

    const steps = actions
        .filter((a) => a.broadcastId === broadcastId)
        .map((a) => ({
            offsetSec: Math.max(0, Math.round((new Date(a.at).getTime() - baseMs) / 1000)),
            type: a.type,
            payload: a.payload || {},
        }))
        .sort((a, b) => a.offsetSec - b.offsetSec);

    saveSceneFlow({ steps });
    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `💾 Saved scene flow template with ${steps.length} step(s).`);
}

// Apply saved flow to a new broadcast at scheduledStartISO
function applyFlowToBroadcast(broadcastId, scheduledStartISO) {
    const { steps = [] } = loadSceneFlow();
    if (!steps.length) return 0;

    const startMs = new Date(scheduledStartISO).getTime();
    let added = 0;

    for (const s of steps) {
        const atISO = new Date(startMs + s.offsetSec * 1000).toISOString();
        const action = {
            id: randomUUID(),
            broadcastId,
            at: atISO,
            type: s.type,
            payload: s.payload || {},
        };
        actions.push(action);
        scheduleOneOffAction(action);
        added++;
    }
    saveActions(actions);
    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `📋 Applied scene flow: scheduled ${added} action(s).`);
    return added;
}

// Try to transition broadcast to LIVE with retry
async function goLiveWithRetry(auth, broadcastId, maxRetries = 5, delayMs = 10_000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await transitionBroadcast(auth, broadcastId, "live");
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `📡 Transitioned broadcast ${broadcastId} → LIVE (attempt ${attempt})`);
            BrowserWindow.getAllWindows()[0]?.webContents.send("broadcast/status", { ok: true });
            return res.data;
        } catch (err) {
            const msg = err?.message || JSON.stringify(err);
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `⚠️ Transition attempt ${attempt} failed: ${msg}`);
            if (attempt < maxRetries) {
                await new Promise((res) => setTimeout(res, delayMs));
            } else {
                BrowserWindow.getAllWindows()[0]?.webContents.send("broadcast/status", { ok: false, error: msg });
                throw err;
            }
        }
    }
}

// recurring
function loadRecurring() {
    try {
        return JSON.parse(fs.readFileSync(RECURRING_PATH, "utf-8"));
    } catch {
        return {};
    }
}
function saveRecurring(obj) {
    fs.writeFileSync(RECURRING_PATH, JSON.stringify(obj, null, 2));
}

// OBS Configuration
function loadOBSConfig() {
    try {
        return JSON.parse(fs.readFileSync(OBS_CONFIG_PATH, "utf-8"));
    } catch {
        return {
            host: "localhost",
            port: 4455,
            password: "",
            enabled: true
        };
    }
}

function saveOBSConfig(config) {
    fs.writeFileSync(OBS_CONFIG_PATH, JSON.stringify(config, null, 2));
}



function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 950,
        webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.loadFile("index.html");
    
    // Create application menu
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'OBS Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        mainWindow?.webContents.send("open.obsSettings");
                    }
                },
                {
                    label: 'Google Credentials Setup',
                    accelerator: 'CmdOrCtrl+Shift+C',
                    click: () => {
                        mainWindow?.webContents.send("open.credentialsSetup");
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'Toggle Log Panel (Ctrl+L)',
                    accelerator: 'CmdOrCtrl+L',
                    click: () => {
                        mainWindow?.webContents.send("toggle.logPanel");
                    }
                },
                {
                    label: 'Open DevTools',
                    accelerator: 'F12',
                    click: () => {
                        mainWindow?.webContents.openDevTools();
                    }
                },
                {
                    label: 'Check for Updates',
                    click: () => {
                        mainWindow?.webContents.send("scheduler/log", "🔍 Checking for updates...");
                        autoUpdater.checkForUpdates();
                    }
                },

                {
                    label: 'Restart Scheduler',
                    click: () => {
                        try {
                            restartScheduler();
                            mainWindow?.webContents.send("scheduler/log", "🔄 Scheduler restarted manually");
                        } catch (e) {
                            mainWindow?.webContents.send("scheduler/log", `❌ Failed to restart scheduler: ${e?.message || e}`);
                        }
                    }
                }
            ]
        }
    ];
    
    applicationMenu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(applicationMenu);
}

function getNextOccurrence(daysOfWeek, baseDate) {
    let d = new Date(baseDate);
    d.setDate(d.getDate() + 1); // start with tomorrow
    while (!daysOfWeek.includes(d.getDay())) {
        d.setDate(d.getDate() + 1);
    }
    return d;
}

app.whenReady().then(async () => {
    // Configure auto-updater
    autoUpdater.logger = electronLog;
    autoUpdater.logger.transports.file.level = 'info';
    
    // Check for updates on startup (but don't auto-download)
    autoUpdater.checkForUpdates();
    
    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
        mainWindow?.webContents.send("scheduler/log", "🔍 Checking for updates...");
    });
    
    autoUpdater.on('update-available', (info) => {
        mainWindow?.webContents.send("scheduler/log", `📦 Update available: ${info.version}`);
        mainWindow?.webContents.send("update/available", info);
    });
    
    autoUpdater.on('update-not-available', () => {
        mainWindow?.webContents.send("scheduler/log", "✅ App is up to date");
    });
    
    autoUpdater.on('error', (err) => {
        mainWindow?.webContents.send("scheduler/log", `❌ Update error: ${err.message}`);
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
        const percent = Math.round(progressObj.percent);
        mainWindow?.webContents.send("scheduler/log", `📥 Downloading update: ${percent}%`);
        mainWindow?.webContents.send("update/progress", progressObj);
    });
    
    autoUpdater.on('update-downloaded', (info) => {
        mainWindow?.webContents.send("scheduler/log", `✅ Update downloaded: ${info.version}`);
        mainWindow?.webContents.send("update/downloaded", info);
        
        // Ask user if they want to install now
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Update ${info.version} has been downloaded. Would you like to install it now?`,
            detail: 'The app will restart after installation.',
            buttons: ['Install Now', 'Later'],
            defaultId: 0
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    // Send initial loading states
    mainWindow?.webContents.send("scheduler/loading", { component: "scheduler", status: "loading" });
    mainWindow?.webContents.send("scheduler/loading", { component: "youtube", status: "loading" });
    mainWindow?.webContents.send("scheduler/loading", { component: "obs", status: "loading" });
    mainWindow?.webContents.send("scheduler/loading", { component: "broadcast", status: "loading" });
    
    createWindow();
    
    // Start scheduler
    startScheduler();
    mainWindow?.webContents.send("scheduler/loading", { component: "scheduler", status: "ready" });
    mainWindow?.webContents.send("scheduler/log", "🚀 Application starting up...");
    
    // Load actions
    actions = loadActions();
    actions.forEach((action) => scheduleOneOffAction(action));
    mainWindow?.webContents.send("scheduler/log", `📋 Loaded ${actions.length} scheduled action(s)`);
    
    // Welcome message for new users
    mainWindow?.webContents.send("scheduler/log", "🎉 Welcome to Advanced Stream Scheduler!");
    mainWindow?.webContents.send("scheduler/log", "📝 First time? Go to File → Google Credentials Setup to get started.");

    // Forward scheduler bus events to renderer
    schedulerBus.on("log", (line) => mainWindow?.webContents.send("scheduler/log", line));
    schedulerBus.on("heartbeat", (hb) => mainWindow?.webContents.send("scheduler/heartbeat", hb));
    schedulerBus.on("obs_status", (st) => mainWindow?.webContents.send("scheduler/obs", st));
    schedulerBus.on("obs_ready", () => {
        mainWindow?.webContents.send("scheduler/loading", { component: "obs", status: "ready" });
        mainWindow?.webContents.send("scheduler/log", "✅ OBS WebSocket connection established");
    });



    // Note: Automatic cleanup removed - now only manual cleanup is allowed
    // This prevents accidentally deleting actions for live broadcasts that haven't been detected yet

    schedulerBus.on("action_executed", async (action) => {
        mainWindow?.webContents.send("scheduler/log", `✅ Executed action ${action.type} for broadcast ${action.broadcastId}`);

        if (action.type === "start") {
            // slight buffer so OBS is actually sending data
            setTimeout(() => {
                loadAuth(async (auth, error) => {
                    if (error) {
                        mainWindow?.webContents.send("scheduler/log", `❌ Go-live after start failed: ${error?.message || error}`);
                        return;
                    }
                    try {
                        await goLiveWithRetry(auth, action.broadcastId, /*retries*/ 5, /*delay*/ 10000);
                        mainWindow?.webContents.send("scheduler/log", `📡 Requested LIVE transition for ${action.broadcastId} (after OBS StartStream)`);
                    } catch (err) {
                        mainWindow?.webContents.send("scheduler/log", `❌ Go-live after start failed: ${err?.message || err}`);
                    }
                });
            }, 5000);
        }

        if (action.type === "end") {
            const recurringData = loadRecurring();
            const info = recurringData[action.broadcastId];
            if (info?.recurring) {
                loadAuth(async (auth, error) => {
                    if (error) {
                        mainWindow?.webContents.send("scheduler/log", `❌ Failed to schedule recurring: ${error?.message || error}`);
                        return;
                    }
                    const nextDate = getNextOccurrence(info.days, new Date());
                    const isoNext = nextDate.toISOString();

                    const { title, description, privacy, latency, thumbPath } = info.meta || {};
                    try {
                        const nextResult = await scheduleLiveStream(auth, {
                            title: title || "Recurring Stream",
                            startTime: isoNext,
                            description: description || "",
                            privacy: privacy || "public",
                            latency: latency || "ultraLow",
                        });
                        await bindBroadcastToDefaultStream(auth, nextResult.id);

                        // optional: re-upload same thumbnail if present
                        if (thumbPath) {
                            try {
                                await setBroadcastThumbnail(auth, nextResult.id, thumbPath);
                                mainWindow?.webContents.send("scheduler/log", `🖼️ Thumbnail uploaded for ${nextResult.id}`);
                            } catch (err) {
                                mainWindow?.webContents.send("scheduler/log", `⚠️ Next thumbnail upload failed: ${err.message}`);
                            }
                        }

                        // copy actions (relative offsets)
                        applyFlowToBroadcast(nextResult.id, isoNext);

                        // carry recurrence forward to the NEW broadcast id
                        recurringData[nextResult.id] = { ...info };
                        // optional: remove the old id’s entry
                        delete recurringData[action.broadcastId];
                        saveRecurring(recurringData);

                        mainWindow?.webContents.send("scheduler/log", `🔁 Next recurring scheduled: ${nextDate.toLocaleString()} (${nextResult.id})`);
                    } catch (err) {
                        mainWindow?.webContents.send("scheduler/log", `❌ Failed to schedule recurring: ${err.message}`);
                    }
                });
            }
        }
    });

    ipcMain.handle("defaults.load", async () => loadDefaults());
    ipcMain.handle("defaults.save", async (_evt, values) => {
        saveDefaults(values || {});
        return { ok: true };
    });

    // OBS Configuration handlers
    ipcMain.handle("obs.loadConfig", async () => loadOBSConfig());
    ipcMain.handle("obs.saveConfig", async (_evt, config) => {
        saveOBSConfig(config);
        // Restart scheduler to apply new OBS settings
        try {
            restartScheduler();
            mainWindow?.webContents.send("scheduler/log", "🔄 OBS settings updated - scheduler restarted");
        } catch (e) {
            mainWindow?.webContents.send("scheduler/log", `❌ Failed to restart scheduler: ${e?.message || e}`);
        }
        return { ok: true };
    });
    
    ipcMain.handle("obs.testConnection", async (_evt, config) => {
        try {
            const OBSWebSocket = (await import("obs-websocket-js")).default;
            const obs = new OBSWebSocket();
            
            const url = `ws://${config.host}:${config.port}`;
            await obs.connect(url, config.password || "");
            const ver = await obs.call("GetVersion");
            await obs.disconnect();
            
            return { ok: true, version: ver?.obsVersion };
        } catch (error) {
            return { ok: false, error: error?.message || String(error) };
        }
    });

    // File picker for thumbnails (returns absolute path)
    ipcMain.handle("thumb.pick", async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
        });
        if (canceled || !filePaths?.length) return { path: null, name: null };
        const p = filePaths[0];
        return { path: p, name: path.basename(p) }; // <- use path.basename, not require()
    });

    // File picker for credentials.json
    ipcMain.handle("credentials.pick", async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON Files", extensions: ["json"] }],
            title: "Select Google OAuth Credentials File (credentials.json)"
        });
        if (canceled || !filePaths?.length) return { path: null, name: null };
        const p = filePaths[0];
        return { path: p, name: path.basename(p) };
    });

    // Credentials management handlers
    ipcMain.handle("credentials.checkSetup", async () => {
        try {
            const result = await checkCredentialsSetup();
            return result;
        } catch (error) {
            return { setup: false, error: error.message };
        }
    });

    ipcMain.handle("credentials.validate", async (_evt, credentialsPath) => {
        try {
            return validateCredentials(credentialsPath);
        } catch (error) {
            return { valid: false, error: error.message };
        }
    });

    ipcMain.handle("credentials.copyToApp", async (_evt, sourcePath) => {
        try {
            const targetPath = path.join(app.getPath("userData"), "credentials.json");
            fs.copyFileSync(sourcePath, targetPath);
            return { ok: true, path: targetPath };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });

    ipcMain.handle("credentials.clearToken", async () => {
        try {
            const tokenPath = path.join(app.getPath("userData"), "token.json");
            if (fs.existsSync(tokenPath)) {
                fs.unlinkSync(tokenPath);
            }
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    });

    // Poll YouTube for currently-live broadcasts every 30s
    setInterval(() => {
        loadAuth(async (auth, error) => {
            if (error) {
                // Mark YouTube API as failed
                if (global.__youtubeReady !== false) {
                    global.__youtubeReady = false;
                    global.__autoCleanupTriggered = false; // Reset auto-cleanup trigger
                    mainWindow?.webContents.send("scheduler/loading", { component: "youtube", status: "error" });
                    
                    if (error.code === 'CREDENTIALS_MISSING') {
                        // Don't spam the log with credentials missing messages
                        if (!global.__credentialsMissingLogged) {
                            mainWindow?.webContents.send("scheduler/log", "ℹ️ Google OAuth credentials not configured yet. Go to File → Google Credentials Setup to get started.");
                            global.__credentialsMissingLogged = true;
                        }
                    } else {
                        mainWindow?.webContents.send("scheduler/log", `❌ YouTube API connection failed: ${error?.message || error}`);
                    }
                }
                
                BrowserWindow.getAllWindows()[0]?.webContents.send("broadcast/status", {
                    ok: false,
                    error: error?.message || String(error),
                });
                return;
            }

            try {
                const lives = await listActiveBroadcasts(auth);
                const liveCount = lives.length;
                const ids = lives.map((b) => b.id);

                // send a consolidated status (works with multiple parallel shows)
                BrowserWindow.getAllWindows()[0]?.webContents.send("broadcast/status", {
                    ok: true,
                    liveCount,
                    ids,
                });
                
                // Mark broadcast component as ready on first successful connection
                if (!global.__broadcastReady) {
                    global.__broadcastReady = true;
                    mainWindow?.webContents.send("scheduler/loading", { component: "broadcast", status: "ready" });
                }
                
                // Mark YouTube API as ready on first successful connection
                if (!global.__youtubeReady) {
                    global.__youtubeReady = true;
                    mainWindow?.webContents.send("scheduler/loading", { component: "youtube", status: "ready" });
                    mainWindow?.webContents.send("scheduler/log", "✅ YouTube API connection established");
                }
                


                // Auto-trigger cleanup when we have a complete picture of broadcast state
                if (global.__youtubeReady && !global.__autoCleanupTriggered) {
                    global.__autoCleanupTriggered = true;
                    // Small delay to ensure we have the latest broadcast data
                    setTimeout(async () => {
                        try {
                            mainWindow?.webContents.send("scheduler/log", "🧹 Auto-triggering cleanup after broadcast state confirmed...");
                            await cleanupOrphanedData();
                        } catch (error) {
                            mainWindow?.webContents.send("scheduler/log", `⚠️ Auto-cleanup failed: ${error?.message || error}`);
                        }
                    }, 2000); // 2 second delay to ensure broadcast data is stable
                }

                // optional: also log when count changes
                if (!global.__lastLiveCount || global.__lastLiveCount !== liveCount) {
                    global.__lastLiveCount = liveCount;
                    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🟢 Live broadcasts: ${liveCount}${liveCount ? " — " + ids.join(", ") : ""}`);
                }
            } catch (err) {
                // Mark YouTube API as failed
                if (global.__youtubeReady !== false) {
                    global.__youtubeReady = false;
                    global.__autoCleanupTriggered = false; // Reset auto-cleanup trigger
                    mainWindow?.webContents.send("scheduler/loading", { component: "youtube", status: "error" });
                    mainWindow?.webContents.send("scheduler/log", `❌ YouTube API connection failed: ${err?.message || err}`);
                }
                
                BrowserWindow.getAllWindows()[0]?.webContents.send("broadcast/status", {
                    ok: false,
                    error: err?.message || String(err),
                });
            }
        });
    }, 30_000);



    // Note: Periodic automatic cleanup removed - now only manual cleanup is allowed
    // This prevents accidentally deleting actions for live broadcasts

    // Periodic update check (every 6 hours)
    setInterval(() => {
        autoUpdater.checkForUpdates();
    }, 6 * 60 * 60 * 1000);
});

// List upcoming
ipcMain.handle(
    "yt.listUpcoming",
    async () =>
        new Promise((resolve, reject) => {
            loadAuth(async (auth, error) => {
                if (error) {
                    reject(error);
                    return;
                }
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
            loadAuth(async (auth, error) => {
                if (error) {
                    reject(error);
                    return;
                }
                try {
                    // ✅ define send first
                    const send = (m) => BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", m);

                    const out = await deleteBroadcast(auth, id);

                    // cancel & remove any actions for this broadcast
                    const toRemove = actions.filter((a) => a.broadcastId === id);
                    for (const a of toRemove) {
                        try {
                            cancelOneOffAction(a.id);
                        } catch {}
                    }
                    const removedCount = toRemove.length;
                    actions = actions.filter((a) => a.broadcastId !== id);
                    saveActions(actions);

                    // ✅ recurring cleanup (now send is defined)
                    try {
                        const rec = loadRecurring();
                        if (rec[id]) {
                            delete rec[id];
                            saveRecurring(rec);
                            send(`🧹 Removed recurring rule for ${id}`);
                        }
                    } catch (err) {
                        send(`⚠️ Failed to update recurring store for ${id}: ${err?.message || err}`);
                    }

                    send(`🗑️ Deleted broadcast ${id}`);
                    if (removedCount) {
                        send(`🧹 Removed ${removedCount} scheduled action(s) linked to ${id}`);
                    }

                    resolve(out);
                } catch (e) {
                    reject(e);
                }
            });
        })
);

ipcMain.handle("scheduleStream", async (_evt, payload) => {
    // payload: { title, isoUTC, description, privacy, latency, thumbPath }
    return new Promise((resolve, reject) => {
        loadAuth(async (auth, error) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                const defaults = loadDefaults();
                const { title, description, privacy, latency, recurring, days } = payload || {};
                // use new thumb if provided, else reuse last saved
                const thumbPath = payload?.thumbPath || defaults?.thumbPath;
                console.log("[scheduleStream] thumbPath received:", thumbPath);
                BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", thumbPath ? `🗂 Using thumbnail: ${thumbPath}` : "ℹ️ No thumbnail in payload/defaults");

                // 1) create broadcast (rich fields)
                const result = await scheduleLiveStream(auth, {
                    title,
                    startTime: payload.isoUTC,
                    description,
                    privacy,
                    latency,
                });

                // 2) bind to reusable stream (for RTMP/key)
                const bindInfo = await bindBroadcastToDefaultStream(auth, result.id);

                // 2.5) upload thumbnail (optional)
                if (thumbPath) {
                    try {
                        await setBroadcastThumbnail(auth, result.id, thumbPath);
                        BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🖼️ Thumbnail uploaded for ${result.id}`);
                    } catch (thumbErr) {
                        const msg = thumbErr?.message || String(thumbErr);
                        BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `⚠️ Thumbnail upload failed: ${msg}`);
                    }
                } else {
                    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `ℹ️ No thumbnail provided; skipping upload`);
                }

                // 3) send payload back to UI (includes RTMP/key)
                const scheduledPayload = { ...result, ...bindInfo };
                mainWindow?.webContents.send("scheduler/scheduled", scheduledPayload);

                // 3.5) recurring
                if (recurring) {
                    const recurringData = loadRecurring();
                    recurringData[result.id] = {
                        recurring: true,
                        days,
                        baseTime: payload.isoUTC,
                        // keep the metadata to clone:
                        meta: { title, description, privacy, latency, thumbPath },
                    };
                    saveRecurring(recurringData);
                    mainWindow?.webContents.send("scheduler/log", `🔁 Recurring enabled for ${result.id} (${days.join(",")})`);
                }

                // 4) apply saved flow (relative offsets), or ensure one START
                const applied = applyFlowToBroadcast(result.id, result.time);
                let hasStartInTemplate = false;
                try {
                    const flow = loadSceneFlow();
                    hasStartInTemplate = Array.isArray(flow?.steps) && flow.steps.some((s) => s?.type === "start");
                } catch {}
                if (!applied || !hasStartInTemplate) {
                    const defaultStart = {
                        id: randomUUID(),
                        broadcastId: result.id,
                        at: result.time,
                        type: "start",
                        payload: { sceneName: "intro" },
                    };
                    actions.push(defaultStart);
                    saveActions(actions);
                    scheduleOneOffAction(defaultStart);
                    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `📌 Default action added: START @ ${result.time} for ${result.id}`);
                }

                // 5) persist latest defaults INCLUDING thumbnail path
                saveDefaults({ title, description, privacy, latency, thumbPath });

                resolve(scheduledPayload);
            } catch (e) {
                reject(e);
            }
        });
    });
});

// List all actions for a broadcast
ipcMain.handle("actions.list", async (_evt, { broadcastId }) => {
    return actions.filter((a) => a.broadcastId === broadcastId);
});

// Add one action
ipcMain.handle("actions.add", async (_evt, { broadcastId, atISO, type, payload }) => {
    const action = { id: randomUUID(), broadcastId, at: atISO, type, payload };
    actions.push(action);
    saveActions(actions);
    scheduleOneOffAction(action);
    BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `➕ Action added ${action.id} (${type}) @ ${atISO}`);

    // 👇 keep the flow fresh
    recomputeAndSaveFlowTemplate(broadcastId);

    return action;
});

// Delete one
ipcMain.handle("actions.delete", async (_evt, { id }) => {
    const idx = actions.findIndex((a) => a.id === id);
    if (idx >= 0) {
        const [removed] = actions.splice(idx, 1);
        saveActions(actions);
        cancelOneOffAction(id);
        BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🗑️ Action removed ${id}`);

        // 👇 keep the flow fresh (use the removed's broadcastId)
        if (removed?.broadcastId) recomputeAndSaveFlowTemplate(removed.broadcastId);

        return removed;
    }
    throw new Error("not_found");
});

// IPC from renderer: request to go live
ipcMain.handle("yt.goLive", async (_evt, broadcastId) => {
    return new Promise((resolve, reject) => {
        loadAuth(async (auth, error) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                const res = await goLiveWithRetry(auth, broadcastId);
                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    });
});



// IPC from renderer: check for updates
ipcMain.handle("update.check", async () => {
    try {
        autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error?.message || error };
    }
});

// IPC from renderer: download update
ipcMain.handle("update.download", async () => {
    try {
        autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error?.message || error };
    }
});

    // IPC from renderer: install update
    ipcMain.handle("update.install", async () => {
        try {
            autoUpdater.quitAndInstall();
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error?.message || error };
        }
    });

    // IPC from renderer: toggle log panel
    ipcMain.handle("toggle.logPanel", async () => {
        mainWindow?.webContents.send("toggle.logPanel");
        return { ok: true };
    });

// Clean up orphaned actions and recurring data
async function cleanupOrphanedData() {
    try {
        // Get scheduled broadcasts from YouTube API
        const auth = await new Promise((resolve, reject) => {
            loadAuth((auth, error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(auth);
                }
            });
        });
        
        const scheduledBroadcasts = await listUpcomingBroadcasts(auth);
        const scheduledIds = new Set(scheduledBroadcasts.map(b => b.id));
        
        // Clean up orphaned actions
        const originalActionCount = actions.length;
        const orphanedActions = actions.filter(action => !scheduledIds.has(action.broadcastId));
        
        if (orphanedActions.length > 0) {
            // Cancel any scheduled timers for orphaned actions
            for (const action of orphanedActions) {
                try {
                    cancelOneOffAction(action.id);
                } catch {}
            }
            
            // Remove orphaned actions from memory and storage
            actions = actions.filter(action => scheduledIds.has(action.broadcastId));
            saveActions(actions);
            
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🧹 Cleaned up ${orphanedActions.length} orphaned action(s) for non-existent broadcasts`);
        }
        
        // Clean up orphaned recurring data
        const recurringData = loadRecurring();
        const orphanedRecurring = Object.keys(recurringData).filter(id => !scheduledIds.has(id));
        
        if (orphanedRecurring.length > 0) {
            for (const id of orphanedRecurring) {
                delete recurringData[id];
            }
            saveRecurring(recurringData);
            
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `🧹 Cleaned up ${orphanedRecurring.length} orphaned recurring rule(s) for non-existent broadcasts`);
        }
        
        if (orphanedActions.length > 0 || orphanedRecurring.length > 0) {
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `✅ Cleanup complete: removed ${orphanedActions.length} actions and ${orphanedRecurring.length} recurring rules`);
        } else {
            BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `✅ No orphaned data found`);
        }
        
    } catch (error) {
        BrowserWindow.getAllWindows()[0]?.webContents.send("scheduler/log", `⚠️ Cleanup failed: ${error?.message || error}`);
    }
}
