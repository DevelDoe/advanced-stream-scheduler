// renderer.js
function setBadge(el, ok, text) {
    if (!el) return;
    el.textContent = text;
    el.style.background = ok ? "#1e8e3e" : "#8e1e1e";
}
function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = "1";
    setTimeout(() => (t.style.opacity = "0"), 2200);
}
function rowTemplate(item) {
    const when = item.time ? new Date(item.time).toLocaleString() : "—";
    return `
    <li data-id="${item.id}" style="display:flex;flex-direction:column;gap:8px;margin:6px 0;padding:8px;border-radius:8px;background:#191919;">
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title || "—"}</div>
          <div style="opacity:.8">${when} · ${item.privacy || ""}</div>
          <code style="opacity:.6">${item.id}</code>
        </div>
        <button class="deleteBroadcastBtn">Delete</button>
        <button class="clearActionsBtn">Clear actions</button>
        <button class="addActionBtn">Add Action</button>
      </div>
      <div class="actionsContainer" style="display:flex;gap:8px;align-items:center;">
        <select class="actionType">
          <option value="setScene" selected>Change Scene</option>
          <option value="end">End Stream</option>
        </select>
        <input class="actionTime" type="datetime-local" />
        <input class="sceneInput" placeholder="scene name" />
        <button class="saveActionBtn">Save</button>
      </div>
      <ul class="existingActions" style="list-style:none;margin:0;padding:0;"></ul>
    </li>`;
}

