const taskForm = document.getElementById("taskForm");
const taskType = document.getElementById("taskType");
const taskTitle = document.getElementById("taskTitle");
const taskDue = document.getElementById("taskDue");
const taskPriority = document.getElementById("taskPriority");
const taskList = document.getElementById("taskList");
const patientTab = document.getElementById("patientTab");
const caretakerTab = document.getElementById("caretakerTab");
const patientDashboard = document.getElementById("patientDashboard");
const caretakerDashboard = document.getElementById("caretakerDashboard");
const logoutBtn = document.getElementById("logoutBtn");
const sessionRole = document.getElementById("sessionRole");

const tasksToday = document.getElementById("tasksToday");
const tasksCompleted = document.getElementById("tasksCompleted");
const tasksPending = document.getElementById("tasksPending");
const tasksMissed = document.getElementById("tasksMissed");

const escalationBadge = document.getElementById("escalationBadge");
const escalationReason = document.getElementById("escalationReason");
const caretakerUpdate = document.getElementById("caretakerUpdate");
const notificationFeed = document.getElementById("notificationFeed");
const manualCheckIn = document.getElementById("manualCheckIn");
const currentTime = document.getElementById("currentTime");
const currentDate = document.getElementById("currentDate");
const patientMessageForm = document.getElementById("patientMessageForm");
const patientMessageInput = document.getElementById("patientMessageInput");
const patientChatList = document.getElementById("patientChatList");

const careTasksTotal = document.getElementById("careTasksTotal");
const careTasksCompleted = document.getElementById("careTasksCompleted");
const careTasksOverdue = document.getElementById("careTasksOverdue");
const careTasksMissed = document.getElementById("careTasksMissed");
const alertsQueue = document.getElementById("alertsQueue");
const patientTimeline = document.getElementById("patientTimeline");
const careEscalationBadge = document.getElementById("careEscalationBadge");
const careEscalationReason = document.getElementById("careEscalationReason");
const quickActions = document.getElementById("quickActions");
const communicationLog = document.getElementById("communicationLog");
const careTaskManager = document.getElementById("careTaskManager");
const caretakerChatList = document.getElementById("caretakerChatList");
const caretakerMessageForm = document.getElementById("caretakerMessageForm");
const caretakerMessageInput = document.getElementById("caretakerMessageInput");
const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE ? window.APP_CONFIG.API_BASE : "").replace(/\/$/, "");
const loginPageHref = window.location.pathname.endsWith("/index.html")
    ? "./login.html"
    : "/login";

let taskDuePicker = null;

const STATUS = {
    PENDING: "pending",
    COMPLETED: "completed",
    OVERDUE: "overdue",
    MISSED: "missed"
};

const ESCALATION = {
    NORMAL: "normal",
    WARNING: "warning",
    CRITICAL: "critical"
};

const HIGH_PRIORITY_RESPONSE_WINDOW_MS = 10 * 60 * 1000;

let tasks = [];
let chatMessages = [];
let notifications = [];
let caretakerLogs = [];
let escalationLevel = ESCALATION.NORMAL;
let currentView = "patient";
let currentRole = "";

patientTab.addEventListener("click", () => {
    if (currentRole === "caretaker") {
        return;
    }
    setActiveView("patient");
});

caretakerTab.addEventListener("click", () => {
    if (currentRole === "patient") {
        return;
    }
    setActiveView("caretaker");
});

logoutBtn.addEventListener("click", async () => {
    try {
        await fetch(`${apiBase}/api/logout`, { method: "POST", credentials: "include" });
    } finally {
        window.location.href = loginPageHref;
    }
});

taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentRole !== "caretaker") {
        addNotification("Only caretaker can add tasks.");
        renderNotifications();
        return;
    }

    const selectedDueDate = getSelectedDueDate();
    const titleValue = taskTitle.value.trim();
    if (!selectedDueDate || !titleValue) {
        return;
    }

    const now = Date.now();
    const payload = {
        id: crypto.randomUUID(),
        type: taskType.value,
        title: titleValue,
        dueAt: selectedDueDate.toISOString(),
        priority: taskPriority.value,
        status: STATUS.PENDING,
        deadlineAlerted: false,
        caretakerEscalated: false,
        updatedAt: now,
        createdAt: now
    };

    await fetchJson("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    taskForm.reset();
    if (taskDuePicker) {
        taskDuePicker.clear();
    }

    addNotification(`New ${readableType(payload.type)} reminder added: ${payload.title}`);
    await loadTasks();
    render();
});

