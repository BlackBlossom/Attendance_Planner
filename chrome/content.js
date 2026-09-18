console.log("Kiet Extension: Content script starting on " + window.location.href);

const api = globalThis.browser || globalThis.chrome;
const DEFAULT_TARGET_ORIGIN = "http://localhost:8501";
const ALLOWED_APP_ORIGINS = new Set([
	"http://localhost:8501",
	"http://127.0.0.1:8501",
]);
let redirectDecisionInProgress = false;
const promptedTokens = new Set();

function isPortalPage(url) {
	return url.includes("kiet.cybervidya.net");
}

function isAppPage(url) {
	try {
		const origin = new URL(url).origin;
		return ALLOWED_APP_ORIGINS.has(origin);
	} catch (_err) {
		return false;
	}
}

function normalizeToken(rawToken) {
	if (!rawToken || typeof rawToken !== "string") {
		return "";
	}

	let token = rawToken.trim();
	if (!token) {
		return "";
	}

	try {
		if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
			token = JSON.parse(token);
		}
	} catch (_err) {
		token = token.replace(/^"|"$/g, "");
	}

	return token.trim();
}

function findAuthToken() {
	const keys = ["authenticationtoken", "authenticationToken", "auth_token"];

	for (const key of keys) {
		const fromLocal = normalizeToken(localStorage.getItem(key));
		if (fromLocal) {
			return fromLocal;
		}

		const fromSession = normalizeToken(sessionStorage.getItem(key));
		if (fromSession) {
			return fromSession;
		}
	}

	return "";
}

function saveCurrentOriginAsTarget() {
	if (!api?.storage?.local) {
		return;
	}

	if (!ALLOWED_APP_ORIGINS.has(window.location.origin)) {
		return;
	}

	api.storage.local.set({ targetOrigin: window.location.origin }, () => {
		console.log("Kiet Extension: Origin saved as " + window.location.origin);
	});
}

function injectInstalledMarker() {
	if (document.getElementById("kiet-extension-installed")) {
		return;
	}

	const marker = document.createElement("div");
	marker.id = "kiet-extension-installed";
	marker.style.display = "none";
	document.body.appendChild(marker);
	console.log("Kiet Extension: Marker injected.");
}

function redirectWithToken(token) {
	if (promptedTokens.has(token)) {
		return;
	}

	promptedTokens.add(token);

	if (redirectDecisionInProgress) {
		return;
	}

	redirectDecisionInProgress = true;

	if (!api?.storage?.local) {
		showRedirectPrompt(token, DEFAULT_TARGET_ORIGIN).finally(() => {
			redirectDecisionInProgress = false;
		});
		return;
	}

	api.storage.local.get(["targetOrigin"], (result) => {
		const fromStorage = result?.targetOrigin;
		const targetOrigin = ALLOWED_APP_ORIGINS.has(fromStorage)
			? fromStorage
			: DEFAULT_TARGET_ORIGIN;
		showRedirectPrompt(token, targetOrigin).finally(() => {
			redirectDecisionInProgress = false;
		});
	});
}

function showRedirectPrompt(token, targetOrigin) {
	return new Promise((resolve) => {
		const existing = document.getElementById("attendance-planner-redirect-prompt");
		if (existing) {
			existing.remove();
		}

		const redirectUrl = `${targetOrigin}/?token=${encodeURIComponent(token)}`;

		const overlay = document.createElement("div");
		overlay.id = "attendance-planner-redirect-prompt";
		overlay.style.position = "fixed";
		overlay.style.inset = "0";
		overlay.style.zIndex = "2147483647";
		overlay.style.background = "rgba(0,0,0,0.4)";
		overlay.style.display = "flex";
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";

		const box = document.createElement("div");
		box.style.width = "min(92vw, 460px)";
		box.style.background = "#fff";
		box.style.borderRadius = "12px";
		box.style.padding = "16px";
		box.style.boxShadow = "0 20px 40px rgba(0,0,0,0.25)";
		box.style.fontFamily = "Segoe UI, Arial, sans-serif";

		const title = document.createElement("h3");
		title.textContent = "Attendance Planner Auth Bridge";
		title.style.margin = "0 0 8px 0";
		title.style.fontSize = "18px";

		const body = document.createElement("p");
		body.textContent = "Authentication token detected. How would you like to open Attendance Planner?";
		body.style.margin = "0 0 14px 0";
		body.style.lineHeight = "1.45";

		const actions = document.createElement("div");
		actions.style.display = "flex";
		actions.style.flexWrap = "wrap";
		actions.style.gap = "8px";

		const openHereBtn = document.createElement("button");
		openHereBtn.textContent = "Open Here";
		stylePrimaryButton(openHereBtn);

		const openNewTabBtn = document.createElement("button");
		openNewTabBtn.textContent = "Open In New Tab";
		styleSecondaryButton(openNewTabBtn);

		const cancelBtn = document.createElement("button");
		cancelBtn.textContent = "Cancel";
		styleDangerButton(cancelBtn);

		const cleanup = () => {
			overlay.remove();
			resolve();
		};

		openHereBtn.addEventListener("click", () => {
			window.location.href = redirectUrl;
			cleanup();
		});

		openNewTabBtn.addEventListener("click", () => {
			window.open(redirectUrl, "_blank", "noopener,noreferrer");
			cleanup();
		});

		cancelBtn.addEventListener("click", cleanup);

		actions.appendChild(openHereBtn);
		actions.appendChild(openNewTabBtn);
		actions.appendChild(cancelBtn);

		box.appendChild(title);
		box.appendChild(body);
		box.appendChild(actions);
		overlay.appendChild(box);
		document.body.appendChild(overlay);
	});
}

function stylePrimaryButton(button) {
	button.style.background = "#111";
	button.style.color = "#fff";
	button.style.border = "none";
	button.style.padding = "10px 12px";
	button.style.borderRadius = "8px";
	button.style.cursor = "pointer";
	button.style.fontWeight = "600";
}

function styleSecondaryButton(button) {
	button.style.background = "#f3f4f6";
	button.style.color = "#111";
	button.style.border = "1px solid #d1d5db";
	button.style.padding = "10px 12px";
	button.style.borderRadius = "8px";
	button.style.cursor = "pointer";
	button.style.fontWeight = "600";
}

function styleDangerButton(button) {
	button.style.background = "#fff";
	button.style.color = "#b91c1c";
	button.style.border = "1px solid #fecaca";
	button.style.padding = "10px 12px";
	button.style.borderRadius = "8px";
	button.style.cursor = "pointer";
	button.style.fontWeight = "600";
}

function checkAndRedirect() {
	const currentUrl = window.location.href;

	if (isAppPage(currentUrl)) {
		console.log("Kiet Extension: Running on App (" + window.location.origin + ")");
		injectInstalledMarker();
		saveCurrentOriginAsTarget();
		return;
	}

	if (!isPortalPage(currentUrl)) {
		return;
	}

	const token = findAuthToken();
	if (!token) {
		return;
	}

	console.log("Kiet Extension: Token found.");
	redirectWithToken(token);
}

checkAndRedirect();

let lastUrl = location.href;
new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
		lastUrl = url;
		checkAndRedirect();
	}
}).observe(document, { subtree: true, childList: true });

const pollId = setInterval(() => {
	if (!isPortalPage(window.location.href)) {
		return;
	}

	const token = findAuthToken();
	if (!token) {
		return;
	}

	clearInterval(pollId);
	console.log("Kiet Extension: Token found via polling.");
	redirectWithToken(token);
}, 1000);
