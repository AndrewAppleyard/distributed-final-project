const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatPercent = (value) => `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}%`;
const formatDateTime = (epochSeconds) => new Date(epochSeconds * 1000).toLocaleString();
let currentQuotePrice = 0;
let currentBalance = null;
let currentShares = 0;
let loaderInterval = null;

function startLoader() {
    const overlay = document.getElementById("loader-overlay");
    const spans = Array.from(document.querySelectorAll("#loader-circle span"));
    spans.forEach((s) => (s.style.opacity = "0"));
    if (overlay) overlay.classList.remove("hidden");
    let mode = "show";
    let idx = 0;
    if (loaderInterval) clearInterval(loaderInterval);
    loaderInterval = setInterval(() => {
        if (!spans.length) return;
        spans[idx].style.opacity = mode === "show" ? "1" : "0";
        idx += 1;
        if (idx >= spans.length) {
            idx = 0;
            mode = mode === "show" ? "hide" : "show";
        }
    }, 250);
}

function stopLoader() {
    if (loaderInterval) {
        clearInterval(loaderInterval);
        loaderInterval = null;
    }
    const overlay = document.getElementById("loader-overlay");
    const spans = document.querySelectorAll("#loader-circle span");
    spans.forEach((s) => (s.style.opacity = "0"));
    if (overlay) overlay.classList.add("hidden");
}

function resolveBackendBase() {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    const el = document.getElementById("stock-page");
    const configured = (el?.dataset.backend || "").trim() || (window.BACKEND_URL || "").trim();
    const fallback = `${proto}//${host}:4000`;
    return (configured && configured.replace(/\/+$/, "")) || fallback;
}

async function loadStockQuote() {
    const page = document.getElementById("stock-page");
    if (!page) return;
    const symbol = (page.dataset.symbol || "").toUpperCase();
    const backendBase = resolveBackendBase();

    const priceEl = document.getElementById("quote-price");
    const changeEl = document.getElementById("quote-change");
    const timeEl = document.getElementById("quote-time");

    try {
        const res = await fetch(`${backendBase}/quote/${encodeURIComponent(symbol)}`);
        if (!res.ok) throw new Error(`Quote lookup failed (${res.status})`);
        const data = await res.json();

        const price = Number(data.current ?? data.price ?? 0);
        currentQuotePrice = price;
        const change = Number(data.change ?? 0);
        const pct = Number(data.percent_change ?? data.percentChange ?? 0);

        priceEl.textContent = formatCurrency(price);
        changeEl.textContent = `${formatPercent(pct)} (${formatCurrency(change)})`;
        changeEl.classList.toggle("up", change >= 0);
        changeEl.classList.toggle("down", change < 0);
        timeEl.textContent = data.timestamp ? `As of ${formatDateTime(Number(data.timestamp))}` : "";

        const mapField = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = formatCurrency(val);
        };

        mapField("quote-open", data.open ?? 0);
        mapField("quote-prev", data.prev_close ?? data.prevClose ?? 0);
        mapField("quote-high", data.high ?? 0);
        mapField("quote-low", data.low ?? 0);
    } catch (err) {
        priceEl.textContent = "N/A";
        changeEl.textContent = "Unavailable";
        timeEl.textContent = err.message;
    }
}

function setButtons(inPortfolio) {
    const buy = document.getElementById("buy-btn");
    const update = document.getElementById("update-btn");
    const sell = document.getElementById("sell-btn");
    const estimate = document.getElementById("sell-all-estimate");
    if (!buy || !update || !sell) return;

    if (inPortfolio) {
        buy.classList.add("hidden");
        update.classList.remove("hidden");
        sell.classList.remove("hidden");
        if (estimate) {
            const proceeds = currentShares * currentQuotePrice;
            estimate.textContent = `Sell all proceeds: ${formatCurrency(proceeds)}`;
            estimate.classList.add("sell-estimate");
        }
    } else {
        buy.classList.remove("hidden");
        update.classList.add("hidden");
        sell.classList.add("hidden");
        if (estimate) {
            estimate.textContent = "";
            estimate.classList.remove("sell-estimate");
        }
    }
}

async function loadPortfolioStatus() {
    const page = document.getElementById("stock-page");
    if (!page) return;
    const symbol = (page.dataset.symbol || "").toUpperCase();
    const backendBase = resolveBackendBase();
    try {
        const res = await fetch(`${backendBase}/portfolio`);
        if (!res.ok) throw new Error(`Portfolio lookup failed (${res.status})`);
        const data = await res.json();
        const match =
            Array.isArray(data) && data.find((row) => (row.symbol || "").toUpperCase() === symbol);
        const inPortfolio = Boolean(match);
        currentShares = match ? Number(match.shares || 0) : 0;
        setButtons(inPortfolio);
    } catch (err) {
        // default to buy-only if portfolio check fails
        setButtons(false);
    }
}

