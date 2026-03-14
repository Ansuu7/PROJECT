const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { randomUUID } = require("crypto");

const dataDir = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, "memory_aid.db");

async function initializeDatabase() {
    const db = await open({
        filename: dbFilePath,
        driver: sqlite3.Database
    });

    await db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('patient', 'caretaker')),
            full_name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            due_at TEXT NOT NULL,
            priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
            status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'overdue', 'missed')),
            deadline_alerted INTEGER NOT NULL DEFAULT 0,
            caretaker_escalated INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            sender_role TEXT NOT NULL CHECK(sender_role IN ('patient', 'caretaker')),
            sender_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
    `);

    await seedUsers(db);
    await seedTasks(db);
    await seedMessages(db);

    return db;
}

async function seedUsers(db) {
    const existingUsers = await db.get("SELECT COUNT(*) AS count FROM users");
    if (existingUsers.count > 0) {
        return;
    }

    await db.run(
        `INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
        [
            "patient1",
            "patient123",
            "patient",
            "Patient User",
            "caretaker1",
            "caretaker123",
            "caretaker",
            "Ansuu Sharma"
        ]
    );
}

async function seedTasks(db) {
    const existingTasks = await db.get("SELECT COUNT(*) AS count FROM tasks");
    if (existingTasks.count > 0) {
        return;
    }

    const now = Date.now();
    const today = new Date();

    const medicationTime = new Date(today);
    medicationTime.setHours(9, 0, 0, 0);

    const waterTime = new Date(today);
    waterTime.setHours(11, 30, 0, 0);

    const appointmentTime = new Date(today);
    appointmentTime.setHours(17, 0, 0, 0);

    const rows = [
        {
            id: randomUUID(),
            type: "medication",
            title: "Blood pressure tablet",
            dueAt: medicationTime.toISOString(),
            priority: "high"
        },
        {
            id: randomUUID(),
            type: "water",
            title: "Drink 1 glass of water",
            dueAt: waterTime.toISOString(),
            priority: "low"
        },
        {
            id: randomUUID(),
            type: "appointment",
            title: "Doctor follow-up call",
            dueAt: appointmentTime.toISOString(),
            priority: "medium"
        }
    ];

    for (const row of rows) {
        await db.run(
            `INSERT INTO tasks (id, type, title, due_at, priority, status, deadline_alerted, caretaker_escalated, updated_at, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)`,
            [row.id, row.type, row.title, row.dueAt, row.priority, now, now]
        );
    }
}

async function seedMessages(db) {
    const existingMessages = await db.get("SELECT COUNT(*) AS count FROM messages");
    if (existingMessages.count > 0) {
        return;
    }

    const now = Date.now();
    await db.run(
        `INSERT INTO messages (id, sender_role, sender_name, message, created_at) VALUES (?, ?, ?, ?, ?)`,
        [
            randomUUID(),
            "caretaker",
            "Ansuu Sharma",
            "Hello! Share updates here and I will monitor your routine.",
            now
        ]
    );
}

module.exports = {
    initializeDatabase,
    dbFilePath
};
