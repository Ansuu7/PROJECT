const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("loginError");
const apiBase = (window.APP_CONFIG && window.APP_CONFIG.API_BASE ? window.APP_CONFIG.API_BASE : "").replace(/\/$/, "");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        loginError.textContent = "Please enter username and password.";
        return;
    }

    try {
        const response = await fetch(`${apiBase}/api/login`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) {
            loginError.textContent = data.error || "Login failed.";
            return;
        }

        if (apiBase) {
            window.location.href = "./index.html";
            return;
        }

        window.location.href = data.redirectTo || "/dashboard";
    } catch (error) {
        loginError.textContent = "Unable to login right now.";
    }
});
