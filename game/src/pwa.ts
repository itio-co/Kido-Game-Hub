export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  let hadController = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const scriptUrl = new URL('sw.js', document.baseURI).href;
  navigator.serviceWorker
    .register(scriptUrl, { updateViaCache: 'none' })
    .then((registration) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    })
    .catch(() => {});
}
