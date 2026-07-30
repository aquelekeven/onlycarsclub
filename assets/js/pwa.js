(() => {
  const CLEANUP_RELOAD_KEY = "onlycars-sw-cleanup-v67";

  async function removeLegacyOfflineCache() {
    const hadController =
      "serviceWorker" in navigator && Boolean(navigator.serviceWorker.controller);

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("onlycars-app-"))
          .map((name) => caches.delete(name))
      );
    }

    if (hadController && !sessionStorage.getItem(CLEANUP_RELOAD_KEY)) {
      sessionStorage.setItem(CLEANUP_RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  removeLegacyOfflineCache().catch(() => {});
})();
