const configuredBackend = (window.BACKEND_URL || document.body?.dataset?.backendUrl || "").trim();
const fallbackBackend = `${window.location.protocol}//${window.location.hostname}:4000`;
const backendBase = (configuredBackend && configuredBackend.replace(/\/+$/, "")) || fallbackBackend;

let equityHistory = [];
let equityTimer = null;
let refreshTimer = null;
const STORAGE_KEY = "cardstock_equity_history";
let cachedPositions = [];

const formatCurrency = (val) =>
    `$${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function fetchPortfolio() {
    const res = await fetch(`${backendBase}/portfolio`);
    if (!res.ok) throw new Error("Portfolio fetch failed");
    return res.json();
}

async function fetchBalance() {
    const res = await fetch(`${backendBase}/balance`);
    if (!res.ok) throw new Error("Balance fetch failed");
    return res.json();
}

async function fetchQuote(symbol) {
    const res = await fetch(`${backendBase}/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error("Quote fetch failed");
    return res.json();
}

async function computeEquity() {
    const [portfolio, balanceData] = await Promise.all([fetchPortfolio(), fetchBalance()]);
    const balance = Number(balanceData.balance ?? 0);
    const positions = Array.isArray(portfolio) ? portfolio : [];
    cachedPositions = positions;
    const quotes = await Promise.all(
        positions.map(async (row) => {
            try {
                const q = await fetchQuote(row.symbol);
                return { symbol: row.symbol, quote: q };
            } catch {
                return { symbol: row.symbol, quote: null };
            }
        })
    );
    let totalValue = 0;
    positions.forEach((pos) => {
        const quoteWrap = quotes.find((q) => q.symbol === pos.symbol);
        const quote = quoteWrap?.quote;
        const price = Number(quote?.current ?? quote?.price ?? pos.buy_price ?? 0);
        totalValue += pos.shares * price;
    });
    return { equity: totalValue + balance, balance, positions };
}

function saveHistory() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(equityHistory));
    } catch (err) {
        console.error("Failed to save history", err);
    }
}

function loadHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        equityHistory = stored ? JSON.parse(stored) : [];
    } catch {
        equityHistory = [];
    }
}

function updateStats(equity, balance, positions) {
    const equityEl = document.getElementById("stat-equity");
    const changeEl = document.getElementById("stat-change");
    const cashEl = document.getElementById("stat-cash");
    const posEl = document.getElementById("stat-positions");
    const last = equityHistory.length ? equityHistory[equityHistory.length - 1] : equity;
    const delta = equity - last;
    if (equityEl) equityEl.textContent = formatCurrency(equity);
    if (cashEl) cashEl.textContent = formatCurrency(balance);
    if (posEl) posEl.textContent = positions.length;
    if (changeEl) changeEl.textContent = `Move: ${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
}

function renderAxes(minPoint, maxPoint, count) {
    const yMin = document.getElementById("y-min");
    const yMid = document.getElementById("y-mid");
    const yMax = document.getElementById("y-max");
    const xStart = document.getElementById("x-start");
    const xEnd = document.getElementById("x-end");
    const mid = (minPoint + maxPoint) / 2;
    if (yMin) yMin.textContent = `${minPoint.toFixed(2)}`;
    if (yMid) yMid.textContent = `${mid.toFixed(2)}`;
    if (yMax) yMax.textContent = `${maxPoint.toFixed(2)}`;
    if (xStart) xStart.textContent = count ? "Start" : "--";
    if (xEnd) xEnd.textContent = count ? `#${count}` : "--";
}

function renderEquityHistory() {
    const svg = document.getElementById("equity-chart");
    if (!svg) return;
    if (!equityHistory.length) {
        svg.innerHTML = "";
        return;
    }
    const maxEquity = Math.max(...equityHistory);
    const minEquity = Math.min(...equityHistory);
    const pad = 100;
    const maxPoint = maxEquity + pad;
    const minPoint = Math.max(0, minEquity - pad);
    const len = equityHistory.length;
    const mapped = equityHistory.map((val, idx) => {
        const x = (idx / Math.max(len - 1, 1)) * 100;
        const range = Math.max(maxPoint - minPoint || 1, 1);
        const y = 50 - ((val - minPoint) / range) * 50;
        return `${x},${y}`;
    });
    const points = mapped.join(" ");
    svg.innerHTML = `<polyline class="hover-line" points="${points}" fill="none" stroke="#d4b48c" stroke-width="1.4">
                        <title>${(equityHistory[equityHistory.length - 1] || 0).toFixed(2)}</title>
                     </polyline>`;
    renderAxes(minPoint, maxPoint, equityHistory.length);
}

async function addEquityPoint() {
    try {
        const { equity, balance, positions } = await computeEquity();
        equityHistory.push(equity);
        saveHistory();
        updateStats(equity, balance, positions);
    } catch (err) {
        console.error("Equity fetch failed", err);
    }
}

async function initializeMetrics() {
    loadHistory();
    await addEquityPoint();
    renderEquityHistory();
    try {
        const { equity, balance, positions } = await computeEquity();
        updateStats(equity, balance, positions);
    } catch (err) {
        console.error(err);
    }
    const refreshButton = document.getElementById("refresh-metrics");
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            renderEquityHistory();
        });
    }
    const sellAllBtn = document.getElementById("sell-all");
    const sellModal = document.getElementById("sell-modal");
    const sellCancel = document.getElementById("sell-cancel");
    const sellConfirm = document.getElementById("sell-confirm");
    const closeSellModal = () => sellModal && sellModal.classList.add("hidden");
    const openSellModal = () => sellModal && sellModal.classList.remove("hidden");

    if (sellAllBtn) sellAllBtn.addEventListener("click", openSellModal);
    if (sellCancel) sellCancel.addEventListener("click", closeSellModal);
    if (sellModal) {
        sellModal.addEventListener("click", (e) => {
            if (e.target === sellModal) closeSellModal();
        });
    }
    if (sellConfirm) {
        sellConfirm.addEventListener("click", async () => {
            try {
                const symbolList = cachedPositions.map((p) => p.symbol);
                for (const sym of symbolList) {
                    await fetch(`${backendBase}/trades/${encodeURIComponent(sym)}`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                    });
                }
                await addEquityPoint();
                renderEquityHistory();
            } catch (err) {
                console.error("Sell all failed", err);
            } finally {
                closeSellModal();
            }
        });
    }
    equityTimer = setInterval(addEquityPoint, 10000);
    refreshTimer = setInterval(() => {
        renderEquityHistory();
    }, 20000);
}

document.addEventListener("DOMContentLoaded", initializeMetrics);