async function loadBalance() {
    const backendBase = resolveBackendBase();
    const chip = document.getElementById("balance-chip");
    try {
        const res = await fetch(`${backendBase}/balance`);
        if (!res.ok) throw new Error(`Balance lookup failed (${res.status})`);
        const data = await res.json();
        currentBalance = Number(data.balance ?? 0);
        if (chip) chip.textContent = `Balance: ${formatCurrency(currentBalance)}`;
    } catch (err) {
        if (chip) chip.textContent = "Balance: N/A";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadStockQuote();
    setInterval(loadStockQuote, 5000);
    loadPortfolioStatus();
    loadBalance();
});

function openBuyModal() {
    const modal = document.getElementById("buy-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeBuyModal() {
    const modal = document.getElementById("buy-modal");
    if (modal) modal.classList.add("hidden");
}

function wireBuyModal() {
    const buyBtn = document.getElementById("buy-btn");
    const modal = document.getElementById("buy-modal");
    const closeBtn = document.getElementById("buy-close");
    const cancelBtn = document.getElementById("buy-cancel");
    const form = document.getElementById("buy-form");
    const sharesInput = document.getElementById("buy-shares");
    const amountInput = document.getElementById("buy-amount");
    const page = document.getElementById("stock-page");

    if (buyBtn) buyBtn.addEventListener("click", openBuyModal);
    [closeBtn, cancelBtn].forEach((btn) => btn && btn.addEventListener("click", closeBuyModal));

    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeBuyModal();
        });
    }

    const syncFromShares = () => {
        const shares = Number(sharesInput.value) || 0;
        const total = currentQuotePrice * shares;
        if (!Number.isNaN(total) && amountInput) amountInput.value = total.toFixed(2);
    };

    const syncFromAmount = () => {
        const amount = Number(amountInput.value) || 0;
        const shares = currentQuotePrice ? amount / currentQuotePrice : 0;
        if (!Number.isNaN(shares) && sharesInput) sharesInput.value = shares.toFixed(4);
    };

    if (sharesInput) sharesInput.addEventListener("input", syncFromShares);
    if (amountInput) amountInput.addEventListener("input", syncFromAmount);

    if (form && page) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const symbol = (page.dataset.symbol || "").toUpperCase();
            const backendBase = resolveBackendBase();
            const sharesVal = Number(sharesInput.value) || 0;
            if (!sharesVal || !currentQuotePrice) return;
            const totalCost = sharesVal * currentQuotePrice;
            if (currentBalance !== null && totalCost > currentBalance) {
                showAlert("Insufficient balance for this buy", "red");
                return;
            }
            const payload = {
                symbol,
                shares: sharesVal,
                buy_price: currentQuotePrice,
            };
            try {
                const res = await fetch(`${backendBase}/trades`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `Buy failed (${res.status})`);
                closeBuyModal();
                setButtons(true);
                if (typeof data.balance === "number") {
                    currentBalance = data.balance;
                    const chip = document.getElementById("balance-chip");
                    if (chip) chip.textContent = `Balance: ${formatCurrency(currentBalance)}`;
                } else {
                    loadBalance();
                }
                showAlert("Buy completed", "green");
                loadPortfolioStatus();
            } catch (err) {
                showAlert(err.message || "Buy failed", "red");
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    wireBuyModal();
    wireSellModal();
    wireUpdateModal();
});

function showAlert(message, variant = "gray") {
    const alert = document.createElement("div");
    alert.className = `alert-banner alert-${variant}`;
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3500);
}

