document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll("#sidebar a");

    links.forEach(link => {
        if (link.href === window.location.href) {
            link.classList.add("active");
        }
    });

    const form = document.getElementById("nav-search");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const input = document.getElementById("nav-search-input");
            const symbol = (input?.value || "").trim();
            if (!symbol) return;
            const target = `/search?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
            window.location.href = target;
        });
    }
});