window.addEventListener("DOMContentLoaded", () => {
    // ── refs ───────────────────────────────────────────────────────────────
    const button = document.getElementById("scheduleBtn");
    const logEl = document.getElementById("log");
    const hbEl = document.getElementById("hb");
    const obsEl = document.getElementById("obsBadge");
    const ytEl = document.getElementById("ytBadge");
    const schedEl = document.getElementById("schedBadge");
    const listEl = document.getElementById("upcoming");
    const refreshBtn = document.getElementById("refreshBtn");

    const titleEl = document.getElementById("title");
    const startTimeEl = document.getElementById("startTime");
    const descEl = document.getElementById("description");
    const visEl = document.getElementById("visibility");
    const latencyEl = document.getElementById("latency");

    const thumbPickBtn = document.getElementById("thumbPickBtn");
    const thumbNameEl = document.getElementById("thumbName");

    const broadcastEl = document.getElementById("broadcastBadge");

    const recurringChk = document.getElementById("recurringChk");
    const recurringDaysBox = document.getElementById("recurringDays");

    const schedBadge = document.getElementById("schedBadge");

    recurringDaysBox.style.display = recurringChk.checked ? "block" : "none";

    recurringChk?.addEventListener("change", () => {
        recurringDaysBox.style.display = recurringChk.checked ? "block" : "none";
    });

    let isEditing = false;
    let lastHB = 0;
    let chosenThumbPath = null;
    let lastThumbPath = null;

    const baseName = (p) => (p ? p.split(/[\\/]/).pop() : "");

    // ── defaults ───────────────────────────────────────────────────────────
    (async () => {
        try {
            const d = await window.electronAPI.loadDefaults();
            if (d.title) titleEl.value = d.title;
            if (typeof d.description === "string") descEl.value = d.description;
            if (d.privacy) visEl.value = d.privacy;
            if (d.latency) latencyEl.value = d.latency;

            if (d.thumbPath) {
                lastThumbPath = d.thumbPath;
                chosenThumbPath = d.thumbPath;
                thumbNameEl.textContent = `Using last: ${baseName(chosenThumbPath)}`;
            } else {
                thumbNameEl.textContent = "No previous thumbnail";
            }
        } catch {}
    })();

    // ── thumbnail picker ───────────────────────────────────────────────────
    thumbPickBtn?.addEventListener("click", async () => {
        try {
            const picked = await window.electronAPI.pickThumbnail(); // exposed in preload
            if (picked?.path) {
                chosenThumbPath = picked.path;
                thumbNameEl.textContent = `Selected: ${picked.name}`;
            }
        } catch (err) {
            console.error("thumb pick failed:", err);
        }
    });

    // ── schedule ───────────────────────────────────────────────────────────
    button?.addEventListener("click", async () => {
        const title = titleEl.value;
        const localTime = startTimeEl.value;
        if (!localTime) return toast("Pick a start time.");
        const isoUTC = new Date(localTime).toISOString();

        const description = descEl.value || "";
        const privacy = visEl.value || "public";
        const latency = latencyEl.value || "ultraLow";
        const thumbPathToUse = chosenThumbPath || lastThumbPath || undefined;

        // ✅ read these at click-time
        const recurring = document.getElementById("recurringChk").checked;
        const days = [...document.querySelectorAll("#recurringDays input:checked")].map((cb) => Number(cb.value));

        try {
            await window.electronAPI.scheduleStream(title, isoUTC, {
                description,
                privacy,
                latency,
                thumbPath: thumbPathToUse,
                recurring,
                days,
            });
        } catch (e) {
            setBadge(ytEl, false, "YouTube: Error");
            toast("❌ Schedule error (check logs)");
            console.error(e);
        }
    });

    window.electronAPI.onTimezone(({ tz }) => {
        if (!schedBadge) return;
        schedBadge.title = `Automation clock (local: ${tz}). Green = running.`;
        schedBadge.textContent = `OBS Automation: OK (${tz})`; // or keep your existing label
    });

    // ── events from main/scheduler ─────────────────────────────────────────
    window.electronAPI.onScheduled(({ id, title, time, streamId, ingestionAddress, streamName }) => {
        setBadge(ytEl, true, "YouTube Scheduler: Scheduled");
        toast(`📅 Scheduled: ${title} — ${new Date(time).toLocaleString()}`);
        if (logEl) {
            logEl.textContent += `SCHEDULED #${id} (stream ${streamId}) @ ${time}\n`;
            if (ingestionAddress && streamName) {
                logEl.textContent += `RTMP: ${ingestionAddress}\nKEY:  ${streamName}\n`;
            }
            logEl.scrollTop = logEl.scrollHeight;
        }
        refreshUpcoming(true);
    });

    window.electronAPI.onLog((line) => {
        if (logEl) {
            logEl.textContent += line + "\n";
            logEl.scrollTop = logEl.scrollHeight;
        }
    });

    window.electronAPI.onHeartbeat(({ at }) => {
        lastHB = at;
        if (hbEl) hbEl.textContent = "HB: " + new Date(at).toLocaleTimeString();
        setBadge(schedEl, true, "OBS Automation: OK");
    });

    setInterval(() => {
        if (!lastHB) return;
        const stale = Date.now() - lastHB > 65_000;
        if (stale) {
            setBadge(schedEl, false, "OBS Automation: DOWN");
            toast("⚠️ OBS Automation heartbeat stale");
        }
    }, 10_000);

    window.electronAPI.onObs((st) => {
        if (st?.ok) setBadge(obsEl, true, `OBS: OK${st.version ? " " + st.version : ""}`);
        else setBadge(obsEl, false, "OBS: DOWN");
    });

    // ── broadcast badge ────────────────────────────────────────────────────
    window.electronAPI.onBroadcast((st) => {
        if (!st?.ok) {
            setBadge(broadcastEl, false, `Broadcast: ${st?.error || "FAILED"}`);
            return;
        }
        // Prefer polled counts when present
        if (typeof st.liveCount === "number") {
            const label = `LIVE (${st.liveCount})`; // always show count
            setBadge(broadcastEl, st.liveCount > 0, `Broadcast: ${st.liveCount > 0 ? label : "OFFLINE"}`);
        } else {
            // one-off success (e.g., immediately after goLiveWithRetry)
            setBadge(broadcastEl, true, "Broadcast: LIVE (1)");
        }
    });

    // ── list + actions ─────────────────────────────────────────────────────
    async function refreshUpcoming(force = false) {
        if (isEditing && !force) return true;
        try {
            const items = await window.electronAPI.listUpcoming();
            if (listEl) {
                listEl.innerHTML = items.map(rowTemplate).join("");
                for (const it of items) {
                    const li = listEl.querySelector(`li[data-id="${it.id}"]`);
                    const ul = li?.querySelector(".existingActions");
                    if (!li || !ul) continue;
                    try {
                        const acts = await window.electronAPI.actionsList(it.id);
                        ul.innerHTML = (acts || [])
                            .sort((a, b) => new Date(a.at) - new Date(b.at))
                            .map(
                                (a) => `<li data-aid="${a.id}" style="display:flex;gap:6px;align-items:center;">
                    <span>${new Date(a.at).toLocaleString()} — ${a.type}${a.payload?.sceneName ? " (" + a.payload.sceneName + ")" : ""}</span>
                    <button class="delActionBtn">x</button>
                  </li>`
                            )
                            .join("");
                    } catch (e) {
                        console.warn("Failed to load actions for", it.id, e);
                    }
                }
            }
            return true;
        } catch (e) {
            console.error(e);
            toast("❌ Failed to load upcoming");
            return false;
        }
    }

    listEl?.addEventListener("click", async (e) => {
        const row = e.target.closest("li[data-id]");
        if (!row) return;
        const broadcastId = row.dataset.id;

        if (e.target.classList.contains("addActionBtn")) {
            row.querySelector(".actionsContainer").style.display = "flex";
            const acts = await window.electronAPI.actionsList(broadcastId);
            const ul = row.querySelector(".existingActions");
            ul.innerHTML = acts
                .sort((a, b) => new Date(a.at) - new Date(b.at))
                .map(
                    (a) => `<li data-aid="${a.id}" style="display:flex;gap:6px;align-items:center;">
              <span>${new Date(a.at).toLocaleString()} — ${a.type}${a.payload?.sceneName ? " (" + a.payload.sceneName + ")" : ""}</span>
              <button class="delActionBtn">x</button>
            </li>`
                )
                .join("");
            return;
        }

        if (e.target.classList.contains("saveActionBtn")) {
            const type = row.querySelector(".actionType").value;
            const atLocal = row.querySelector(".actionTime").value;
            if (!atLocal) return toast("Pick a time for the action.");
            const atISO = new Date(atLocal).toISOString();
            const sceneName = row.querySelector(".sceneInput").value.trim();
            const payload = type === "setScene" ? { sceneName: sceneName || "live" } : {};
            try {
                const a = await window.electronAPI.actionsAdd(broadcastId, atISO, type, payload);
                toast("➕ Action added.");
                const ul = row.querySelector(".existingActions");
                const node = document.createElement("li");
                node.dataset.aid = a.id;
                node.style = "display:flex;gap:6px;align-items:center;";
                node.innerHTML = `<span>${new Date(a.at).toLocaleString()} — ${a.type}${a.payload?.sceneName ? " (" + a.payload.sceneName + ")" : ""}</span>
                            <button class="delActionBtn">x</button>`;
                ul.appendChild(node);
            } catch (err) {
                console.error(err);
                toast("❌ Failed to add action");
            }
            return;
        }

        if (e.target.classList.contains("delActionBtn")) {
            const aid = e.target.closest("li[data-aid]")?.dataset?.aid;
            if (!aid) return;
            try {
                await window.electronAPI.actionsDelete(aid);
                e.target.closest("li[data-aid]").remove();
                toast("🗑️ Action removed");
            } catch (err) {
                console.error(err);
                toast("❌ Failed to remove action");
            }
            return;
        }

        if (e.target.classList.contains("deleteBroadcastBtn")) {
            if (!confirm("Delete this YouTube broadcast AND remove its scheduled actions?")) return;
            try {
                await window.electronAPI.deleteBroadcast(broadcastId);
                row.remove();
                await refreshUpcoming(true);
                toast("🗑️ Broadcast deleted (and actions cleared)");
            } catch (err) {
                console.error(err);
                toast("❌ Failed to delete broadcast");
            }
            return;
        }

        if (e.target.classList.contains("clearActionsBtn")) {
            try {
                const acts = await window.electronAPI.actionsList(broadcastId);
                for (const a of acts) await window.electronAPI.actionsDelete(a.id);
                const ul = row.querySelector(".existingActions");
                if (ul) ul.innerHTML = "";
                toast(`🧹 Cleared ${acts.length} scheduled action(s)`);
            } catch (err) {
                console.error(err);
                toast("❌ Failed to clear actions");
            }
            return;
        }
    });

    listEl?.addEventListener("change", (e) => {
        if (!e.target.classList.contains("actionType")) return;
        const row = e.target.closest("li[data-id]");
        if (!row) return;
        const sceneInput = row.querySelector(".sceneInput");
        if (!sceneInput) return;
        if (e.target.value === "setScene") {
            sceneInput.style.display = "inline-block";
            if (!sceneInput.value.trim()) sceneInput.value = "live";
        } else {
            sceneInput.style.display = "none";
            sceneInput.value = "";
        }
    });

    async function tryGoLive(broadcastId) {
        try {
            setBadge(broadcastEl, false, "Broadcast: starting…");
            await window.electronAPI.goLive(broadcastId);
        } catch (err) {
            console.error("Go live failed:", err);
            setBadge(broadcastEl, false, "Broadcast: error");
        }
    }

    refreshBtn?.addEventListener("click", () => refreshUpcoming(true));
    refreshUpcoming();
});
