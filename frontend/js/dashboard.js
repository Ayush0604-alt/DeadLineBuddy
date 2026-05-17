const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "login.html";
}

// Add "Bearer " prefix for all API calls
const authHeader = `Bearer ${token}`;

let allTasks = [];


// LOAD TASKS
async function loadTasks() {

    try {

        const response = await fetch(
            "http://localhost:5000/api/tasks",
            {
                headers: {
                    Authorization: authHeader
                }
            }
        );

        const tasks = await response.json();

        allTasks = tasks;

        renderTasks(tasks);

        updateStats(tasks);

    } catch (error) {

        console.log(error);

    }

}


// RENDER TASKS
function renderTasks(tasks) {

    const taskList = document.getElementById("taskList");

    taskList.innerHTML = "";

    if (tasks.length === 0) {

        taskList.innerHTML = `
            <div style="text-align:center; margin-top:40px; color:#999;">
                No tasks found. Add one above!
            </div>
        `;

        return;

    }

    tasks.forEach(task => {

        const priorityClass = task.priority
            ? `priority-${task.priority.toLowerCase()}`
            : "";

        taskList.innerHTML += `

        <div class="task-card ${priorityClass}">

            <h2>${task.title}</h2>

            <p>
                <b>Deadline:</b>
                ${new Date(task.deadline).toDateString()}
            </p>

            <p>
                <b>Priority:</b>
                ${task.priority || "N/A"}
            </p>

            <div class="category-badge">
                ${task.category || "General"}
            </div>

            <div class="summary-box">
                <b>AI Summary:</b>
                <p>${task.summary || "No summary available"}</p>
            </div>

            <button onclick="deleteTask('${task._id}')">
                Delete
            </button>

        </div>

        `;

    });

}


// UPDATE STATS
function updateStats(tasks) {

    document.getElementById("totalTasks").innerText =
        tasks.length;

    const highPriority = tasks.filter(
        task => task.priority === "High"
    );

    document.getElementById("highPriority").innerText =
        highPriority.length;

    const completed = tasks.filter(
        task => task.completed
    );

    document.getElementById("completedTasks").innerText =
        completed.length;

}


// SEARCH TASKS
function searchTasks() {

    const value = document
        .getElementById("searchInput")
        .value
        .toLowerCase();

    const filtered = allTasks.filter(task =>

        task.title.toLowerCase().includes(value) ||
        task.category.toLowerCase().includes(value)

    );

    renderTasks(filtered);

}


// CREATE TASK
async function createTask() {

    const title       = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const category    = document.getElementById("category").value;
    const deadline    = document.getElementById("deadline").value;

    if (!title || !deadline) {
        alert("Title and deadline are required");
        return;
    }

    try {

        await fetch(
            "http://localhost:5000/api/tasks",
            {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    Authorization: authHeader
                },

                body: JSON.stringify({
                    title,
                    description,
                    category,
                    deadline
                })

            }
        );

        // Clear form
        document.getElementById("title").value       = "";
        document.getElementById("description").value = "";
        document.getElementById("category").value    = "";
        document.getElementById("deadline").value    = "";

        loadTasks();

    } catch (error) {

        console.log(error);

    }

}


// DELETE TASK
async function deleteTask(id) {

    if (!confirm("Delete this task?")) return;

    try {

        await fetch(
            `http://localhost:5000/api/tasks/${id}`,
            {

                method: "DELETE",

                headers: {
                    Authorization: authHeader
                }

            }
        );

        loadTasks();

    } catch (error) {

        console.log(error);

    }

}


// LOGOUT
function logout() {
    localStorage.removeItem("token");
    window.location.href = "login.html";
}


// INITIAL LOAD
loadTasks();