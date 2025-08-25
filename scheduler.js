// scheduler.js
import OBSWebSocket from "obs-websocket-js";
import cron from "node-cron";
import fs from "fs";
import moment from "moment-timezone";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";

const ACTIONS_LOG = "actions.log";
const oneOffTimers = new Map(); // actionId -> timeout

export const schedulerBus = new EventEmitter();

const LOG_FILE = "auto_obs.log";
const TIMEZONE = "America/New_York";

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

function log(msg) {
    const timestamp = moment().tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss");
    const line = `${timestamp} ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
    schedulerBus.emit("log", line.trim()); // forward to UI
}

async function probeOBSOnce() {
    const obs = new OBSWebSocket();
    try {
        await obs.connect("ws://localhost:4455", "");
        const ver = await obs.call("GetVersion");
        schedulerBus.emit("obs_status", { ok: true, version: ver?.obsVersion });
        await obs.disconnect();
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
// ───────── Cron + intervals ─────────
export function startScheduler() {
    if (started) return;
    started = true;

    log("📅 Scheduler started... (Eastern Time)");

    // 30s heartbeat (no log, just timestamp + UI)
    add(cron.schedule("*/30 * * * * *", logHeartbeat, { timezone: TIMEZONE }));

    // Heartbeat watchdog (every 10s checks for late beats and logs only on gap/recover)
    add(cron.schedule("*/10 * * * * *", checkHeartbeat, { timezone: TIMEZONE }));

    // 60s OBS probe
    add(cron.schedule("0 */1 * * * *", probeOBSOnce, { timezone: TIMEZONE }));

    // Optional Python health check
    if (ENABLE_PY_STATUS) {
        add(cron.schedule("*/30 * * * * *", readPythonHealth, { timezone: TIMEZONE }));
    }

    // initialize first beat so the watchdog has a baseline
    logHeartbeat();
}

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
        });
    }
    if (action.type === "setScene") {
        const scene = action.payload?.sceneName || "live";
        return withOBS("set_scene", async (obs) => {
            log(`${label} 🎬 SetCurrentProgramScene → ${scene}`);
            await obs.call("SetCurrentProgramScene", { sceneName: scene });
        });
    }
    if (action.type === "end") {
        return withOBS("end_stream", async (obs) => {
            log(`${label} 🛑 StopStream`);
            await obs.call("StopStream");
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
