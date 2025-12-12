let performanceCurve = [100, 102, 101, 105, 103, 108, 111, 109, 115, 118, 120, 123];

const metricSnapshot = {
    return: "14.7%",
    benchmarkNote: "Benchmark +7.8%",
    winRate: "64%",
    holdTime: "5.2 days",
};

const riskSnapshot = [
    { label: "Volatility", value: "Low", meta: "14d stdev 8.1%" },
    { label: "Drawdown", value: "-3.4%", meta: "Max dip this month" },
    { label: "Risk/Reward", value: "1.9x", meta: "Avg winner vs. loser" },
];

const highlights = [
    "Best streak: six green sessions in a row last week.",
    "Largest winner: NVDA +18.6% swing trade on earnings momentum.",
    "Trimmed TSLA to lock gains and rebalance risk.",
    "Kept dry powder for the next pullback setup.",
];

function renderPerformance() {
    const container = document.getElementById("performance-bars");
    const maxPoint = Math.max(...performanceCurve);
    const bars = performanceCurve.map((point, idx) => {
        const height = Math.max((point / maxPoint) * 120, 12);
        return `<div class="spark-bar" style="height:${height}px" title="Checkpoint ${idx + 1}: ${point}"></div>`;
    });
    container.innerHTML = bars.join("");
}

function renderMetrics() {
    const returnEl = document.getElementById("metric-return");
    const returnNoteEl = document.getElementById("metric-return-note");
    const winEl = document.getElementById("metric-winrate");
    const holdEl = document.getElementById("metric-hold");

    returnEl.textContent = metricSnapshot.return;
    returnNoteEl.textContent = metricSnapshot.benchmarkNote;
    winEl.textContent = metricSnapshot.winRate;
    holdEl.textContent = metricSnapshot.holdTime;

    const pillList = document.getElementById("risk-list");
    pillList.innerHTML = riskSnapshot
        .map((item) => `<div class="pill"><span>${item.label}</span><span class="meta">${item.value} • ${item.meta}</span></div>`)
        .join("");

    const bulletList = document.getElementById("metric-list");
    bulletList.innerHTML = highlights.map((item) => `<li>${item}</li>`).join("");
}

function jitterMetrics() {
    performanceCurve = performanceCurve.map((point) => {
        const drift = (Math.random() - 0.5) * 2.5;
        return Number((point * (1 + drift / 100)).toFixed(2));
    });
    renderPerformance();
}

document.addEventListener("DOMContentLoaded", () => {
    renderPerformance();
    renderMetrics();

    const refreshButton = document.getElementById("refresh-metrics");
    if (refreshButton) {
        refreshButton.addEventListener("click", jitterMetrics);
    }
});
