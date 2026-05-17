const API_URL = "http://localhost:5000/api/auth/login";

async function loginUser() {

    const email    = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!email || !password) {
        alert("Please fill in all fields");
        return;
    }

    try {

        const response = await fetch(API_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({ email, password })

        });

        const data = await response.json();

        if (data.token) {

            // Store raw token — dashboard.js adds "Bearer " prefix
            localStorage.setItem("token", data.token);

            window.location.href = "dashboard.html";

        } else {

            alert(data.message || "Login failed");

        }

    } catch (error) {

        console.log(error);

        alert("Something went wrong. Please try again.");

    }

}