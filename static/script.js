const SPLASH = document.querySelector(".splash");
const PROFILE = document.querySelector(".profile");
const LOGIN = document.querySelector(".login");
const ROOM = document.querySelector(".room");

const passwordField = document.querySelector("#update_password");
const repeatPasswordField = document.querySelector("#repeat_password");

let CURRENT_ROOM = 0;
let POLL_TIMER = null;
let RETURN_TO = null;
let CURRENT_USER = null;

const apiKey = () => localStorage.getItem("api_key");

const apiFetch = async (url, options = {}) => {
  const headers = options.headers || {};
  headers["Content-Type"] = "application/json";

  const key = apiKey();
  if (key) headers["X-API-Key"] = key;

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw data;
  }

  return data;
};

const checkPasswordRepeat = () => {
  const p = passwordField.value;

  if (p.length < 5) {
    passwordField.setCustomValidity("Password must be at least 5 characters long");
  } else if (p == "12345") {
    passwordField.setCustomValidity("That's the kind of password an idiot would have on his luggage!");
  } else {
    passwordField.setCustomValidity("");

    if (passwordField.value != repeatPasswordField.value) {
      repeatPasswordField.setCustomValidity("Password doesn't match");
    } else {
      repeatPasswordField.setCustomValidity("");
    }
  }

  passwordField.reportValidity();
  repeatPasswordField.reportValidity();
};

passwordField.addEventListener("input", checkPasswordRepeat);
repeatPasswordField.addEventListener("input", checkPasswordRepeat);

const stopPolling = () => {
  if (POLL_TIMER) {
    clearInterval(POLL_TIMER);
    POLL_TIMER = null;
  }
};

const showOnly = (element) => {
  stopPolling();
  CURRENT_ROOM = 0;

  SPLASH.classList.add("hide");
  PROFILE.classList.add("hide");
  LOGIN.classList.add("hide");
  ROOM.classList.add("hide");

  element.classList.remove("hide");
};

const isLoggedIn = () => !!apiKey();

const updateUserText = () => {
  const name = CURRENT_USER ? CURRENT_USER.name : "";
  document.querySelectorAll(".username").forEach((el) => {
    if (el.textContent.includes("Welcome back")) {
      el.textContent = `Welcome back, ${name}!`;
    } else {
      el.textContent = name;
    }
  });

  const input = document.querySelector("#update_username");
  if (input && CURRENT_USER) {
    input.value = CURRENT_USER.name;
  }

  document.querySelectorAll(".loggedIn").forEach((el) => {
    el.classList.toggle("hide", !isLoggedIn());
  });

  document.querySelectorAll(".loggedOut").forEach((el) => {
    el.classList.toggle("hide", isLoggedIn());
  });

  document.querySelectorAll(".create").forEach((el) => {
    el.classList.toggle("hide", !isLoggedIn());
  });

  document.querySelectorAll(".signup").forEach((el) => {
    el.classList.toggle("hide", isLoggedIn());
  });
};

const loadMe = async () => {
  if (!isLoggedIn()) {
    CURRENT_USER = null;
    updateUserText();
    return null;
  }

  try {
    CURRENT_USER = await apiFetch("/api/me");
    updateUserText();
    return CURRENT_USER;
  } catch {
    localStorage.removeItem("api_key");
    CURRENT_USER = null;
    updateUserText();
    return null;
  }
};

const renderRooms = async () => {
  const roomList = document.querySelector(".roomList");
  const noRooms = document.querySelector(".noRooms");

  roomList.innerHTML = "";

  if (!isLoggedIn()) {
    noRooms.classList.remove("hide");
    return;
  }

  const rooms = await apiFetch("/api/rooms");

  if (rooms.length === 0) {
    noRooms.classList.remove("hide");
    return;
  }

  noRooms.classList.add("hide");

  rooms.forEach((room) => {
    const a = document.createElement("a");
    a.href = `/room/${room.id}`;
    a.innerHTML = `${room.id}: <strong>${room.name}</strong>`;
    a.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(`/room/${room.id}`);
    });
    roomList.appendChild(a);
  });
};

const renderMessages = (messages) => {
  const messagesDiv = document.querySelector(".messages");
  messagesDiv.innerHTML = "";

  messages.forEach((message) => {
    const messageEl = document.createElement("message");

    const authorEl = document.createElement("author");
    authorEl.textContent = message.username;

    const contentEl = document.createElement("content");
    contentEl.textContent = message.body;

    messageEl.appendChild(authorEl);
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);
  });
};

const loadMessages = async () => {
  if (!CURRENT_ROOM) return;

  try {
    const messages = await apiFetch(`/api/messages/room/${CURRENT_ROOM}`);
    document.querySelector(".messages").classList.remove("hide");
    document.querySelector(".noMessages").classList.add("hide");
    renderMessages(messages);
  } catch {
    document.querySelector(".messages").classList.add("hide");
    document.querySelector(".noMessages").classList.remove("hide");
  }
};

const startPolling = () => {
  stopPolling();
  loadMessages();
  POLL_TIMER = setInterval(loadMessages, 500);
};