taskList.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || currentRole !== "patient") {
        return;
    }

    const taskId = actionButton.dataset.id;
    const action = actionButton.dataset.action;
    const selectedTask = tasks.find((task) => task.id === taskId);
    if (!selectedTask) {
        return;
    }

    if (action === "complete") {
        await updateTaskOnServer(selectedTask, {
            status: STATUS.COMPLETED,
            deadlineAlerted: selectedTask.deadlineAlerted,
            caretakerEscalated: selectedTask.caretakerEscalated
        });
        addNotification(`Task completed: ${selectedTask.title}`);
    }

    if (action === "missed") {
        await updateTaskOnServer(selectedTask, {
            status: STATUS.MISSED,
            deadlineAlerted: selectedTask.deadlineAlerted,
            caretakerEscalated: selectedTask.caretakerEscalated
        });
        addNotification(`Task missed: ${selectedTask.title}`);
    }

    await loadTasks();
    render();
});

careTaskManager.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("button[data-care-task-action]");
    if (!actionButton || currentRole !== "caretaker") {
        return;
    }

    const taskId = actionButton.dataset.id;
    const action = actionButton.dataset.careTaskAction;
    const selectedTask = tasks.find((task) => task.id === taskId);
    if (!selectedTask) {
        return;
    }

    if (action === "reset") {
        await updateTaskOnServer(selectedTask, {
            status: STATUS.PENDING,
            deadlineAlerted: false,
            caretakerEscalated: false
        });

        addCaretakerLog(`Caretaker reset task: ${selectedTask.title}`);
        addNotification(`Task reset to pending by caretaker: ${selectedTask.title}`);
        await loadTasks();
        render();
    }
});

manualCheckIn.addEventListener("click", () => {
    addNotification("Manual check-in sent to caretaker.");
    addCaretakerLog("Patient requested manual check-in support.");
    caretakerUpdate.textContent = "Caretaker has been prompted for a live check-in.";
    renderNotifications();
    renderCommunicationLog();
});

patientMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentRole !== "patient") {
        return;
    }

    const message = patientMessageInput.value.trim();
    if (!message) {
        return;
    }

    await sendChatMessage(message);
    addCaretakerLog(`New patient message: ${message}`);
    patientMessageForm.reset();
    await loadMessages();
    renderChat();
    renderCommunicationLog();
});

caretakerMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentRole !== "caretaker") {
        return;
    }

    const message = caretakerMessageInput.value.trim();
    if (!message) {
        return;
    }

    await sendChatMessage(message);
    addNotification("Caretaker replied in chat.");
    caretakerMessageForm.reset();
    await loadMessages();
    renderChat();
    renderNotifications();
});

quickActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-care-action]");
    if (!button || currentRole !== "caretaker") {
        return;
    }

    const action = button.dataset.careAction;
    if (action === "call") {
        addCaretakerLog("Caretaker initiated a patient call.");
        addNotification("Caretaker action: patient call initiated.");
    }

    if (action === "message") {
        addCaretakerLog("Caretaker sent a reminder message to patient.");
        addNotification("Caretaker action: reminder message sent.");
    }

    if (action === "family") {
        addCaretakerLog("Caretaker notified family contact.");
        addNotification("Caretaker action: family contact notified.");
    }

    if (action === "escalate") {
        addCaretakerLog("Emergency escalation triggered by caretaker.");
        addNotification("Critical escalation: emergency contact protocol initiated.");
    }

    renderNotifications();
    renderCommunicationLog();
});

async function initializeApp() {
    try {
        const session = await fetchJson("/api/session");
        currentRole = session.user.role;
        sessionRole.textContent = `${session.user.fullName} (${currentRole.toUpperCase()})`;

        if (currentRole === "patient") {
            caretakerTab.style.display = "none";
            setActiveView("patient");
        } else {
            patientTab.style.display = "none";
            setActiveView("caretaker");
        }

        initializeDueDatePicker();
        addNotification("System initialized. Caretaker monitoring is active.");
        addCaretakerLog("Caretaker dashboard monitoring started.");

        await refreshData();

        setInterval(() => {
            renderClock();
        }, 1000);

        setInterval(async () => {
            await evaluateTaskStatuses();
            await refreshData();
        }, 5 * 1000);
    } catch (_error) {
        window.location.href = loginPageHref;
    }
}

async function refreshData() {
    await Promise.all([loadTasks(), loadMessages()]);
    render();
}

async function loadTasks() {
    const data = await fetchJson("/api/tasks");
    tasks = data.tasks || [];
}

async function loadMessages() {
    const data = await fetchJson("/api/messages");
    chatMessages = data.messages || [];
}

