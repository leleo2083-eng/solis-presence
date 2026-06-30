const http = require("http");

// ── Admin authorization ────────────────────────────────────────────────────
// Roblox UserIds allowed to issue /admin/* commands. Add more IDs here.
// NOTE: This server has no transport-level auth — any client can claim to be
// any UserId on /register. For a basic kick panel that's acceptable; harden
// later with a shared secret or signed tokens if needed.
const ADMIN_IDS = new Set([
    2401825836,
]);

// activeUsers[userId] = { lastSeen, displayName, name }
const activeUsers = {};

// Set of userIds the admin has queued for disconnect. Cleared when the
// affected client next /register's (server tells them kick = true).
const disconnectsPending = new Set();

const TIMEOUT = 15000; // 15 seconds before a client is considered gone

function readBody(req) {
    return new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 32 * 1024) {
                // guard against absurdly large bodies
                try { req.socket.destroy(); } catch (_) {}
            }
        });
        req.on("end", () => resolve(body));
        req.on("error", () => resolve(""));
    });
}

function sendJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }

    // POST /register — a client tells the server they are active.
    // Response includes { kick: true } if the admin queued this user for
    // disconnect, in which case the server clears the pending entry.
    if (req.method === "POST" && req.url === "/register") {
        const body = await readBody(req);
        let data;
        try { data = JSON.parse(body || "{}"); }
        catch (e) { return sendJson(res, 400, { error: "bad json" }); }

        const userId = Number(data.userId);
        if (!Number.isFinite(userId) || userId <= 0) {
            return sendJson(res, 400, { error: "missing userId" });
        }

        const prev = activeUsers[userId] || {};
        activeUsers[userId] = {
            lastSeen: Date.now(),
            displayName: typeof data.displayName === "string" && data.displayName.length
                ? data.displayName.slice(0, 64)
                : (prev.displayName || ""),
            name: typeof data.name === "string" && data.name.length
                ? data.name.slice(0, 64)
                : (prev.name || ""),
        };

        let kick = false;
        if (disconnectsPending.has(userId)) {
            kick = true;
            disconnectsPending.delete(userId);
            delete activeUsers[userId];
        }
        return sendJson(res, 200, { ok: true, kick });
    }

    // GET /users — list of currently active clients with their metadata.
    if (req.method === "GET" && req.url === "/users") {
        const now = Date.now();
        const alive = [];
        for (const [idStr, info] of Object.entries(activeUsers)) {
            if (now - info.lastSeen >= TIMEOUT) continue;
            alive.push({
                userId: Number(idStr),
                displayName: info.displayName || "",
                name: info.name || "",
            });
        }
        return sendJson(res, 200, alive);
    }

    // POST /admin/disconnect — admin queues a user for kick on their next ping.
    // Body: { adminId, userId }
    if (req.method === "POST" && req.url === "/admin/disconnect") {
        const body = await readBody(req);
        let data;
        try { data = JSON.parse(body || "{}"); }
        catch (e) { return sendJson(res, 400, { error: "bad json" }); }

        const adminId = Number(data.adminId);
        const userId = Number(data.userId);
        if (!ADMIN_IDS.has(adminId)) {
            return sendJson(res, 403, { error: "not authorized" });
        }
        if (!Number.isFinite(userId) || userId <= 0) {
            return sendJson(res, 400, { error: "missing userId" });
        }
        disconnectsPending.add(userId);
        return sendJson(res, 200, { ok: true });
    }

    // GET / — health check so Koyeb knows server is alive
    if (req.method === "GET" && req.url === "/") {
        res.writeHead(200);
        res.end("Solis Presence Server OK");
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

// Periodic cleanup of stale users (in case nothing else triggers it).
setInterval(() => {
    const now = Date.now();
    for (const [idStr, info] of Object.entries(activeUsers)) {
        if (now - info.lastSeen >= TIMEOUT) {
            delete activeUsers[idStr];
        }
    }
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Solis Presence Server running on port " + PORT);
});
