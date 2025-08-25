// youtube_api.js
import { app } from "electron";
import fs from "fs";
import http from "http";
import url from "url";
import open from "open";
import { google } from "googleapis";
import path from "path";

const SCOPES = ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.upload"];
const REDIRECT_PORT = 4567;

const TOKEN_PATH = path.join(app.getPath("userData"), "token.json");
const CRED_PATH = path.resolve(process.cwd(), "credentials.json");

export function loadAuth(callback) {
    const credentials = JSON.parse(fs.readFileSync(CRED_PATH, "utf-8"));
    const { client_secret, client_id } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, `http://localhost:${REDIRECT_PORT}`);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        oAuth2Client.setCredentials(token);
        return callback ? callback(oAuth2Client) : oAuth2Client;
    } else {
        return getNewToken(oAuth2Client, callback);
    }
}

function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "select_account consent",
    });

    console.log("🔐 Authorize this app in your browser…");
    open(authUrl);

    let handled = false;
    const server = http.createServer(async (req, res) => {
        try {
            const { query } = url.parse(req.url, true);
            const code = query?.code;
            if (!code) {
                res.end("Waiting for Google OAuth…");
                return;
            }
            if (handled) {
                res.end("Auth already handled. You can close this tab.");
                return;
            }
            handled = true;

            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            res.end("✅ Authorization successful! You may close this tab.");
            server.close();
            if (callback) callback(oAuth2Client);
        } catch (err) {
            console.error("❌ OAuth error:", err?.response?.data || err);
            try {
                res.end("❌ OAuth error. Check console.");
            } catch {}
            server.close();
        }
    });

    server.listen(REDIRECT_PORT, () => {
        console.log(`🌐 Listening for auth code on http://localhost:${REDIRECT_PORT} …`);
    });
}

// Helper: ensure we have a reusable liveStream and return its ingest info (RTMP + key)
async function ensureReusableStream(auth) {
    const yt = google.youtube({ version: "v3", auth });
    const streams = await yt.liveStreams.list({
        part: "id,cdn,contentDetails,snippet",
        mine: true,
        maxResults: 50,
    });

    let reusable = (streams.data.items || []).find((s) => s.contentDetails?.isReusable);
    if (!reusable) {
        const created = await yt.liveStreams.insert({
            part: "snippet,cdn,contentDetails",
            requestBody: {
                snippet: { title: "Arcane Monitor — Reusable Stream" },
                cdn: { frameRate: "variable", ingestionType: "rtmp", resolution: "variable" },
                contentDetails: { isReusable: true },
            },
        });
        reusable = created.data;
    }

    const ingestion = reusable?.cdn?.ingestionInfo || {};
    return {
        streamId: reusable.id,
        ingestionAddress: ingestion.ingestionAddress, // e.g. rtmp://a.rtmp.youtube.com/live2
        streamName: ingestion.streamName, // 🔑 stream key
    };
}

export async function bindBroadcastToDefaultStream(auth, broadcastId) {
    const yt = google.youtube({ version: "v3", auth });
    const { streamId, ingestionAddress, streamName } = await ensureReusableStream(auth);

    await yt.liveBroadcasts.bind({
        id: broadcastId,
        part: "id,snippet,contentDetails,status",
        streamId,
    });

    return { streamId, ingestionAddress, streamName };
}

function guessMime(filePath) {
    const ext = path.extname(filePath || "").toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    return "application/octet-stream";
}

