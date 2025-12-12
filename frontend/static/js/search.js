const formatCurrency = (value) => `$${value.toFixed(2)}`;
const formatPercent = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const formatDateTime = (epochSeconds) => new Date(epochSeconds * 1000).toLocaleString();
const configuredBackend = (window.BACKEND_URL || document.body?.dataset?.backendUrl || "").trim();
const fallbackBackend = `${window.location.protocol}//${window.location.hostname}:4000`;
const backendBase = (configuredBackend && configuredBackend.replace(/\/+$/, "")) || fallbackBackend;

function renderResults(list) {
    const results = document.getElementById("search-results");
    if (!results) return;
    const template = document.getElementById("stock-card-template");
    if (!list.length) {
        results.innerHTML = `<p class="muted">No matches yet. Try a different ticker.</p>`;
        return;
    }

    // If template is present, use DOM cloning; otherwise fall back to string build.
    if (template && "content" in template) {
        results.innerHTML = "";
        list.forEach((item) => {
            const clone = template.content.cloneNode(true);
            const setText = (field, value) => {
                const el = clone.querySelector(`[data-field="${field}"]`);
                if (el) el.textContent = value;
            };

            setText("symbol", item.symbol || "N/A");
            setText("name", item.name || "Quote");
            setText("price", formatCurrency(item.price || 0));
            setText("open", formatCurrency(item.open || 0));
            setText("prevClose", formatCurrency(item.prevClose || 0));
            setText("high", formatCurrency(item.high || 0));
            setText("low", formatCurrency(item.low || 0));
            setText("note", item.note || "Live quote from backend");
            setText("timestamp", item.timestamp ? `As of ${formatDateTime(item.timestamp)}` : "");

            const badge = clone.querySelector("[data-field='changeBadge']");
            if (badge) {
                badge.textContent = `${item.changeText || ""} ${item.percentText || ""}`.trim();
                badge.classList.toggle("up", item.change >= 0);
                badge.classList.toggle("down", item.change < 0);
            }

            const card = clone.querySelector(".stock-card");
            if (card && item.symbol) {
                card.dataset.symbol = item.symbol;
                card.addEventListener("click", () => {
                    window.location.href = `/stock/${encodeURIComponent(item.symbol)}`;
                });
            }

            results.appendChild(clone);
        });
        return;
    }

    results.innerHTML = list
        .map((item) => {
            const badgeClass = item.change >= 0 ? "up" : "down";
            const badgeText = `${item.changeText || ""} ${item.percentText || ""}`.trim();
            return `
                <div class="result-card stock-card" data-symbol="${item.symbol || ""}" onclick="window.location.href='/stock/${item.symbol || ""}'">
                    <div class="symbol">${item.symbol}</div>
                    <h4>${item.name || "Quote"}</h4>
                    <div class="row">
                        <span class="badge ${badgeClass}">${badgeText}</span>
                        <span class="price">${formatCurrency(item.price)}</span>
                    </div>
                    <p class="note">${item.note || "Fetched live from the quote service."}</p>
                </div>
            `;
        })
        .join("");
}

function getQuerySymbol() {
    const params = new URLSearchParams(window.location.search);
    return params.get("symbol") || "";
}

async function fetchQuote(symbol) {
    const res = await fetch(`${backendBase}/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Quote lookup failed (${res.status})`);
    return res.json();
}

async function handleSearch(event) {
    event.preventDefault();
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;
    await loadQuote(query);
}

async function loadQuote(symbol) {
    const normalized = symbol.toUpperCase();
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    if (input) input.value = normalized;
    results.innerHTML = `<p class="muted">Loading quote for ${normalized}...</p>`;
    try {
        const data = await fetchQuote(normalized);
        const price = Number(data.current ?? data.price ?? 0);
        const change = Number(data.change ?? 0);
        const percentChange = Number(data.percent_change ?? data.percentChange ?? 0);
        renderResults([
            {
                symbol: data.symbol || normalized,
                name: data.name || normalized,
                price,
                change,
                percentChange,
                changeText: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`,
                percentText: formatPercent(percentChange || 0),
                open: Number(data.open ?? 0),
                prevClose: Number(data.prev_close ?? data.prevClose ?? 0),
                high: Number(data.high ?? 0),
                low: Number(data.low ?? 0),
                timestamp: Number(data.timestamp ?? Date.now() / 1000),
                note: "Live quote from backend",
            },
        ]);
    } catch (err) {
        results.innerHTML = `<p class="muted">Unable to load quote for ${normalized}: ${err.message}</p>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("search-form");
    if (form) form.addEventListener("submit", handleSearch);
    const symbolParam = getQuerySymbol().trim();
    if (symbolParam) {
        loadQuote(symbolParam);
    }
});
