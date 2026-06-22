const http = require("http");

const activeUsers = {};
const TIMEOUT = 15000; // 15 seconds

const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }

    // POST /register — a client tells the server they are active
    if (req.method === "POST" && req.url === "/register") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const data = JSON.parse(body);
                if (data.userId) {
                    activeUsers[data.userId] = Date.now();
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true }));
                } else {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: "missing userId" }));
                }
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "bad json" }));
            }
        });
        return;
    }

    // GET /users — get a list of all currently active user IDs
    if (req.method === "GET" && req.url === "/users") {
        const now = Date.now();
        const alive = Object.entries(activeUsers)
            .filter(([id, ts]) => now - ts < TIMEOUT)
            .map(([id]) => Number(id));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(alive));
        return;
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Solis Presence Server running on port " + PORT);
});