export async function setBroadcastThumbnail(auth, videoId, filePath) {
    if (!filePath) throw new Error("thumbPath missing");
    if (!fs.existsSync(filePath)) throw new Error(`thumbnail file not found: ${filePath}`);

    const yt = google.youtube({ version: "v3", auth });
    const mimeType = guessMime(filePath);
    const media = { mimeType, body: fs.createReadStream(filePath) };

    try {
        const res = await yt.thumbnails.set({ videoId, media });
        return res?.data || { ok: true };
    } catch (err) {
        const payload = err?.response?.data || err?.errors || err?.message || err;
        throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
}

export function scheduleLiveStream(auth, fields) {
    const {
        title,
        startTime,
        description = "",
        privacy = "public", // "public" | "unlisted" | "private"
        tags = [], // array of strings
        latency = "ultraLow", // "normal" | "low" | "ultraLow"
    } = fields || {};

    const youtube = google.youtube({ version: "v3", auth });

    // Map to YouTube API enums
    const latencyMap = {
        normal: "normal",
        low: "low",
        ultraLow: "ultraLow",
        // tolerate casing variants:
        NORMAL: "normal",
        LOW: "low",
        ULTRA_LOW: "ultraLow",
        ULTRALOW: "ultraLow",
    };
    const latencyPref = latencyMap[latency] || "ultraLow";

    const safeTitle = (title && title.trim()) || `Arcane Monitor — ${new Date(startTime).toISOString()}`;
    const isoStart = new Date(startTime).toISOString();

    return youtube.liveBroadcasts
        .insert({
            part: "snippet,status,contentDetails",
            requestBody: {
                snippet: { title: safeTitle, description, scheduledStartTime: isoStart, tags: Array.isArray(tags) ? tags : [] },
                status: { privacyStatus: privacy },
                contentDetails: {
                    monitorStream: { enableMonitorStream: false },
                    latencyPreference: latencyPref, // 👈 ensure ULTRA LOW by default
                },
            },
        })
        .then((res) => {
            const b = res.data;
            return {
                id: b.id,
                title: b?.snippet?.title,
                time: b?.snippet?.scheduledStartTime,
                privacy: b?.status?.privacyStatus,
            };
        })
        .catch(async (err) => {
            const payload = err?.response?.data || err?.errors || err?.message || err;
            console.error("❌ Error creating stream:", payload);
            const msg = JSON.stringify(payload);
            if (/(invalid_grant|invalidCredentials|unauthorized_client)/i.test(msg)) {
                try {
                    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
                    console.warn("🔁 Token invalid; deleted token.json. Re-auth required.");
                } catch {}
            }
            throw payload;
        });
}

export async function listUpcomingBroadcasts(auth) {
    const yt = google.youtube({ version: "v3", auth });
    try {
        const res = await yt.liveBroadcasts.list({
            part: "id,snippet,status",
            mine: true,
            broadcastType: "event",
            maxResults: 50,
        });
        const items = res.data.items || [];
        const upcoming = items.filter((b) => {
            const lc = b.status?.lifeCycleStatus;
            return lc === "created" || lc === "ready";
        });
        upcoming.sort((a, b) => new Date(a.snippet?.scheduledStartTime || 0) - new Date(b.snippet?.scheduledStartTime || 0));
        return upcoming.map((b) => ({
            id: b.id,
            title: b.snippet?.title,
            time: b.snippet?.scheduledStartTime,
            privacy: b.status?.privacyStatus,
        }));
    } catch (err) {
        const payload = err?.response?.data || err?.errors || err?.message || err;
        console.error("❌ listUpcoming failed:", payload);
        const msg = JSON.stringify(payload);
        if (/(invalid_grant|invalidCredentials|unauthorized_client)/i.test(msg)) {
            try {
                if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
                console.warn("🔁 Token invalid; deleted token.json. Re-auth required.");
            } catch {}
        }
        throw payload;
    }
}

export async function deleteBroadcast(auth, id) {
    const yt = google.youtube({ version: "v3", auth });
    await yt.liveBroadcasts.delete({ id });
    return { id };
}

export async function transitionBroadcast(auth, broadcastId, status) {
    const yt = google.youtube({ version: "v3", auth });
    return yt.liveBroadcasts.transition({
        id: broadcastId,
        broadcastStatus: status,
        part: "id,status,contentDetails",
    });
}
