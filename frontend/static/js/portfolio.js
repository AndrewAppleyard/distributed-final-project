const formatCurrency = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPercent = (value) => `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}%`;
let refreshHooked = false;

const configuredBackend = (window.BACKEND_URL || document.body?.dataset?.backendUrl || "").trim();
const fallbackBackend = `${window.location.protocol}//${window.location.hostname}:4000`;
const backendBase = (configuredBackend && configuredBackend.replace(/\/+$/, "")) || fallbackBackend;

async function fetchPortfolio() {
    const res = await fetch(`${backendBase}/portfolio`);
    if (!res.ok) throw new Error(`Portfolio lookup failed (${res.status})`);
    return res.json();
}

async function fetchBalance() {
    const res = await fetch(`${backendBase}/balance`);
    if (!res.ok) throw new Error(`Balance lookup failed (${res.status})`);
    return res.json();
}

async function fetchQuote(symbol) {
    const res = await fetch(`${backendBase}/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Quote lookup failed (${res.status})`);
    return res.json();
}

async function loadPortfolio() {
    const positionsContainer = document.getElementById("positions-list");
    const leftArrow = document.getElementById("positions-left");
    const rightArrow = document.getElementById("positions-right");
    const showAllBtn = document.getElementById("show-all-holdings");
    const holdingsGrid = document.getElementById("holdings-grid");
    const holdingsModal = document.getElementById("holdings-modal");
    const holdingsClose = document.getElementById("holdings-close");
    const equityEl = document.getElementById("stat-equity");
    const equityChangeEl = document.getElementById("stat-equity-change");
    const cashEl = document.getElementById("stat-cash");
    const moverEl = document.getElementById("stat-mover");
    const moverChangeEl = document.getElementById("stat-mover-change");

    if (!positionsContainer) return;

    positionsContainer.innerHTML = `<p class="muted">Loading positions...</p>`;
    try {
        const [portfolio, balanceData] = await Promise.all([fetchPortfolio(), fetchBalance()]);
        const balance = Number(balanceData.balance ?? 0);
        const positions = Array.isArray(portfolio) ? portfolio : [];
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
        let dayMove = 0;
        let cardsHtml = "";

        positions.forEach((pos) => {
            const quoteWrap = quotes.find((q) => q.symbol === pos.symbol);
            const quote = quoteWrap?.quote;
            const price = Number(quote?.current ?? quote?.price ?? pos.buy_price ?? 0);
            const pctChange = Number(quote?.percent_change ?? quote?.percentChange ?? 0);
            const change = Number(quote?.change ?? price * (pctChange / 100));

            const value = pos.shares * price;
            totalValue += value;
            dayMove += pos.shares * change;

            const card = `
                <div class="holding-card" onclick="window.location.href='/stock/${pos.symbol}'">
                    <div class="top-row">
                        <span class="symbol">${pos.symbol}</span>
                        <span class="badge ${pctChange >= 0 ? "up" : "down"}">${formatPercent(pctChange)}</span>
                    </div>
                    <div class="price">${formatCurrency(price)}</div>
                    <div class="meta">${pos.shares.toFixed(2)} sh</div>
                    <div class="value">${formatCurrency(value)}</div>
                </div>
            `;
            cardsHtml += card;
        });

        positionsContainer.innerHTML = cardsHtml || `<p class="muted">No positions yet.</p>`;
        updateArrows();

        // Build full grid for modal
        if (holdingsGrid) {
            const count = positions.length;
            const size = count ? Math.ceil(Math.sqrt(count)) : 1;
            holdingsGrid.style.gridTemplateColumns = `repeat(${size}, minmax(140px, 1fr))`;
            holdingsGrid.innerHTML =
                positions
                    .map((pos) => {
                        const quoteWrap = quotes.find((q) => q.symbol === pos.symbol);
                        const quote = quoteWrap?.quote;
                        const price = Number(quote?.current ?? quote?.price ?? pos.buy_price ?? 0);
                        const pctChange = Number(quote?.percent_change ?? quote?.percentChange ?? 0);
                        const value = pos.shares * price;
                        return `
                            <div class="holding-card" onclick="window.location.href='/stock/${pos.symbol}'">
                                <div class="top-row">
                                    <span class="symbol">${pos.symbol}</span>
                                    <span class="badge ${pctChange >= 0 ? "up" : "down"}">${formatPercent(pctChange)}</span>
                                </div>
                                <div class="price">${formatCurrency(price)}</div>
                                <div class="meta">${pos.shares.toFixed(2)} sh</div>
                                <div class="value">${formatCurrency(value)}</div>
                            </div>
                        `;
                    })
                    .join("") || `<p class="muted">No positions yet.</p>`;
        }

        const equity = totalValue + balance;
        const equityChangePct = totalValue ? (dayMove / totalValue) * 100 : 0;
        if (equityEl) equityEl.textContent = formatCurrency(equity);
        if (equityChangeEl)
            equityChangeEl.textContent = `Day move: ${dayMove >= 0 ? "+" : "-"}${formatCurrency(Math.abs(dayMove))} (${formatPercent(equityChangePct)})`;
        if (cashEl) cashEl.textContent = formatCurrency(balance);

        const topMover = quotes
            .map((q) => ({
                symbol: q.symbol,
                pct: Number(q.quote?.percent_change ?? q.quote?.percentChange ?? 0),
                price: Number(q.quote?.current ?? q.quote?.price ?? 0),
            }))
            .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
        if (topMover && moverEl && moverChangeEl) {
            moverEl.textContent = `${topMover.symbol} ${formatCurrency(topMover.price)}`;
            moverChangeEl.textContent = `${formatPercent(topMover.pct)} on the day`;
        }

        function updateArrows() {
            if (!positionsContainer) return;
            const canScrollLeft = positionsContainer.scrollLeft > 0;
            const canScrollRight = positionsContainer.scrollLeft + positionsContainer.clientWidth < positionsContainer.scrollWidth - 1;
            if (leftArrow) leftArrow.style.opacity = canScrollLeft ? "0.6" : "0.2";
            if (rightArrow) rightArrow.style.opacity = canScrollRight ? "0.6" : "0.2";
        }

        if (positionsContainer) {
            positionsContainer.addEventListener("scroll", updateArrows);
        }
        let scrollDir = 0;
        let scrollAnimation = null;
        let scrollSpeed = 0;
        const maxSpeed = 8;
        const accel = 0.35;
        const stepScroll = () => {
            if (!positionsContainer || scrollDir === 0) return;
            scrollSpeed = Math.min(maxSpeed, scrollSpeed + accel);
            positionsContainer.scrollLeft += scrollDir * scrollSpeed;
            updateArrows();
            scrollAnimation = requestAnimationFrame(stepScroll);
        };
        const startScroll = (dir) => {
            if (!positionsContainer) return;
            stopScroll();
            scrollDir = dir;
            scrollSpeed = 2;
            scrollAnimation = requestAnimationFrame(stepScroll);
            arrowPulse(dir);
        };
        const stopScroll = () => {
            scrollDir = 0;
            scrollSpeed = 0;
            if (scrollAnimation) cancelAnimationFrame(scrollAnimation);
            scrollAnimation = null;
            if (leftArrow) leftArrow.classList.remove("active");
            if (rightArrow) rightArrow.classList.remove("active");
        };
        if (leftArrow) {
            leftArrow.addEventListener("mouseenter", () => startScroll(-1));
            leftArrow.addEventListener("mouseleave", stopScroll);
        }
        if (rightArrow) {
            rightArrow.addEventListener("mouseenter", () => startScroll(1));
            rightArrow.addEventListener("mouseleave", stopScroll);
        }
        updateArrows();

        const openModal = () => holdingsModal && holdingsModal.classList.remove("hidden");
        const closeModal = () => holdingsModal && holdingsModal.classList.add("hidden");
        if (showAllBtn) showAllBtn.addEventListener("click", openModal);
        if (holdingsClose) holdingsClose.addEventListener("click", closeModal);
        if (holdingsModal) {
            holdingsModal.addEventListener("click", (e) => {
                if (e.target === holdingsModal) closeModal();
            });
        }
        const refreshBtn = document.getElementById("refresh-portfolio");
        if (refreshBtn && !refreshHooked) {
            refreshHooked = true;
            refreshBtn.addEventListener("click", () => {
                loadPortfolio();
            });
        }
    } catch (err) {
        positionsContainer.innerHTML = `<p class="muted">Failed to load portfolio: ${err.message}</p>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadPortfolio();
    const refreshButton = document.getElementById("refresh-portfolio");
    if (refreshButton) refreshButton.addEventListener("click", loadPortfolio);
});