function wireSellModal() {
    const sellBtn = document.getElementById("sell-btn");
    const modal = document.getElementById("sell-modal");
    const closeBtn = document.getElementById("sell-close");
    const cancelBtn = document.getElementById("sell-cancel");
    const confirmBtn = document.getElementById("sell-confirm");
    const page = document.getElementById("stock-page");

    const closeModal = () => modal && modal.classList.add("hidden");
    const openModal = () => modal && modal.classList.remove("hidden");

    if (sellBtn) sellBtn.addEventListener("click", openModal);
    [closeBtn, cancelBtn].forEach((btn) => btn && btn.addEventListener("click", closeModal));
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (confirmBtn && page) {
        confirmBtn.addEventListener("click", async () => {
            const symbol = (page.dataset.symbol || "").toUpperCase();
            const backendBase = resolveBackendBase();
            try {
                const res = await fetch(`${backendBase}/trades/${encodeURIComponent(symbol)}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                });
                const data = await res.json();
                closeModal();
                setButtons(false);
                const gain = Number(data.net_gain ?? 0);
                const variant = gain > 0 ? "green" : gain < 0 ? "red" : "gray";
                if (typeof data.balance === "number") {
                    currentBalance = data.balance;
                    const chip = document.getElementById("balance-chip");
                    if (chip) chip.textContent = `Balance: ${formatCurrency(currentBalance)}`;
                } else {
                    loadBalance();
                }
                showAlert(`Net gain: ${gain >= 0 ? "+" : ""}${gain.toFixed(2)}`, variant);
            } catch (err) {
                closeModal();
                showAlert("Sell failed", "red");
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // already wired above
});

function wireUpdateModal() {
    const updateBtn = document.getElementById("update-btn");
    const modal = document.getElementById("update-modal");
    const closeBtn = document.getElementById("update-close");
    const cancelBtn = document.getElementById("update-cancel");
    const confirmBtn = document.getElementById("update-confirm");
    const slider = document.getElementById("update-slider");
    const deltaEl = document.getElementById("update-delta");
    const valueEl = document.getElementById("update-value");
    const balanceEl = document.getElementById("update-balance");
    const page = document.getElementById("stock-page");
    const loader = document.getElementById("loader-overlay");
    let dragging = false;

    const positionFollow = () => {
        if (!slider || !deltaEl) return;
        const min = Number(slider.min) || 0;
        const max = Number(slider.max) || 0;
        const val = Number(slider.value) || 0;
        const pct = max > min ? (val - min) / (max - min) : 0.5;
        const follow = deltaEl.parentElement;
        if (follow) {
            follow.style.position = "relative";
            follow.style.height = "32px";
            deltaEl.style.position = "absolute";
            deltaEl.style.left = `${pct * 100}%`;
            deltaEl.style.transform = "translateX(-50%)";
        }
    };

    const closeModal = () => modal && modal.classList.add("hidden");
    const openModal = () => {
        if (!modal) return;
        const maxBuy = currentQuotePrice ? (currentBalance || 0) / currentQuotePrice : 0;
        const minSell = -currentShares;
        if (slider) {
            slider.min = isFinite(minSell) ? minSell : 0;
            slider.max = isFinite(maxBuy) ? maxBuy : 0;
            slider.value = "0";
            slider.step = "0.01"; // fine grain movement; snapping handled in code
        }
        updateReadout();
        positionFollow();
        modal.classList.remove("hidden");
    };

    const updateReadout = () => {
        if (!slider) return;
        const raw = Number(slider.value) || 0;
        const nearest = Math.round(raw);
        // Snap only when close to whole numbers; otherwise allow free fractional values.
        const delta = Math.abs(raw - nearest) < 0.05 ? nearest : raw;
        if (delta !== raw) slider.value = delta.toFixed(4);
        const valueImpact = delta * currentQuotePrice; // positive buy (deduct), negative sell (add)
        const netToBalance = -valueImpact;
        const resultingBalance = (currentBalance ?? 0) + netToBalance;
        if (deltaEl) deltaEl.textContent = delta.toFixed(2);
        if (valueEl) {
            valueEl.textContent = `${netToBalance >= 0 ? "+" : ""}${formatCurrency(netToBalance)}`;
            valueEl.classList.toggle("up", netToBalance > 0);
            valueEl.classList.toggle("down", netToBalance < 0);
            valueEl.classList.toggle("value-impact-up", netToBalance > 0);
            valueEl.classList.toggle("value-impact-down", netToBalance < 0);
        }
        if (balanceEl) balanceEl.textContent = formatCurrency(resultingBalance);
        positionFollow();
    };

    if (slider) slider.addEventListener("input", updateReadout);
    if (deltaEl) {
        const onMove = (e) => {
            if (!dragging || !slider) return;
            const rect = slider.getBoundingClientRect();
            const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const min = Number(slider.min) || 0;
            const max = Number(slider.max) || 0;
            const val = min + pct * (max - min);
            slider.value = val;
            updateReadout();
        };
        const onUp = () => {
            dragging = false;
            deltaEl.style.cursor = "grab";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
        deltaEl.addEventListener("mousedown", (e) => {
            dragging = true;
            deltaEl.style.cursor = "grabbing";
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            onMove(e);
        });
    }
    if (updateBtn) updateBtn.addEventListener("click", openModal);
    [closeBtn, cancelBtn].forEach((btn) => btn && btn.addEventListener("click", closeModal));
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }

    if (confirmBtn && page) {
        confirmBtn.addEventListener("click", async () => {
            if (!slider) return;
            const delta = Number(slider.value) || 0;
            if (delta === 0) {
                closeModal();
                return;
            }
            const symbol = (page.dataset.symbol || "").toUpperCase();
            const backendBase = resolveBackendBase();
            const payload = {
                delta_shares: delta,
                current_price: currentQuotePrice,
            };
            try {
                startLoader();
                const res = await fetch(`${backendBase}/trades/${encodeURIComponent(symbol)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `Update failed (${res.status})`);
                closeModal();
                currentShares = Number(data.shares || 0);
                setButtons(currentShares > 0);
                if (typeof data.balance === "number") {
                    currentBalance = data.balance;
                    const chip = document.getElementById("balance-chip");
                    if (chip) chip.textContent = `Balance: ${formatCurrency(currentBalance)}`;
                } else {
                    loadBalance();
                }
                const netToBalance = -(delta * currentQuotePrice);
                const variant = netToBalance > 0 ? "green" : netToBalance < 0 ? "red" : "gray";
                showAlert(`Balance change: ${netToBalance >= 0 ? "+" : ""}${netToBalance.toFixed(2)}`, variant);
                loadPortfolioStatus();
            } catch (err) {
                showAlert(err.message || "Update failed", "red");
            } finally {
                stopLoader();
            }
        });
    }
}
