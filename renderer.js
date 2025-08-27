// renderer.js
function setBadge(el, ok, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove('loading');
    if (ok === 'loading') {
        el.style.background = "#2a2a2a";
        el.style.color = "#888";
    } else {
        el.style.background = ok ? "#1e8e3e" : "#8e1e1e";
        el.style.color = "#eaeff5";
    }
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
    
    // Determine status display
    let statusText = "";
    let statusColor = "";
    if (item.status === "liveStreaming" || item.status === "active") {
        statusText = "🔴 LIVE";
        statusColor = "#ff4444";
    } else if (item.status === "testing") {
        statusText = "🟡 TESTING";
        statusColor = "#ffaa00";
    } else if (item.status === "ready") {
        statusText = "🟢 READY";
        statusColor = "#44ff44";
    } else if (item.status === "created") {
        statusText = "⚪ CREATED";
        statusColor = "#888888";
    }
    
    return `
    <li data-id="${item.id}" style="display:flex;flex-direction:column;gap:8px;margin:6px 0;padding:8px;border-radius:1px;background:rgba(255,255,255,0.05);">
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title || "—"}</div>
          <div style="opacity:.8">${when} · ${item.privacy || ""}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <code style="opacity:.6">${item.id}</code>
            ${statusText ? `<span style="color:${statusColor};font-weight:600;">${statusText}</span>` : ""}
          </div>
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
    const listEl = document.getElementById("upcomingList");
    const upcomingLoadingEl = document.getElementById("upcomingLoading");
    const logEl = document.getElementById("log");
    const hbEl = document.getElementById("hb");
    const obsEl = document.getElementById("obs");
    const ytEl = document.getElementById("youtube");
    const schedEl = document.getElementById("scheduler");
    const broadcastEl = document.getElementById("broadcast");

    const titleEl = document.getElementById("title");
    const startTimeEl = document.getElementById("startTime");
    const descEl = document.getElementById("description");
    const visEl = document.getElementById("visibility");
    const latencyEl = document.getElementById("latency");

    const thumbPickBtn = document.getElementById("thumbPickBtn");
    const thumbNameEl = document.getElementById("thumbName");

    const recurringChk = document.getElementById("recurringChk");
    const recurringDaysBox = document.getElementById("recurringDays");

    // Show/hide recurring days based on checkbox state
    function updateRecurringDaysVisibility() {
        if (recurringChk.checked) {
            recurringDaysBox.classList.add("show");
        } else {
            recurringDaysBox.classList.remove("show");
        }
    }

    // Initialize visibility
    updateRecurringDaysVisibility();

    recurringChk?.addEventListener("change", updateRecurringDaysVisibility);

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
            setBadge(ytEl, false, "YouTube API: Error");
            toast("❌ Schedule error (check logs)");
            console.error(e);
        }
    });

    // Loading state handler
    window.electronAPI.onLoading(({ component, status }) => {
        if (status === "loading") {
            setBadge(getBadgeForComponent(component), "loading", `${getBadgeTextForComponent(component)}: Loading...`);
        } else if (status === "ready") {
            // Component is ready - set appropriate status
            if (component === "youtube") {
                setBadge(ytEl, true, "YouTube API: OK");
            }
        } else if (status === "error") {
            // Component failed - set error status
            if (component === "youtube") {
                setBadge(ytEl, false, "YouTube API: Error");
            }
        }
    });

    function getBadgeForComponent(component) {
        switch (component) {
            case "scheduler": return schedEl;
            case "youtube": return ytEl;
            case "obs": return obsEl;
            case "broadcast": return broadcastEl;
            default: return null;
        }
    }

    function getBadgeTextForComponent(component) {
        switch (component) {
            case "scheduler": return "OBS Automation";
            case "youtube": return "YouTube API";
            case "obs": return "OBS Connection";
            case "broadcast": return "YouTube Broadcast";
            default: return "Unknown";
        }
    }

    window.electronAPI.onTimezone(({ tz }) => {
        if (!schedEl) return;
        schedEl.title = `Automation clock (local: ${tz}). Green = running.`;
        schedEl.textContent = `OBS Automation: OK (${tz})`; // or keep your existing label
    });

    // ── events from main/scheduler ─────────────────────────────────────────
    window.electronAPI.onScheduled(({ id, title, time, streamId, ingestionAddress, streamName }) => {
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

    // ── log panel toggle ────────────────────────────────────────────────────
    let logPanelVisible = false;
    
    window.electronAPI.onToggleLogPanel(() => {
        logPanelVisible = !logPanelVisible;
        const logEl = document.getElementById("log");
        if (logEl) {
            logEl.style.display = logPanelVisible ? "block" : "none";
        }
    });

    // ── broadcast badge ────────────────────────────────────────────────────
    let activeBroadcastIds = []; // Store active broadcast IDs
    let lastActiveIdsKey = ""; // Track changes to avoid unnecessary refreshes
    
    window.electronAPI.onBroadcast((st) => {
        if (!st?.ok) {
            setBadge(broadcastEl, false, `Broadcast: ${st?.error || "FAILED"}`);
            activeBroadcastIds = []; // Clear active IDs on error
            lastActiveIdsKey = ""; // Reset key
            return;
        }
        // Prefer polled counts when present
        if (typeof st.liveCount === "number") {
            const label = `LIVE (${st.liveCount})`; // always show count
            setBadge(broadcastEl, st.liveCount > 0, `Broadcast: ${st.liveCount > 0 ? label : "OFFLINE"}`);
            
            // Store active broadcast IDs for use in the list
            if (st.ids && Array.isArray(st.ids)) {
                const newActiveIdsKey = st.ids.sort().join(","); // Create stable key
                
                // Only refresh if the active broadcast IDs have actually changed
                if (newActiveIdsKey !== lastActiveIdsKey) {
                    activeBroadcastIds = st.ids;
                    lastActiveIdsKey = newActiveIdsKey;
                    // Refresh the list to include active broadcasts
                    refreshUpcoming();
                } else {
                    // Just update the stored IDs without refreshing
                    activeBroadcastIds = st.ids;
                }
            }
        } else {
            // one-off success (e.g., immediately after goLiveWithRetry)
            setBadge(broadcastEl, true, "Broadcast: LIVE (1)");
        }
    });

    // ── list + actions ─────────────────────────────────────────────────────
    async function refreshUpcoming(force = false) {
        if (isEditing && !force) return true;
        
        // Show loading state
        if (upcomingLoadingEl) upcomingLoadingEl.style.display = "block";
        if (listEl) listEl.style.display = "none";
        
        try {
            const items = await window.electronAPI.listUpcoming();
            
            // Add active broadcasts that aren't already in the list
            const existingIds = new Set(items.map(item => item.id));
            const activeItems = [];
            
            for (const activeId of activeBroadcastIds) {
                if (!existingIds.has(activeId)) {
                    // Create a placeholder item for active broadcast
                    activeItems.push({
                        id: activeId,
                        title: `🔴 LIVE Broadcast (${activeId})`,
                        time: new Date().toISOString(), // Current time since it's live
                        privacy: "public",
                        status: "active"
                    });
                }
            }
            
            // Combine regular items with active items
            const allItems = [...items, ...activeItems];
            
            if (listEl) {
                listEl.innerHTML = allItems.map(rowTemplate).join("");
                for (const it of allItems) {
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
            
            // Hide loading, show content
            if (upcomingLoadingEl) upcomingLoadingEl.style.display = "none";
            if (listEl) listEl.style.display = "block";
            
            return true;
        } catch (e) {
            console.error(e);
            toast("❌ Failed to load upcoming");
            
            // Hide loading even on error
            if (upcomingLoadingEl) upcomingLoadingEl.style.display = "none";
            if (listEl) listEl.style.display = "block";
            
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

    // ── OBS Settings ─────────────────────────────────────────────────────
    const obsSettingsModal = document.getElementById("obsSettingsModal");
    const obsHost = document.getElementById("obsHost");
    const obsPort = document.getElementById("obsPort");
    const obsPassword = document.getElementById("obsPassword");
    const obsEnabled = document.getElementById("obsEnabled");
    const obsTestBtn = document.getElementById("obsTestBtn");
    const obsCancelBtn = document.getElementById("obsCancelBtn");
    const obsSaveBtn = document.getElementById("obsSaveBtn");

    // ── Credentials Setup ─────────────────────────────────────────────────
    const credentialsModal = document.getElementById("credentialsModal");
    const credentialsStatusText = document.getElementById("credentialsStatusText");
    const credentialsStatusDetails = document.getElementById("credentialsStatusDetails");
    const credentialsSetupSteps = document.getElementById("credentialsSetupSteps");
    const credentialsPickBtn = document.getElementById("credentialsPickBtn");
    const credentialsFileName = document.getElementById("credentialsFileName");
    const credentialsValidation = document.getElementById("credentialsValidation");
    const credentialsValidationResult = document.getElementById("credentialsValidationResult");
    const credentialsClearBtn = document.getElementById("credentialsClearBtn");
    const credentialsTestBtn = document.getElementById("credentialsTestBtn");
    const credentialsCancelBtn = document.getElementById("credentialsCancelBtn");

    let selectedCredentialsPath = null;

    // Open credentials setup from menu
    window.electronAPI.onOpenCredentialsSetup(async () => {
        await updateCredentialsStatus();
        credentialsModal.style.display = "block";
    });

    async function updateCredentialsStatus() {
        try {
            const status = await window.electronAPI.credentialsCheckSetup();
            
            if (status.setup) {
                credentialsStatusText.textContent = "✅ Ready";
                credentialsStatusDetails.textContent = "Google OAuth credentials are properly configured and authenticated.";
                credentialsSetupSteps.style.display = "none";
            } else {
                credentialsStatusText.textContent = "❌ Setup Required";
                credentialsStatusDetails.textContent = status.error;
                credentialsSetupSteps.style.display = "block";
            }
        } catch (error) {
            credentialsStatusText.textContent = "❌ Error";
            credentialsStatusDetails.textContent = `Failed to check credentials: ${error.message}`;
            credentialsSetupSteps.style.display = "block";
        }
    }

    // Pick credentials file
    credentialsPickBtn?.addEventListener("click", async () => {
        try {
            const result = await window.electronAPI.credentialsPick();
            if (result.path) {
                selectedCredentialsPath = result.path;
                credentialsFileName.textContent = result.name;
                
                // Validate the selected file
                const validation = await window.electronAPI.credentialsValidate(result.path);
                credentialsValidation.style.display = "block";
                
                if (validation.valid) {
                    credentialsValidationResult.style.background = "#1e3a1e";
                    credentialsValidationResult.style.color = "#4ade80";
                    credentialsValidationResult.textContent = "✅ Valid credentials file";
                    
                    // Copy to app directory
                    const copyResult = await window.electronAPI.credentialsCopyToApp(result.path);
                    if (copyResult.ok) {
                        toast("✅ Credentials file copied successfully");
                        await updateCredentialsStatus();
                    } else {
                        toast(`❌ Failed to copy credentials: ${copyResult.error}`);
                    }
                } else {
                    credentialsValidationResult.style.background = "#3a1e1e";
                    credentialsValidationResult.style.color = "#f87171";
                    credentialsValidationResult.textContent = `❌ Invalid credentials: ${validation.error}`;
                }
            }
        } catch (error) {
            console.error("Failed to pick credentials:", error);
            toast("❌ Failed to select credentials file");
        }
    });

    // Test credentials connection
    credentialsTestBtn?.addEventListener("click", async () => {
        try {
            credentialsTestBtn.disabled = true;
            credentialsTestBtn.textContent = "Testing...";
            
            // Try to load upcoming broadcasts to test the connection
            const items = await window.electronAPI.listUpcoming();
            toast("✅ Credentials working - connection successful");
            await updateCredentialsStatus();
        } catch (error) {
            console.error("Credentials test failed:", error);
            toast(`❌ Credentials test failed: ${error.message}`);
        } finally {
            credentialsTestBtn.disabled = false;
            credentialsTestBtn.textContent = "Test Connection";
        }
    });

    // Clear stored token
    credentialsClearBtn?.addEventListener("click", async () => {
        if (!confirm("This will clear your stored authentication token. You'll need to re-authenticate with Google. Continue?")) {
            return;
        }
        
        try {
            const result = await window.electronAPI.credentialsClearToken();
            if (result.ok) {
                toast("✅ Authentication token cleared");
                await updateCredentialsStatus();
            } else {
                toast(`❌ Failed to clear token: ${result.error}`);
            }
        } catch (error) {
            console.error("Failed to clear token:", error);
            toast("❌ Failed to clear token");
        }
    });

    // Close credentials modal
    credentialsCancelBtn?.addEventListener("click", () => {
        credentialsModal.style.display = "none";
    });

    // Close modal when clicking outside
    credentialsModal?.addEventListener("click", (e) => {
        if (e.target === credentialsModal) {
            credentialsModal.style.display = "none";
        }
    });

    // Open OBS settings from menu
    window.electronAPI.onOpenOBSSettings(async () => {
        try {
            const config = await window.electronAPI.obsLoadConfig();
            obsHost.value = config.host || "localhost";
            obsPort.value = config.port || 4455;
            obsPassword.value = config.password || "";
            obsEnabled.checked = config.enabled !== false;
            obsSettingsModal.style.display = "block";
        } catch (error) {
            console.error("Failed to load OBS config:", error);
            toast("❌ Failed to load OBS settings");
        }
    });

    // Test OBS connection
    obsTestBtn?.addEventListener("click", async () => {
        try {
            obsTestBtn.disabled = true;
            obsTestBtn.textContent = "Testing...";
            
            const config = {
                host: obsHost.value || "localhost",
                port: parseInt(obsPort.value) || 4455,
                password: obsPassword.value || "",
                enabled: obsEnabled.checked
            };
            
            // Test the connection by trying to connect
            const testResult = await window.electronAPI.obsTestConnection(config);
            if (testResult.ok) {
                toast("✅ OBS connection test successful");
            } else {
                toast(`❌ OBS connection test failed: ${testResult.error}`);
            }
        } catch (error) {
            console.error("OBS test failed:", error);
            toast("❌ OBS connection test failed");
        } finally {
            obsTestBtn.disabled = false;
            obsTestBtn.textContent = "Test Connection";
        }
    });

    // Save OBS settings
    obsSaveBtn?.addEventListener("click", async () => {
        try {
            obsSaveBtn.disabled = true;
            obsSaveBtn.textContent = "Saving...";
            
            const config = {
                host: obsHost.value || "localhost",
                port: parseInt(obsPort.value) || 4455,
                password: obsPassword.value || "",
                enabled: obsEnabled.checked
            };
            
            const result = await window.electronAPI.obsSaveConfig(config);
            if (result.ok) {
                toast("✅ OBS settings saved");
                obsSettingsModal.style.display = "none";
            } else {
                toast(`❌ Failed to save OBS settings: ${result.error}`);
            }
        } catch (error) {
            console.error("Failed to save OBS config:", error);
            toast("❌ Failed to save OBS settings");
        } finally {
            obsSaveBtn.disabled = false;
            obsSaveBtn.textContent = "Save";
        }
    });

    // Cancel OBS settings
    obsCancelBtn?.addEventListener("click", () => {
        obsSettingsModal.style.display = "none";
    });

    // Close modal when clicking outside
    obsSettingsModal?.addEventListener("click", (e) => {
        if (e.target === obsSettingsModal) {
            obsSettingsModal.style.display = "none";
        }
    });
    
    refreshUpcoming();
});
