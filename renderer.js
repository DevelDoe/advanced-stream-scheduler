function setBadge(el, ok, text) {
    if (!el) return; // guard if element not present
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
      <li data-id="${item.id}" style="display:flex;gap:8px;align-items:center;margin:6px 0;padding:6px;border-radius:8px;background:#191919;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title || "—"}</div>
          <div style="opacity:.8">${when} · ${item.privacy || ""}</div>
          <code style="opacity:.6">${item.id}</code>
        </div>
        <button class="cancelBtn">Cancel</button>
      </li>`;
}

window.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("scheduleBtn");
    const logEl = document.getElementById("log");
    const hbEl = document.getElementById("hb");
    const obsEl = document.getElementById("obsBadge");
    const pyEl = document.getElementById("pyBadge"); // may be null if you removed it
    const ytEl = document.getElementById("ytBadge");
    const schedEl = document.getElementById("schedBadge");
    const listEl = document.getElementById("upcoming");
    const refreshBtn = document.getElementById("refreshBtn");

    let lastHB = 0;

    // append logs
    window.electronAPI.onLog((line) => {
        if (logEl) {
            logEl.textContent += line + "\n";
            logEl.scrollTop = logEl.scrollHeight;
        }
    });

    // heartbeat
    window.electronAPI.onHeartbeat(({ at }) => {
        lastHB = at;
        if (hbEl) hbEl.textContent = "HB: " + new Date(at).toLocaleTimeString();
        setBadge(schedEl, true, "Scheduler: OK");
    });

    // watchdog — mark DOWN if no heartbeat for 65s
    setInterval(() => {
        if (!lastHB) return;
        const stale = Date.now() - lastHB > 65_000;
        if (stale) {
            setBadge(schedEl, false, "Scheduler: DOWN");
            toast("⚠️ Scheduler heartbeat stale");
        }
    }, 10_000);

    // OBS status
    window.electronAPI.onObs((st) => {
        if (st?.ok) setBadge(obsEl, true, `OBS: OK${st.version ? " " + st.version : ""}`);
        else setBadge(obsEl, false, "OBS: DOWN");
    });

    // Python status (safe even if you removed the badge)
    window.electronAPI.onPy?.((st) => {
        if (!pyEl) return;
        if (st?.ok) setBadge(pyEl, true, "Python: OK");
        else setBadge(pyEl, false, "Python: " + (st?.error || "STALE"));
    });

    // Scheduled confirmation
    window.electronAPI.onScheduled(({ id, title, time }) => {
        setBadge(ytEl, true, "YouTube: Scheduled");
        toast(`📅 Scheduled: ${title} — ${new Date(time).toLocaleString()}`);
        if (logEl) {
            logEl.textContent += `SCHEDULED #${id} → ${title} @ ${time}\n`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    });

    // Button click → schedule
    if (button) {
        button.addEventListener("click", async () => {
            const title = document.getElementById("title").value;
            const localTime = document.getElementById("startTime").value;
            if (!localTime) return toast("Pick a start time.");
            const isoUTC = new Date(localTime).toISOString();
            try {
                await window.electronAPI.scheduleStream(title, isoUTC);
            } catch (e) {
                setBadge(ytEl, false, "YouTube: Error");
                toast("❌ Schedule error (check logs)");
                console.error(e);
            }
        });
    }
    async function refreshUpcoming() {
        try {
            const items = await window.electronAPI.listUpcoming();
            if (listEl) listEl.innerHTML = items.map(rowTemplate).join("");
        } catch (e) {
            console.error(e);
            toast("❌ Failed to load upcoming");
        }
    }

    // click → cancel
    listEl?.addEventListener("click", async (e) => {
        const btn = e.target.closest(".cancelBtn");
        if (!btn) return;
        const li = e.target.closest("li");
        const id = li?.dataset?.id;
        if (!id) return;
        try {
            await window.electronAPI.deleteBroadcast(id);
            toast("🗑️ Broadcast canceled");
            li.remove();
        } catch (err) {
            console.error(err);
            toast("❌ Cancel failed (check logs)");
        }
    });

    refreshBtn?.addEventListener("click", refreshUpcoming);

    // Auto-load once at startup
    refreshUpcoming();

    // Optional: auto-refresh every minute
    setInterval(refreshUpcoming, 60_000);
});
