const taskForm = document.getElementById("taskForm");
const taskType = document.getElementById("taskType");
const taskTitle = document.getElementById("taskTitle");
const taskDue = document.getElementById("taskDue");
const taskList = document.getElementById("taskList");
const patientTab = document.getElementById("patientTab");
const caretakerTab = document.getElementById("caretakerTab");
const patientDashboard = document.getElementById("patientDashboard");
const caretakerDashboard = document.getElementById("caretakerDashboard");

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

let tasks = [
    {
        id: crypto.randomUUID(),
        type: "medication",
        title: "Blood pressure tablet",
        dueAt: getTodayAtTime(9, 0),
        status: STATUS.PENDING,
        updatedAt: Date.now()
    },
    {
        id: crypto.randomUUID(),
        type: "water",
        title: "Drink 1 glass of water",
        dueAt: getTodayAtTime(11, 30),
        status: STATUS.PENDING,
        updatedAt: Date.now()
    },
    {
        id: crypto.randomUUID(),
        type: "appointment",
        title: "Doctor follow-up call",
        dueAt: getTodayAtTime(17, 0),
        status: STATUS.PENDING,
        updatedAt: Date.now()
    }
];

let notifications = [];
let caretakerLogs = [];
let escalationLevel = ESCALATION.NORMAL;

patientTab.addEventListener("click", () => {
    setActiveView("patient");
});

caretakerTab.addEventListener("click", () => {
    setActiveView("caretaker");
});

taskForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const selectedDueDate = getSelectedDueDate();
    if (!selectedDueDate) {
        return;
    }

    const newTask = {
        id: crypto.randomUUID(),
        type: taskType.value,
        title: taskTitle.value.trim(),
        dueAt: selectedDueDate.toISOString(),
        status: STATUS.PENDING,
        updatedAt: Date.now()
    };

    tasks.unshift(newTask);
    taskForm.reset();
    if (taskDuePicker) {
        taskDuePicker.clear();
    }
    addNotification(`New ${readableType(newTask.type)} reminder added: ${newTask.title}`);
    evaluateTaskStatuses();
    render();
});

taskList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) {
        return;
    }

    const taskId = actionButton.dataset.id;
    const action = actionButton.dataset.action;
    const selectedTask = tasks.find((task) => task.id === taskId);
    if (!selectedTask) {
        return;
    }

    if (action === "complete") {
        selectedTask.status = STATUS.COMPLETED;
        selectedTask.updatedAt = Date.now();
        addNotification(`Task completed: ${selectedTask.title}`);
    }

    if (action === "missed") {
        selectedTask.status = STATUS.MISSED;
        selectedTask.updatedAt = Date.now();
        addNotification(`Task missed: ${selectedTask.title}`);
    }

    if (action === "reset") {
        selectedTask.status = STATUS.PENDING;
        selectedTask.updatedAt = Date.now();
        addNotification(`Task reset to pending: ${selectedTask.title}`);
    }

    evaluateTaskStatuses();
    render();
});

manualCheckIn.addEventListener("click", () => {
    addNotification("Manual check-in sent to caretaker.");
    addCaretakerLog("Patient requested manual check-in support.");
    caretakerUpdate.textContent = "Caretaker has been prompted for a live check-in.";
    render();
});

quickActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-care-action]");
    if (!button) {
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

    render();
});

function evaluateTaskStatuses() {
    const now = Date.now();

    tasks = tasks.map((task) => {
        if (task.status === STATUS.COMPLETED || task.status === STATUS.MISSED) {
            return task;
        }

        const due = new Date(task.dueAt).getTime();
        if (now > due + 30 * 60 * 1000) {
            return { ...task, status: STATUS.OVERDUE };
        }

        return { ...task, status: STATUS.PENDING };
    });
}

