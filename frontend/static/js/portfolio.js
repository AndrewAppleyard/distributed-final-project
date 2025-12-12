const portfolioPositions = [
    { symbol: "AAPL", shares: 24, price: 189.32, basis: 162.4, change: 1.2, note: "Hardware momentum and services tailwind." },
    { symbol: "MSFT", shares: 15, price: 335.16, basis: 305.2, change: 0.6, note: "Cloud run rate and AI exposure." },
    { symbol: "AMZN", shares: 18, price: 138.21, basis: 112.5, change: -0.8, note: "Retail recovery with margin leverage." },
    { symbol: "TSLA", shares: 10, price: 245.87, basis: 232.1, change: 2.4, note: "Energy + auto optionality." },
];

const watchIdeas = [
    { symbol: "NVDA", price: 455.12, note: "GPU demand keeps stretching order books." },
    { symbol: "COST", price: 559.77, note: "Membership resilience and steady comps." },
    { symbol: "KO", price: 58.21, note: "Defensive staple with steady dividends." },
    { symbol: "PLTR", price: 15.92, note: "Platform stickiness with new pilots." },
];

const cashBalance = 2500.5;

const formatCurrency = (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatPercent = (value) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

function renderPositions() {
    const container = document.getElementById("positions-list");
    let totalValue = 0;
    let totalCost = 0;
    let dayMove = 0;

    const cards = portfolioPositions.map((pos) => {
        const value = pos.shares * pos.price;
        const costBasis = pos.shares * pos.basis;
        const pl = value - costBasis;
        const plPct = (pl / costBasis) * 100;
        const positionDayMove = value * (pos.change / 100);

        totalValue += value;
        totalCost += costBasis;
        dayMove += positionDayMove;

        const plClass = pl >= 0 ? "pl-positive" : "pl-negative";
        return `
            <div class="position-card">
                <div class="symbol">${pos.symbol}</div>
                <div class="meta">${pos.shares} shares @ ${formatCurrency(pos.basis)}</div>
                <div class="value">${formatCurrency(value)}</div>
                <div class="${plClass}">${pl >= 0 ? "+" : ""}${formatCurrency(pl)} (${formatPercent(plPct)})</div>
                <div class="chip">${formatPercent(pos.change)} today</div>
                <p class="note">${pos.note}</p>
            </div>
        `;
    });

    container.innerHTML = cards.join("");

    const equity = totalValue + cashBalance;
    const equityChangePct = (dayMove / Math.max(totalValue, 1)) * 100;

    const equityEl = document.getElementById("stat-equity");
    const equityChangeEl = document.getElementById("stat-equity-change");
    const cashEl = document.getElementById("stat-cash");
    const moverEl = document.getElementById("stat-mover");
    const moverChangeEl = document.getElementById("stat-mover-change");

    equityEl.textContent = formatCurrency(equity);
    equityChangeEl.textContent = `Day move: ${dayMove >= 0 ? "+" : "-"}${formatCurrency(Math.abs(dayMove))} (${formatPercent(equityChangePct)})`;
    cashEl.textContent = formatCurrency(cashBalance);

    const topMover = [...portfolioPositions].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    moverEl.textContent = `${topMover.symbol} ${formatCurrency(topMover.price)}`;
    moverChangeEl.textContent = `${formatPercent(topMover.change)} on the day`;
}

function renderWatchlist() {
    const list = document.getElementById("watchlist");
    const entries = watchIdeas.map(
        (idea) => `
            <div class="watch-card">
                <h4>${idea.symbol}</h4>
                <div class="meta">${formatCurrency(idea.price)}</div>
                <p class="note">${idea.note}</p>
            </div>
        `
    );
    list.innerHTML = entries.join("");
}

function jitterPositions() {
    portfolioPositions.forEach((pos) => {
        const drift = (Math.random() - 0.5) * 1.5; // small wiggle to keep the page lively
        pos.price = Number((pos.price * (1 + drift / 100)).toFixed(2));
        pos.change = Number((pos.change + drift / 2).toFixed(2));
    });
}

document.addEventListener("DOMContentLoaded", () => {
    renderPositions();
    renderWatchlist();

    const refreshButton = document.getElementById("refresh-portfolio");
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            jitterPositions();
            renderPositions();
        });
    }
});
