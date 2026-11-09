# Mint's Paperback Repo (Paperback 0.8)

Sayf's personal Paperback extensions, built and maintained by Mint.

## Sources
- **MintDex** — MangaDex (official public API). Settings: chapter languages, content ratings, data saver. Paste a MangaDex link/ID into search to jump straight to a title. Chapters MangaDex only links out to (official sites) are skipped.

## Add to Paperback
Settings → External Sources → Edit → + → `https://<github-user>.github.io/<repo-name>/0.8`

## Develop
- `npm ci`
- `mkdir -p bundles && npx paperback bundle --folder=0.8`
- `node test/harness.js` (offline test against captured MangaDex responses)
- Pushing to `main` builds and publishes to the `gh-pages` branch automatically.
