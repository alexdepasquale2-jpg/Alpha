// Where Loopwright is running. The standalone app (server.py or any static
// host) can do everything. Inside a claude.ai artifact the page runs in a
// locked-down frame: no downloads, printing, service worker, microphone or
// Web Share, no community server, and links from outside can't carry data in
// the #fragment. The artifact page marks itself with <div id="app" data-host="artifact">.

export const ARTIFACT = typeof document !== 'undefined' && document.getElementById('app')?.dataset.host === 'artifact';

export const can = {
  download: !ARTIFACT,
  print: !ARTIFACT,
  install: !ARTIFACT,
  server: !ARTIFACT,
  // Links that open the app with a share packed into the #fragment.
  dataLinks: !ARTIFACT,
  webShare: !ARTIFACT && typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  voice: !ARTIFACT && typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
};

/** "Download" where the browser saves files, "Save" where we show a sheet instead. */
export const saveVerb = can.download ? 'Download' : 'Save';
