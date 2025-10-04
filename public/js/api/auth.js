// public/js/api/auth.js

/**
 * Attempts to sign up a new user.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<object>} The server's JSON response.
 */
async function signup(email, password) {
  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      // If the server response is not OK (e.g., 400, 500), throw an error to be caught by the caller.
      throw new Error(data.error || "An unknown error occurred.");
    }

    return data;
  } catch (error) {
    console.error("Signup API call failed:", error);
    // Re-throw the error so the UI can handle it
    throw error;
  }
}

/**
 * Attempts to log in a user.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<object>} The server's JSON response with the auth token.
 */
async function login(email, password) {
  // We will implement this function in a later task.
  console.log("Login function called, but not yet implemented.");
  return Promise.resolve({ message: "Login endpoint not ready." });
}

// Export the functions to be used by other parts of our frontend
export { signup, login };
