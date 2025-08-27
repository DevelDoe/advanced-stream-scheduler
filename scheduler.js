// scheduler.js
import OBSWebSocket from "obs-websocket-js";
import cron from "node-cron";
import fs from "fs";
import { EventEmitter } from "events";

const ACTIONS_LOG = "actions.log";
const oneOffTimers = new Map(); // actionId -> timeout

export const schedulerBus = new EventEmitter();

const LOG_FILE = "auto_obs.log";
let TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// optional python health probe toggle
const ENABLE_PY_STATUS = false;
const PY_HEALTH_FILE = process.env.PY_AUTOMATER_HEALTH || "obs_py_health.json";
const PY_STALE_SECS = 90;

const HB_EXPECTED_SEC = 30; // should match your cron beat "*/30 * * * * *"
const HB_GRACE_SEC = 15; // how long after expected before we alert
let lastHeartbeatAt = 0;
let heartbeatGapOpen = false;

// ───────── internal state for start/stop/restart ─────────
let started = false;
let jobs = []; // holds cron tasks so we can stop them

function add(job) {
    jobs.push(job);
    return job;
}

function ts(tz = TIMEZONE) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(new Date());
    const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
}

function log(msg) {
    const line = `${ts()} ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
    schedulerBus.emit("log", line.trim());
}

async function probeOBSOnce() {
    const obs = new OBSWebSocket();
    try {
        await obs.connect("ws://localhost:4455", "");
        const ver = await obs.call("GetVersion");
        schedulerBus.emit("obs_status", { ok: true, version: ver?.obsVersion });
        await obs.disconnect();
        
        // Mark OBS as ready on first successful connection
        if (!global.__obsReady) {
            global.__obsReady = true;
            schedulerBus.emit("obs_ready");
        }
    } catch (e) {
        schedulerBus.emit("obs_status", { ok: false, error: e?.message || String(e) });
    }
}

function readPythonHealth() {
    try {
        const raw = fs.readFileSync(PY_HEALTH_FILE, "utf-8");
        const j = JSON.parse(raw);
        const ts = j.ts || j.timestamp || j.time;
        const age = (Date.now() - new Date(ts).getTime()) / 1000;
        const ok = j.ok !== false && age <= PY_STALE_SECS;
        schedulerBus.emit("py_status", { ok, age, last: ts });
    } catch {
        schedulerBus.emit("py_status", { ok: false, error: "missing", last: null });
    }
}

async function withOBS(taskName, fn) {
    const obs = new OBSWebSocket();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 10_000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await obs.connect("ws://localhost:4455", "");
            log(`[${taskName}] [Attempt ${attempt}] ✅ Connected to OBS`);
            await fn(obs);
            await obs.disconnect();
            schedulerBus.emit("obs_status", { ok: true }); // refresh UI
            return;
        } catch (err) {
            log(`[${taskName}] [Attempt ${attempt}] ❌ OBS not ready: ${err.message}`);
            await new Promise((res) => setTimeout(res, RETRY_DELAY));
        }
    }
    log(`[${taskName}] ❗ Failed to connect to OBS after ${MAX_RETRIES} attempts`);
    schedulerBus.emit("obs_status", { ok: false, error: "connect-failed" });
}

// add this helper:
function checkHeartbeat() {
    if (!lastHeartbeatAt) return; // not started yet
    const ageSec = (Date.now() - lastHeartbeatAt) / 1000;
    const threshold = HB_EXPECTED_SEC + HB_GRACE_SEC;
    const stale = ageSec > threshold;

    if (stale && !heartbeatGapOpen) {
        log(`⛔ No heartbeat for ${Math.round(ageSec)}s (threshold ${threshold}s).`);
        heartbeatGapOpen = true;
        schedulerBus.emit("heartbeat_stale", { ageSec });
    } else if (!stale && heartbeatGapOpen) {
        // recovered
        log(`✅ Heartbeat recovered after ${Math.round(ageSec)}s without beats.`);
        heartbeatGapOpen = false;
        schedulerBus.emit("heartbeat_recovered", { ageSec });
    }
}

// ───────── Scenes/Streaming ─────────
export function startStream() {
    withOBS("start_stream", async (obs) => {
        log("🚀 Job 'start_stream' triggered");
        await obs.call("SetCurrentProgramScene", { sceneName: "intro" });
        await obs.call("StartStream");
    });
}
export function switchToIntro() {
    withOBS("switch_to_intro", async (obs) => {
        log("🎬 Job 'switch_to_intro' triggered");
        await obs.call("SetCurrentProgramScene", { sceneName: "intro" });
    });
}
export function switchToLive() {
    withOBS("switch_to_live", async (obs) => {
        log("🎥 Job 'switch_to_live' triggered");
        await obs.call("SetCurrentProgramScene", { sceneName: "live" });
    });
}
export function switchToEnd() {
    withOBS("switch_to_end", async (obs) => {
        log("🏁 Job 'switch_to_end' triggered");
        await obs.call("SetCurrentProgramScene", { sceneName: "end" });
    });
}
export function endStream() {
    withOBS("end_stream", async (obs) => {
        log("🛑 Job 'end_stream' triggered");
        await obs.call("StopStream");
    });
}

function logHeartbeat() {
    lastHeartbeatAt = Date.now();
    schedulerBus.emit("heartbeat", { at: lastHeartbeatAt });
}

// ---- Local timezone change watcher (single interval, debounced) ----
let tzChangeLock = false;

// ───────── Cron + intervals ─────────
export function startScheduler() {
    if (started) return;
    started = true;

    log(`📅 Scheduler started... (Local: ${TIMEZONE})`);
    schedulerBus.emit("timezone", { tz: TIMEZONE }); // <— here once

    add(cron.schedule("*/30 * * * * *", logHeartbeat, { timezone: TIMEZONE }));
    add(cron.schedule("*/10 * * * * *", checkHeartbeat, { timezone: TIMEZONE }));
    add(cron.schedule("0 */1 * * * *", probeOBSOnce, { timezone: TIMEZONE }));

    if (ENABLE_PY_STATUS) {
        add(cron.schedule("*/30 * * * * *", readPythonHealth, { timezone: TIMEZONE }));
    }

    logHeartbeat();
}

// TZ watcher (you already have it)
const tzTimer = setInterval(() => {
    const guessed = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    if (!tzChangeLock && guessed !== TIMEZONE) {
        tzChangeLock = true;
        TIMEZONE = guessed;
        log(`🕒 Timezone changed to ${TIMEZONE}; restarting scheduler…`);
        schedulerBus.emit("timezone", { tz: TIMEZONE }); // <— emit on change
        restartScheduler();
        setTimeout(() => (tzChangeLock = false), 5000);
    }
}, 60_000);

export function stopScheduler() {
    jobs.forEach((j) => {
        try {
            j.stop();
        } catch {}
    });
    jobs = [];
    started = false;
}

function msUntil(tsISO) {
    return Math.max(0, new Date(tsISO).getTime() - Date.now());
}

function runObsAction(action) {
    const label = `[action:${action.type}]`;

    if (action.type === "start") {
        return withOBS("start_stream", async (obs) => {
            log(`${label} 🚀 StartStream`);
            await obs.call("SetCurrentProgramScene", { sceneName: action.payload?.sceneName || "intro" });
            await obs.call("StartStream");
            schedulerBus.emit("action_executed", action); // 👈 emit start
        });
    }
    if (action.type === "setScene") {
        const scene = action.payload?.sceneName || "live";
        return withOBS("set_scene", async (obs) => {
            log(`${label} 🎬 SetCurrentProgramScene → ${scene}`);
            await obs.call("SetCurrentProgramScene", { sceneName: scene });
            schedulerBus.emit("action_executed", action); // 👈 emit setScene
        });
    }
    if (action.type === "end") {
        return withOBS("end_stream", async (obs) => {
            log(`${label} 🛑 StopStream`);
            await obs.call("StopStream");
            schedulerBus.emit("action_executed", action); // 👈 emit end
        });
    }

    log(`${label} ⚠️ Unknown type`);
}

export function scheduleOneOffAction(action) {
    // clear existing timer if any
    const existing = oneOffTimers.get(action.id);
    if (existing) clearTimeout(existing);

    const delay = msUntil(action.at);
    const t = setTimeout(async () => {
        try {
            await runObsAction(action);
            fs.appendFileSync(ACTIONS_LOG, `${new Date().toISOString()} executed ${action.id}\n`);
        } catch (e) {
            log(`[action:${action.type}] ❌ Error: ${e?.message || e}`);
        } finally {
            oneOffTimers.delete(action.id); // execute once
        }
    }, delay);

    oneOffTimers.set(action.id, t);
    log(`⏲️ Scheduled action ${action.id} (${action.type}) in ${Math.round(delay / 1000)}s`);
}

export function cancelOneOffAction(actionId) {
    const t = oneOffTimers.get(actionId);
    if (t) {
        clearTimeout(t);
        oneOffTimers.delete(actionId);
        log(`🗑️ Cancelled scheduled action ${actionId}`);
    }
}

export function restartScheduler() {
    stopScheduler();
    startScheduler();
}

// clean up on exit (polish)
process.on("beforeExit", () => clearInterval(tzTimer));