function updateEscalationState() {
    const missed = tasks.filter((task) => task.status === STATUS.MISSED);
    const overdue = tasks.filter((task) => task.status === STATUS.OVERDUE);
    const missedMedication = tasks.some(
        (task) => task.type === "medication" && task.status === STATUS.MISSED
    );

    let level = ESCALATION.NORMAL;
    let reason = "All critical routines are on track.";
    let caretakerMessage = "No action needed right now.";

    if (missedMedication || missed.length >= 3 || overdue.length >= 4) {
        level = ESCALATION.CRITICAL;
        reason = "Immediate attention required for missed critical care routines.";
        caretakerMessage = "Critical alert sent: contact user now and prepare emergency escalation.";
    } else if (missed.length >= 1 || overdue.length >= 2) {
        level = ESCALATION.WARNING;
        reason = "Some reminders are not being completed on time.";
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
            const dueText = new Date(task.dueAt).toLocaleString([], {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "short"
            });

            return `
			<li class="task-item">
				<div class="task-top">
					<div>
						<p class="task-title">${escapeHtml(task.title)}</p>
						<p class="task-meta">${readableType(task.type)} • Due ${dueText}</p>
					</div>
					<p class="task-status ${task.status}">${task.status.toUpperCase()}</p>
				</div>
				<div class="task-actions">
					<button class="btn btn-primary" data-action="complete" data-id="${task.id}" ${isClosed ? "disabled" : ""}>Done</button>
					<button class="btn" data-action="missed" data-id="${task.id}" ${isClosed ? "disabled" : ""}>Mark Missed</button>
					<button class="btn" data-action="reset" data-id="${task.id}">Reset</button>
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

    notifications = notifications.slice(0, 8);
}

function addCaretakerLog(message) {
    caretakerLogs.unshift({
        id: crypto.randomUUID(),
        message,
        createdAt: Date.now()
    });

    caretakerLogs = caretakerLogs.slice(0, 10);
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
				<p class="notification-time">${new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })}</p>
			</li>
		`
        )
        .join("");
}

function renderAlertsQueue() {
    const alerts = [...tasks]
        .filter((task) => task.status === STATUS.OVERDUE || task.status === STATUS.MISSED)
        .sort((a, b) => getAlertPriority(a) - getAlertPriority(b));

    if (!alerts.length) {
        alertsQueue.innerHTML = "<li class='task-item'>No active alerts. Patient is on track.</li>";
        return;
    }

    alertsQueue.innerHTML = alerts
        .map((task) => {
            const dueText = new Date(task.dueAt).toLocaleString([], {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "short"
            });

            return `
            <li class="task-item">
                <div class="task-top">
                    <p class="task-title">${escapeHtml(task.title)}</p>
                    <p class="task-status ${task.status}">${task.status.toUpperCase()}</p>
                </div>
                <p class="task-meta">${readableType(task.type)} • Due ${dueText}</p>
            </li>
            `;
        })
        .join("");
}

function renderPatientTimeline() {
    const timeline = [...tasks]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8);

    if (!timeline.length) {
        patientTimeline.innerHTML = "<li class='notification-item'>No task history yet.</li>";
        return;
    }

    patientTimeline.innerHTML = timeline
        .map((task) => {
            const timestamp = new Date(task.updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            return `
            <li class="notification-item">
                <p>${escapeHtml(task.title)} marked as ${task.status.toUpperCase()}.</p>
                <p class="notification-time">${timestamp}</p>
            </li>
            `;
        })
        .join("");
}

function renderCommunicationLog() {
    const mergedLog = [...caretakerLogs, ...notifications]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);

    if (!mergedLog.length) {
        communicationLog.innerHTML = "<li class='notification-item'>No communications logged yet.</li>";
        return;
    }

    communicationLog.innerHTML = mergedLog
        .map((item) => {
            const time = new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

            return `
            <li class="notification-item">
                <p>${escapeHtml(item.message)}</p>
                <p class="notification-time">${time}</p>
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

function render() {
    renderSummary();
    renderTaskList();
    updateEscalationState();
    renderNotifications();
    renderAlertsQueue();
    renderPatientTimeline();
    renderCommunicationLog();
    renderClock();
}

function setActiveView(view) {
    const showPatient = view === "patient";
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
    if (task.type === "medication" && task.status === STATUS.MISSED) {
        return 1;
    }

    if (task.status === STATUS.MISSED) {
        return 2;
    }

    if (task.type === "medication" && task.status === STATUS.OVERDUE) {
        return 3;
    }

    return 4;
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

function getTodayAtTime(hours, minutes) {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
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

function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

addNotification("System initialized. Caretaker monitoring is active.");
addCaretakerLog("Caretaker dashboard monitoring started.");
initializeDueDatePicker();
evaluateTaskStatuses();
render();

setInterval(() => {
    renderClock();
}, 1000);

setInterval(() => {
    evaluateTaskStatuses();
    renderClock();
    renderSummary();
    renderTaskList();
    updateEscalationState();
}, 30 * 1000);
