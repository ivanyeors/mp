// Minimal service worker. Exists only to make the app installable — Chrome
// requires a registered SW with a fetch handler before it offers "Install app".
// No caching / offline behavior: the empty fetch handler lets the browser
// handle every request normally.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