async function evaluateTaskStatuses() {
    const now = Date.now();
    const updates = [];

    for (const task of tasks) {
        if (task.status === STATUS.COMPLETED || task.status === STATUS.MISSED) {
            continue;
        }

        const due = new Date(task.dueAt).getTime();
        const highPriority = isHighPriority(task);

        if (highPriority && now >= due + HIGH_PRIORITY_RESPONSE_WINDOW_MS) {
            if (!task.caretakerEscalated || task.status !== STATUS.MISSED) {
                updates.push(
                    updateTaskOnServer(task, {
                        status: STATUS.MISSED,
                        deadlineAlerted: true,
                        caretakerEscalated: true
                    })
                );

                if (!task.caretakerEscalated) {
                    handleHighPriorityNoResponse(task);
                }
            }
            continue;
        }

        if (now >= due && task.status !== STATUS.OVERDUE) {
            updates.push(
                updateTaskOnServer(task, {
                    status: STATUS.OVERDUE,
                    deadlineAlerted: true,
                    caretakerEscalated: task.caretakerEscalated
                })
            );

            if (!task.deadlineAlerted) {
                handleTaskDeadlineExpiry(task);
            }
        }
    }

    if (updates.length > 0) {
        await Promise.all(updates);
    }
}

async function updateTaskOnServer(task, update) {
    await fetchJson(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            status: update.status,
            deadlineAlerted: update.deadlineAlerted,
            caretakerEscalated: update.caretakerEscalated,
            updatedAt: Date.now()
        })
    });
}

async function sendChatMessage(message) {
    await fetchJson("/api/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            id: crypto.randomUUID(),
            message,
            createdAt: Date.now()
        })
    });
}

