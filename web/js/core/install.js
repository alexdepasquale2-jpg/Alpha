// "Install app": keep the browser's install prompt until the person asks.

let deferred = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
});
window.addEventListener('appinstalled', () => { deferred = null; });

export const canInstall = () => !!deferred;
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export async function install() {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  return choice.outcome === 'accepted';
}
