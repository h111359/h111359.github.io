/* ATISTAT — front-end interactions (vanilla JS, no dependencies) */
(function () {
	"use strict";

	document.documentElement.classList.add("has-js");

	/* ---------- Mobile navigation ---------- */
	var toggle = document.querySelector(".at-navtoggle");
	var nav = document.getElementById("at-nav");
	if (toggle && nav) {
		toggle.addEventListener("click", function () {
			var open = nav.classList.toggle("is-open");
			toggle.setAttribute("aria-expanded", open ? "true" : "false");
		});
		nav.querySelectorAll(".at-nav__link").forEach(function (link) {
			link.addEventListener("click", function () {
				nav.classList.remove("is-open");
				toggle.setAttribute("aria-expanded", "false");
			});
		});
	}

	/* ---------- Reveal on scroll ---------- */
	var fades = document.querySelectorAll("[data-fade]");
	if ("IntersectionObserver" in window && fades.length) {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) {
				if (e.isIntersecting) {
					e.target.classList.add("is-in");
					io.unobserve(e.target);
				}
			});
		}, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
		fades.forEach(function (el) { io.observe(el); });
	} else {
		fades.forEach(function (el) { el.classList.add("is-in"); });
	}

	/* ---------- Interactive project timeline (home Experience section) ---------- */
	var timeline = document.querySelector("[data-timeline]");
	if (timeline) {
		var buttons = timeline.querySelectorAll(".at-tlb");
		var panels = timeline.querySelectorAll(".at-tlpanel");

		function activate(index) {
			buttons.forEach(function (b) {
				var on = b.getAttribute("data-index") === String(index);
				b.classList.toggle("is-active", on);
				b.setAttribute("aria-selected", on ? "true" : "false");
			});
			panels.forEach(function (p) {
				var on = p.getAttribute("data-panel") === String(index);
				p.classList.toggle("is-active", on);
				p.setAttribute("aria-hidden", on ? "false" : "true");
			});
			var progress = buttons.length > 1 ? (Number(index) / (buttons.length - 1)) * 100 : 0;
			timeline.style.setProperty("--active-progress", progress + "%");
			timeline.classList.add("is-touched");
		}

		buttons.forEach(function (b, position) {
			var idx = b.getAttribute("data-index");
			b.addEventListener("mouseenter", function () { activate(idx); });
			b.addEventListener("focus", function () { activate(idx); });
			b.addEventListener("click", function () { activate(idx); });
			b.addEventListener("keydown", function (event) {
				if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") { return; }
				event.preventDefault();
				var direction = event.key === "ArrowRight" ? 1 : -1;
				var next = Math.max(0, Math.min(buttons.length - 1, position + direction));
				buttons[next].focus();
				activate(buttons[next].getAttribute("data-index"));
			});
		});
	}

	/* ---------- Clickable timeline cards (partner logos link out) ---------- */
	document.querySelectorAll("[data-href]").forEach(function (el) {
		el.addEventListener("click", function () {
			window.open(el.getAttribute("data-href"), "_blank", "noopener");
		});
	});

	/* ---------- Touch support for sketch reveal (non-link figures) ---------- */
	var isTouch = window.matchMedia("(hover: none)").matches;
	if (isTouch) {
		document.querySelectorAll("figure[data-sketch]").forEach(function (fig) {
			fig.addEventListener("click", function () { fig.classList.toggle("is-hot"); });
		});
	}
})();