async function fetchJson(url, options = {}) {
    const response = await fetch(`${apiBase}${url}`, {
        credentials: "include",
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }
    return data;
}

function updateEscalationState() {
    const missed = tasks.filter((task) => task.status === STATUS.MISSED && isHighPriority(task));
    const overdue = tasks.filter((task) => task.status === STATUS.OVERDUE && isHighPriority(task));
    const missedMedication = tasks.some(
        (task) => task.type === "medication" && task.status === STATUS.MISSED && isHighPriority(task)
    );

    let level = ESCALATION.NORMAL;
    let reason = "All critical routines are on track.";
    let caretakerMessage = "No action needed right now.";

    if (missedMedication || missed.length >= 2 || overdue.length >= 3) {
        level = ESCALATION.CRITICAL;
        reason = "Immediate attention required for overdue or missed high-priority routines.";
        caretakerMessage = "Critical alert sent: contact user now and prepare emergency escalation.";
    } else if (missed.length >= 1 || overdue.length >= 1) {
        level = ESCALATION.WARNING;
        reason = "At least one high-priority task is overdue or missed.";
        caretakerMessage = "Warning sent: caretaker follow-up requested.";
    }

    escalationBadge.className = `badge ${level}`;
    escalationBadge.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    escalationReason.textContent = reason;
    caretakerUpdate.textContent = caretakerMessage;

    careEscalationBadge.className = `badge ${level}`;
    careEscalationBadge.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    careEscalationReason.textContent = reason;

    if (level !== escalationLevel) {
        escalationLevel = level;
        addCaretakerLog(`Risk level changed to ${level.toUpperCase()}.`);
        addNotification(`System update: escalation moved to ${level.toUpperCase()}.`);
    }
}

function renderTaskList() {
    if (!tasks.length) {
        taskList.innerHTML = "<li class='task-item'>No reminders available.</li>";
        return;
    }

    const sorted = [...tasks].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    taskList.innerHTML = sorted
        .map((task) => {
            const isClosed = task.status === STATUS.COMPLETED || task.status === STATUS.MISSED;
            const dueText = formatDue(task.dueAt);

            return `
            <li class="task-item">
                <div class="task-top">
                    <div>
                        <p class="task-title">${escapeHtml(task.title)}</p>
                        <p class="task-meta">${readableType(task.type)} • ${readablePriority(task.priority)} Priority • Due ${dueText}</p>
                        <p class="task-priority ${normalizePriority(task.priority)}">${readablePriority(task.priority).toUpperCase()} PRIORITY</p>
                    </div>
                    <p class="task-status ${task.status}">${task.status.toUpperCase()}</p>
                </div>
                <div class="task-actions">
                    <button class="btn btn-primary" data-action="complete" data-id="${task.id}" ${isClosed || currentRole !== "patient" ? "disabled" : ""}>Done</button>
                    <button class="btn" data-action="missed" data-id="${task.id}" ${isClosed || currentRole !== "patient" ? "disabled" : ""}>Mark Missed</button>
                </div>
            </li>
            `;
        })
        .join("");
}

function renderCaretakerTaskManager() {
    if (!tasks.length) {
        careTaskManager.innerHTML = "<li class='task-item'>No tasks available for caretaker management.</li>";
        return;
    }

    const sorted = [...tasks].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    careTaskManager.innerHTML = sorted
        .map((task) => {
            const dueText = formatDue(task.dueAt);

            return `
            <li class="task-item">
                <div class="task-top">
                    <div>
                        <p class="task-title">${escapeHtml(task.title)}</p>
                        <p class="task-meta">${readableType(task.type)} • ${readablePriority(task.priority)} Priority • Due ${dueText}</p>
                    </div>
                    <p class="task-status ${task.status}">${task.status.toUpperCase()}</p>
                </div>
                <div class="task-actions">
                    <button class="btn" data-care-task-action="reset" data-id="${task.id}" ${currentRole !== "caretaker" ? "disabled" : ""}>Reset</button>
                </div>
            </li>
            `;
        })
        .join("");
}

function renderSummary() {
    const counts = getTaskCounts();

    tasksToday.textContent = String(counts.total);
    tasksCompleted.textContent = String(counts.completed);
    tasksPending.textContent = String(counts.pendingAndOverdue);
    tasksMissed.textContent = String(counts.missed);

    careTasksTotal.textContent = String(counts.total);
    careTasksCompleted.textContent = String(counts.completed);
    careTasksOverdue.textContent = String(counts.overdue);
    careTasksMissed.textContent = String(counts.missed);
}

function addNotification(message) {
    notifications.unshift({
        id: crypto.randomUUID(),
        message,
        createdAt: Date.now()
    });

    notifications = notifications.slice(0, 10);
}

function addCaretakerLog(message) {
    caretakerLogs.unshift({
        id: crypto.randomUUID(),
        message,
        createdAt: Date.now()
    });

    caretakerLogs = caretakerLogs.slice(0, 14);
}

function renderNotifications() {
    if (!notifications.length) {
        notificationFeed.innerHTML = "<li class='notification-item'>No notifications yet.</li>";
        return;
    }

    notificationFeed.innerHTML = notifications
        .map(
            (item) => `
            <li class="notification-item">
                <p>${escapeHtml(item.message)}</p>
                <p class="notification-time">${formatTime(item.createdAt)}</p>
            </li>
        `
        )
        .join("");
}

function renderAlertsQueue() {
    const alerts = [...tasks]
        .filter(
            (task) =>
                (task.status === STATUS.OVERDUE || task.status === STATUS.MISSED) && isHighPriority(task)
        )
        .sort((a, b) => getAlertPriority(a) - getAlertPriority(b));

    if (!alerts.length) {
        alertsQueue.innerHTML = "<li class='task-item'>No active high-priority alerts.</li>";
        return;
    }

    alertsQueue.innerHTML = alerts
        .map((task) => {
            const dueText = formatDue(task.dueAt);

            return `
            <li class="task-item">
                <div class="task-top">
                    <p class="task-title">${escapeHtml(task.title)}</p>
                    <p class="task-status ${task.status}">${task.status.toUpperCase()}</p>
                </div>
                <p class="task-meta">${readableType(task.type)} • ${readablePriority(task.priority)} Priority • Due ${dueText}</p>
            </li>
            `;
        })
        .join("");
}

function renderPatientTimeline() {
    const timeline = [...tasks]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10);

    if (!timeline.length) {
        patientTimeline.innerHTML = "<li class='notification-item'>No task history yet.</li>";
        return;
    }

    patientTimeline.innerHTML = timeline
        .map((task) => {
            return `
            <li class="notification-item">
                <p>${escapeHtml(task.title)} marked as ${task.status.toUpperCase()}.</p>
                <p class="notification-time">${formatTime(task.updatedAt)}</p>
            </li>
            `;
        })
        .join("");
}

function renderCommunicationLog() {
    const mergedLog = [...caretakerLogs, ...notifications]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 12);

    if (!mergedLog.length) {
        communicationLog.innerHTML = "<li class='notification-item'>No communications logged yet.</li>";
        return;
    }

    communicationLog.innerHTML = mergedLog
        .map((item) => {
            return `
            <li class="notification-item">
                <p>${escapeHtml(item.message)}</p>
                <p class="notification-time">${formatTime(item.createdAt)}</p>
            </li>
            `;
        })
        .join("");
}

