"use strict";

const title = new URLSearchParams(location.search).get("title");
if (title) {
  document.title = `${title}: waiting for network`;
  document.getElementById("heading").textContent = `${title} is waiting for the network`;
}
document.getElementById("retry").addEventListener("click", () => globalThis.ms365Local?.retry());
