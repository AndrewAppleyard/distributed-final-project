const configuredBackend = (window.BACKEND_URL || "").trim();
const fallbackBase = `${window.location.protocol}//${window.location.hostname}:4000`;
const backendBase = (configuredBackend && configuredBackend.replace(/\/+$/, "")) || fallbackBase;
const backendEl = document.getElementById("backend-url");
if (backendEl) backendEl.textContent = backendBase;

async function createTrade() {
  const resBox = document.getElementById("create-result");
  try {
    const body = {
      symbol: document.getElementById("create-symbol").value,
      shares: Number(document.getElementById("create-shares").value),
      buy_price: Number(document.getElementById("create-price").value),
    };
    const res = await fetch(`${backendBase}/trades`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    resBox.textContent = JSON.stringify(payload, null, 2);
    if (res.ok) loadPortfolio();
  } catch (err) {
    resBox.textContent = `Error: ${err.message}`;
  }
}

async function updateTrade() {
  const resBox = document.getElementById("update-result");
  try {
    const symbol = document.getElementById("update-symbol").value;
    const body = { new_price: Number(document.getElementById("update-price").value) };
    const res = await fetch(`${backendBase}/trades/${symbol}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    resBox.textContent = JSON.stringify(payload, null, 2);
    if (res.ok) loadPortfolio();
  } catch (err) {
    resBox.textContent = `Error: ${err.message}`;
  }
}

async function deleteTrade() {
  const resBox = document.getElementById("delete-result");
  try {
    const symbol = document.getElementById("delete-symbol").value;
    const res = await fetch(`${backendBase}/trades/${symbol}`, { method: "DELETE" });
    const payload = await res.json();
    resBox.textContent = JSON.stringify(payload, null, 2);
    if (res.ok) loadPortfolio();
  } catch (err) {
    resBox.textContent = `Error: ${err.message}`;
  }
}

async function loadPortfolio() {
  const resBox = document.getElementById("portfolio");
  try {
    const res = await fetch(`${backendBase}/portfolio`);
    resBox.textContent = JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    resBox.textContent = `Error: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", loadPortfolio);
