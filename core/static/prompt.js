"use strict";

// Display strings arrive as query parameters; the secret leaves only through
// ms365Local.promptSubmit and is never put anywhere else.
const q = new URLSearchParams(location.search);
const text = (id, value) => {
  const el = document.getElementById(id);
  el.textContent = value ?? "";
  return el;
};
document.title = q.get("title") || "Sign in";
text("heading", q.get("heading"));
text("message", q.get("message"));
if (q.get("warning")) text("warning", q.get("warning")).hidden = false;
text("secret-label", q.get("secretLabel") || "Password");
text("submit", q.get("submitLabel") || "OK");
const user = document.getElementById("user");
if (q.get("askUser") === "1") {
  document.getElementById("user-row").hidden = false;
  user.value = q.get("user") || "";
}
const secret = document.getElementById("secret");
(q.get("askUser") === "1" && !user.value ? user : secret).focus();

document.getElementById("form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!secret.value) return;
  globalThis.ms365Local?.promptSubmit({ user: user.value, secret: secret.value });
  secret.value = "";
});
document.getElementById("cancel").addEventListener("click", () => globalThis.ms365Local?.promptCancel());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") globalThis.ms365Local?.promptCancel();
});
