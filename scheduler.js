// scheduler.js
import OBSWebSocket from "obs-websocket-js";
import cron from "node-cron";
import fs from "fs";
import moment from "moment-timezone";
import { EventEmitter } from "events";

export const schedulerBus = new EventEmitter();

const LOG_FILE = "auto_obs.log";
const TIMEZONE = "America/New_York";

// optional python health probe toggle
const ENABLE_PY_STATUS = false;
const PY_HEALTH_FILE = process.env.PY_AUTOMATER_HEALTH || "obs_py_health.json";
const PY_STALE_SECS = 90;

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
    schedulerBus.emit("heartbeat", { at: Date.now() });
    log("⏱️ Heartbeat: Scheduler is alive.");
}

// ───────── Cron + intervals ─────────
export function startScheduler() {
    if (started) return; // idempotent
    started = true;

    log("📅 Scheduler started... (Eastern Time)");

    add(cron.schedule("0 0 * * 1-5", switchToIntro, { timezone: TIMEZONE }));
    add(cron.schedule("0 3 * * 1", startStream, { timezone: TIMEZONE }));
    add(cron.schedule("55 3 * * 1-5", switchToLive, { timezone: TIMEZONE }));
    add(cron.schedule("0 20 * * 1-5", switchToEnd, { timezone: TIMEZONE }));
    add(cron.schedule("15 20 * * 5", endStream, { timezone: TIMEZONE }));

    // 30s heartbeat
    add(cron.schedule("*/30 * * * * *", logHeartbeat, { timezone: TIMEZONE }));
    // 60s OBS probe
    add(cron.schedule("0 */1 * * * *", probeOBSOnce, { timezone: TIMEZONE }));
    // Optional Python health check
    if (ENABLE_PY_STATUS) {
        add(cron.schedule("*/30 * * * * *", readPythonHealth, { timezone: TIMEZONE }));
    }
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

export function restartScheduler() {
    stopScheduler();
    startScheduler();
}
