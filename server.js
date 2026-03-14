const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const express = require("express");
const cors = require("cors");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { initializeDatabase, dbFilePath } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || __dirname;
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function authRequired(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return next();
}

function roleRequired(role) {
    return (req, res, next) => {
        if (!req.session.user || req.session.user.role !== role) {
            return res.status(403).json({ error: "Forbidden" });
        }

        return next();
    };
}

function mapTask(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        dueAt: row.due_at,
        priority: row.priority,
        status: row.status,
        deadlineAlerted: Boolean(row.deadline_alerted),
        caretakerEscalated: Boolean(row.caretaker_escalated),
        updatedAt: row.updated_at,
        createdAt: row.created_at
    };
}

function mapMessage(row) {
    return {
        id: row.id,
        sender: row.sender_role,
        senderName: row.sender_name,
        message: row.message,
        createdAt: row.created_at
    };
}

app.use(express.json());
if (allowedOrigins.length > 0) {
    app.use(
        cors({
            origin(origin, callback) {
                if (!origin || allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                return callback(new Error("Not allowed by CORS"));
            },
            credentials: true
        })
    );
}
app.set("trust proxy", 1);
app.use(
    session({
        secret: process.env.SESSION_SECRET || "memory-aid-demo-secret",
        resave: false,
        saveUninitialized: false,
        store: new SQLiteStore({
            db: "sessions.db",
            dir: dataDir
        }),
        cookie: {
            httpOnly: true,
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction,
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login", (req, res) => {
    if (req.session.user) {
        return res.redirect("/");
    }

    return res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
});

app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    return res.redirect("/");
});

app.use(express.static(__dirname, { index: false }));

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const user = await db.get(
        "SELECT id, username, password, role, full_name FROM users WHERE username = ?",
        [username.trim()]
    );

    if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials." });
    }

    req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name
    };

    return res.json({
        user: req.session.user,
        redirectTo: "/"
    });
});

app.post("/api/logout", authRequired, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
    });
});

app.get("/api/session", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({ user: req.session.user });
});

app.get("/api/tasks", authRequired, async (_req, res) => {
    const rows = await db.all("SELECT * FROM tasks ORDER BY due_at ASC");
    return res.json({ tasks: rows.map(mapTask) });
});

app.post("/api/tasks", authRequired, roleRequired("caretaker"), async (req, res) => {
    const { id, type, title, dueAt, priority, status, deadlineAlerted, caretakerEscalated, updatedAt, createdAt } =
        req.body || {};

    if (!id || !type || !title || !dueAt || !priority || !status) {
        return res.status(400).json({ error: "Invalid task payload." });
    }

    await db.run(
        `INSERT INTO tasks (id, type, title, due_at, priority, status, deadline_alerted, caretaker_escalated, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            type,
            title,
            dueAt,
            priority,
            status,
            Number(Boolean(deadlineAlerted)),
            Number(Boolean(caretakerEscalated)),
            Number(updatedAt || Date.now()),
            Number(createdAt || Date.now())
        ]
    );

    const row = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
    return res.status(201).json({ task: mapTask(row) });
});

app.patch("/api/tasks/:id", authRequired, async (req, res) => {
    const { id } = req.params;
    const { status, deadlineAlerted, caretakerEscalated, updatedAt } = req.body || {};

    const existing = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!existing) {
        return res.status(404).json({ error: "Task not found." });
    }

    if (req.session.user.role === "patient") {
        const allowedPatientStatuses = ["completed", "missed"];
        if (!allowedPatientStatuses.includes(status)) {
            return res.status(403).json({ error: "Patients can only mark tasks as done or missed." });
        }
    }

    if (req.session.user.role === "caretaker") {
        const allowedCaretakerStatuses = ["pending", "overdue", "missed", "completed"];
        if (!allowedCaretakerStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status." });
        }
    }

    await db.run(
        `UPDATE tasks
         SET status = ?, deadline_alerted = ?, caretaker_escalated = ?, updated_at = ?
         WHERE id = ?`,
        [
            status,
            Number(Boolean(deadlineAlerted)),
            Number(Boolean(caretakerEscalated)),
            Number(updatedAt || Date.now()),
            id
        ]
    );

    const updated = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
    return res.json({ task: mapTask(updated) });
});

app.get("/api/messages", authRequired, async (_req, res) => {
    const rows = await db.all("SELECT * FROM messages ORDER BY created_at ASC");
    return res.json({ messages: rows.map(mapMessage) });
});

app.post("/api/messages", authRequired, async (req, res) => {
    const { id, message, createdAt } = req.body || {};
    const content = (message || "").trim();

    if (!content) {
        return res.status(400).json({ error: "Message is required." });
    }

    const messageId = id || randomUUID();

    await db.run(
        `INSERT INTO messages (id, sender_role, sender_name, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
            messageId,
            req.session.user.role,
            req.session.user.fullName,
            content,
            Number(createdAt || Date.now())
        ]
    );

    const row = await db.get("SELECT * FROM messages WHERE id = ?", [messageId]);
    return res.status(201).json({ message: mapMessage(row) });
});

app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
});

(async () => {
    db = await initializeDatabase();

    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log("Demo accounts: patient1/patient123 and caretaker1/caretaker123");
        console.log(`Database file: ${dbFilePath}`);
    });
})();
