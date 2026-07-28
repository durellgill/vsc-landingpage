# TODO

## Next interaction work

- Add a small, scoped management view for locally hidden Recent entries so they can be restored
  individually, rather than only restoring the entire set from the Recent group menu.
- Evaluate a searchable icon picker if the expanded glyph palette becomes difficult to scan.
- Add a browser-harness scenario for inline rename, group glyphs and colours, and local Recent
  hiding/restoration.
- Add browser-harness coverage for group ordering boundaries and the inline add composer.

## Preact follow-up

Preact now owns the production webview. The legacy `landingpage2.js` remains only as a
reference while the new UI settles.

- Replace the temporary browser smoke harness with committed, repeatable interaction tests.
- Decide whether and when to remove the legacy `landingpage2.js` and its old HTML prototype
  markup after the Preact UI has had real-world use.
- Add menu positioning that flips or clamps near the right and lower viewport edges.

## Personal workstation start page

Explore an opt-in, read-only System area that makes the landing page useful beyond recent
VS Code workspaces.

- Let people choose which dotfile roots and configuration directories to show.
- Display file and folder names, locations, existence, and repository status without reading
  or rendering file contents by default.
- Add quick actions to open a selected item in VS Code, Finder, or its configured application.
- Keep the provider layer independent from the webview so it can later be reused by a small
  desktop companion app, if the page needs to run outside VS Code.
- Treat all locations as explicit opt-ins. Dotfiles can contain credentials and should never
  be automatically indexed or exposed.
