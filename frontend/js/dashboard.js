const token =
localStorage.getItem("token");

if (!token) {

    window.location.href =
    "login.html";

}


let allTasks = [];


// LOAD TASKS
async function loadTasks() {

    try {

        const response =
            await fetch(
                "http://localhost:5000/api/tasks",
                {
                    headers: {
                        Authorization: token
                    }
                }
            );

        const tasks =
            await response.json();

        allTasks = tasks;

        renderTasks(tasks);

        updateStats(tasks);

    } catch (error) {

        console.log(error);

    }

}


// RENDER TASKS
function renderTasks(tasks) {

    const taskList =
        document.getElementById(
            "taskList"
        );

    taskList.innerHTML = "";

    tasks.forEach(task => {

        const priorityClass =
            task.priority
                ? `priority-${task.priority.toLowerCase()}`
                : "";

        taskList.innerHTML += `

        <div class="task-card ${priorityClass}">

            <h2>
                ${task.title}
            </h2>

            <p>
                <b>Deadline:</b>
                ${new Date(task.deadline)
                    .toDateString()}
            </p>

            <p>
                <b>Priority:</b>
                ${task.priority}
            </p>

            <div class="category-badge">
                ${task.category}
            </div>

            <div class="summary-box">

                <b>AI Summary:</b>

                <p>
                    ${task.summary || "No summary"}
                </p>

            </div>

            <button
                onclick="deleteTask('${task._id}')"
            >
                Delete
            </button>

        </div>

        `;

    });

}


// UPDATE STATS
function updateStats(tasks) {

    document.getElementById(
        "totalTasks"
    ).innerText =
    tasks.length;

    const highPriority =
        tasks.filter(
            task =>
            task.priority === "High"
        );

    document.getElementById(
        "highPriority"
    ).innerText =
    highPriority.length;

    const completed =
        tasks.filter(
            task =>
            task.completed
        );

    document.getElementById(
        "completedTasks"
    ).innerText =
    completed.length;

}


// SEARCH TASKS
function searchTasks() {

    const value =
        document.getElementById(
            "searchInput"
        )
        .value
        .toLowerCase();

    const filtered =
        allTasks.filter(task =>

            task.title
                .toLowerCase()
                .includes(value)

            ||

            task.category
                .toLowerCase()
                .includes(value)

        );

    renderTasks(filtered);

}


// CREATE TASK
async function createTask() {

    const title =
        document.getElementById(
            "title"
        ).value;

    const description =
        document.getElementById(
            "description"
        ).value;

    const category =
        document.getElementById(
            "category"
        ).value;

    const deadline =
        document.getElementById(
            "deadline"
        ).value;


    try {

        await fetch(
            "http://localhost:5000/api/tasks",
            {

                method: "POST",

                headers: {

                    "Content-Type":
                    "application/json",

                    Authorization:
                    token

                },

                body: JSON.stringify({

                    title,
                    description,
                    category,
                    deadline

                })

            }
        );

        loadTasks();

    } catch (error) {

        console.log(error);

    }

}


// DELETE TASK
async function deleteTask(id) {

    try {

        await fetch(
            `http://localhost:5000/api/tasks/${id}`,
            {

                method: "DELETE",

                headers: {
                    Authorization: token
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

    localStorage.removeItem(
        "token"
    );

    window.location.href =
    "login.html";

}


// INITIAL LOAD
loadTasks();