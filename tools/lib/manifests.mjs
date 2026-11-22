// The manifest each store gets (D-036).
//
// extension/manifest.json is one manifest for every browser: it names
// background.js both as a service worker (Edge, Chrome) and in
// background.scripts (Firefox), and has a Firefox-only
// browser_specific_settings block (D-029). The browsers ignore what isn't
// theirs, but Edge Add-ons refuses a package with background.scripts. So
// the Edge/Chrome zip leaves out what only Firefox reads. Nothing else
// differs: same files, same code.

/**
 * @param {Record<string, any>} manifest the parsed extension/manifest.json
 * @returns {Record<string, any>} a copy without the Firefox-only keys
 */
export function chromiumManifest(manifest) {
  const copy = structuredClone(manifest);
  delete copy.background.scripts;
  delete copy.browser_specific_settings;
  return copy;
}