function renderClock() {
    const now = new Date();
    currentTime.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    currentDate.textContent = now.toLocaleDateString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function renderChat() {
    if (!chatMessages.length) {
        const emptyMessage = "<li class='chat-item'>No messages yet.</li>";
        patientChatList.innerHTML = emptyMessage;
        caretakerChatList.innerHTML = emptyMessage;
        return;
    }

    const chatMarkup = chatMessages
        .map((entry) => {
            const senderName = entry.senderName || (entry.sender === "patient" ? "Patient" : "Caretaker");

            return `
            <li class="chat-item ${entry.sender}">
                <p class="chat-meta">${escapeHtml(senderName)} • ${formatTime(entry.createdAt)}</p>
                <p>${escapeHtml(entry.message)}</p>
            </li>
            `;
        })
        .join("");

    patientChatList.innerHTML = chatMarkup;
    caretakerChatList.innerHTML = chatMarkup;
}

function render() {
    renderSummary();
    renderTaskList();
    renderCaretakerTaskManager();
    renderChat();
    updateEscalationState();
    renderNotifications();
    renderAlertsQueue();
    renderPatientTimeline();
    renderCommunicationLog();
    renderClock();
}

function setActiveView(view) {
    const showPatient = view === "patient";
    currentView = showPatient ? "patient" : "caretaker";
    patientDashboard.classList.toggle("active", showPatient);
    caretakerDashboard.classList.toggle("active", !showPatient);

    patientTab.setAttribute("aria-selected", String(showPatient));
    caretakerTab.setAttribute("aria-selected", String(!showPatient));

    patientTab.classList.toggle("btn-primary", showPatient);
    caretakerTab.classList.toggle("btn-primary", !showPatient);
}

function getTaskCounts() {
    const total = tasks.length;
    const completed = tasks.filter((task) => task.status === STATUS.COMPLETED).length;
    const overdue = tasks.filter((task) => task.status === STATUS.OVERDUE).length;
    const pendingAndOverdue = tasks.filter(
        (task) => task.status === STATUS.PENDING || task.status === STATUS.OVERDUE
    ).length;
    const missed = tasks.filter((task) => task.status === STATUS.MISSED).length;

    return {
        total,
        completed,
        overdue,
        pendingAndOverdue,
        missed
    };
}

function getAlertPriority(task) {
    if (task.status === STATUS.MISSED && isHighPriority(task)) {
        return 1;
    }

    if (task.type === "medication" && task.status === STATUS.MISSED) {
        return 2;
    }

    if (task.status === STATUS.MISSED) {
        return 3;
    }

    if (task.type === "medication" && task.status === STATUS.OVERDUE) {
        return 4;
    }

    return 5;
}

function handleTaskDeadlineExpiry(task) {
    if (isHighPriority(task)) {
        addNotification(
            `Patient alert: high-priority task is overdue now - ${task.title}. Complete within 10 minutes.`
        );
        return;
    }

    addNotification(`Patient alert: ${readablePriority(task.priority)} priority task overdue - ${task.title}.`);
}

function handleHighPriorityNoResponse(task) {
    addCaretakerLog(
        `AUTO ESCALATION: No response for high-priority ${readableType(task.type).toLowerCase()} task - ${task.title}.`
    );
    addNotification(`Caretaker informed: high-priority task marked MISSED after 10 minutes - ${task.title}.`);
}

function normalizePriority(priority) {
    if (priority === "high" || priority === "low") {
        return priority;
    }

    return "medium";
}

function isHighPriority(task) {
    return normalizePriority(task.priority) === "high";
}

function readablePriority(priority) {
    const normalized = normalizePriority(priority);

    if (normalized === "high") {
        return "High";
    }

    if (normalized === "low") {
        return "Low";
    }

    return "Medium";
}

function readableType(type) {
    if (type === "medication") {
        return "Medication";
    }

    if (type === "appointment") {
        return "Appointment";
    }

    if (type === "water") {
        return "Hydration";
    }

    return "Task";
}

function initializeDueDatePicker() {
    if (typeof flatpickr !== "function") {
        return;
    }

    taskDuePicker = flatpickr(taskDue, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        altInput: true,
        altFormat: "F j, Y h:i K",
        minDate: "today",
        minuteIncrement: 5
    });
}

function getSelectedDueDate() {
    if (taskDuePicker && taskDuePicker.selectedDates.length > 0) {
        return taskDuePicker.selectedDates[0];
    }

    if (!taskDue.value) {
        return null;
    }

    const fallbackDate = new Date(taskDue.value);
    return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

function formatDue(value) {
    return new Date(value).toLocaleString([], {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short"
    });
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

initializeApp();