const showRoom = async (roomId) => {
  showOnly(ROOM);
  CURRENT_ROOM = roomId;

  try {
    const room = await apiFetch(`/api/rooms/${roomId}`);
    document.querySelector(".displayRoomName strong").textContent = room.name;
    document.querySelector(".editRoomName input").value = room.name;
    document.querySelector(".roomDetail > a").textContent = `/room/${room.id}`;
    document.querySelector(".roomDetail > a").href = `/room/${room.id}`;
    document.querySelector(".displayRoomName").classList.remove("hide");
    document.querySelector(".editRoomName").classList.add("hide");
  } catch {
    document.querySelector(".messages").classList.add("hide");
    document.querySelector(".noMessages").classList.remove("hide");
    return;
  }

  startPolling();
};

const router = async () => {
  await loadMe();

  const path = window.location.pathname;

  if (path === "/") {
    showOnly(SPLASH);
    await renderRooms();
    return;
  }

  if (path === "/login") {
    if (isLoggedIn()) {
      navigate("/");
    } else {
      showOnly(LOGIN);
    }
    return;
  }

  if (!isLoggedIn()) {
    RETURN_TO = path;
    navigate("/login");
    return;
  }

  if (path === "/profile") {
    showOnly(PROFILE);
    return;
  }

  if (path.startsWith("/room/")) {
    const roomId = path.split("/")[2];
    await showRoom(roomId);
    return;
  }

  if (path === "/room") {
    showOnly(ROOM);
    return;
  }

  showOnly(SPLASH);
};

const navigate = (path) => {
  history.pushState({}, "", path);
  router();
};

window.addEventListener("popstate", router);

document.querySelectorAll(".header h2 a").forEach((a) => {
  a.addEventListener("click", () => navigate("/"));
});

document.querySelectorAll(".welcomeBack").forEach((a) => {
  a.addEventListener("click", () => navigate("/profile"));
});

document.querySelector(".loggedOut a").addEventListener("click", () => {
  navigate("/login");
});

document.querySelector(".signup").addEventListener("click", async () => {
  const user = await apiFetch("/api/signup", {
    method: "POST",
    body: JSON.stringify({}),
  });

  localStorage.setItem("api_key", user.api_key);
  await loadMe();
  navigate("/profile");
});

document.querySelector(".create").addEventListener("click", async () => {
  const name = prompt("Room name?", "New Room") || "New Room";

  const room = await apiFetch("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  navigate(`/room/${room.id}`);
});

document.querySelector(".alignedForm.login button").addEventListener("click", async () => {
  const username = document.querySelector("#login_username").value;
  const password = document.querySelector("#login_password").value;

  try {
    const user = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    localStorage.setItem("api_key", user.api_key);
    document.querySelector(".failed").classList.add("hide");

    const destination = RETURN_TO || "/";
    RETURN_TO = null;
    navigate(destination);
  } catch {
    document.querySelector(".failed").classList.remove("hide");
  }
});

document.querySelector(".failed button").addEventListener("click", async () => {
  const user = await apiFetch("/api/signup", {
    method: "POST",
    body: JSON.stringify({}),
  });

  localStorage.setItem("api_key", user.api_key);
  navigate("/profile");
});

document.querySelector(".logout").addEventListener("click", () => {
  localStorage.removeItem("api_key");
  CURRENT_USER = null;
  window.location.href = "/";
});

document.querySelector(".goToSplash").addEventListener("click", () => {
  navigate("/");
});

document.querySelector("#update_username + button").addEventListener("click", async () => {
  const name = document.querySelector("#update_username").value;

  await apiFetch("/api/me/name", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  await loadMe();
});

document.querySelector("#update_password + button").addEventListener("click", async () => {
  const password = document.querySelector("#update_password").value;

  if (!passwordField.checkValidity() || !repeatPasswordField.checkValidity()) return;

  await apiFetch("/api/me/password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });

  passwordField.value = "";
  repeatPasswordField.value = "";
});

document.querySelector(".displayRoomName a").addEventListener("click", () => {
  document.querySelector(".displayRoomName").classList.add("hide");
  document.querySelector(".editRoomName").classList.remove("hide");
});

document.querySelector(".editRoomName button").addEventListener("click", async () => {
  const name = document.querySelector(".editRoomName input").value;

  const room = await apiFetch(`/api/rooms/${CURRENT_ROOM}`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  document.querySelector(".displayRoomName strong").textContent = room.name;
  document.querySelector(".editRoomName").classList.add("hide");
  document.querySelector(".displayRoomName").classList.remove("hide");
});

document.querySelector(".comment_box button").addEventListener("click", async () => {
  const textarea = document.querySelector("textarea[name='comment']");
  const body = textarea.value.trim();

  if (!body || !CURRENT_ROOM) return;

  await apiFetch("/api/messages", {
    method: "POST",
    body: JSON.stringify({
      room_id: CURRENT_ROOM,
      body,
    }),
  });

  textarea.value = "";
  await loadMessages();
});

document.querySelector(".noMessages a").addEventListener("click", () => {
  navigate("/");
});

router();