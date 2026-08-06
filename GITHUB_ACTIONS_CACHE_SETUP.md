# Anchor Faith Streaming — GitHub Actions cache setup

The browser app does **not** fetch YouTube, Spotify, or podcast RSS feeds at runtime. The latest validated `media-cache.json` and `media-cache.js` are committed directly to `main`, alongside the application code. This makes `main` the single source of truth for every GitHub Pages deployment.

## Required repository secrets

Go to:

`Settings → Secrets and variables → Actions → Repository secrets`

Add exactly these three repository secrets:

- `YOUTUBE_API_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Do not commit these values to the repository.

## GitHub Pages source

Go to:

`Settings → Pages`

Set source to:

`GitHub Actions`

## Deployment and refresh behavior

The workflow runs in three modes:

- **Push to `main`:** validates the cache already committed to `main`, packages the site, and deploys it. This path does not install media-refresh dependencies, expose media secrets, call external media APIs, or run the cache generator.
- **Manual `workflow_dispatch`:** generates fresh media from YouTube, podcast RSS, and Spotify; validates both cache files; commits the pair directly to `main`; and deploys the same validated workspace.
- **Approved schedule:** performs the same refresh, commit, and deployment as a manual run on Monday and Thursday at `12:00 PM America/New_York`, plus Tuesday at `6:31 PM America/New_York`.

The workflow includes both EST and EDT cron possibilities for each scheduled window, then checks the current `America/New_York` day and time. An alternate DST cron invocation stops before dependency installation, external media requests, cache generation, artifact upload, or deployment.

## Cache persistence and safety

The durable generated files are:

- `media-cache.json`
- `media-cache.js`

Both files are validated and committed together. Validation confirms that:

- `media-cache.json` parses successfully,
- `media-cache.js` has valid JavaScript syntax,
- both files contain the same cache object, and
- required sermon, playlist, collection, and podcast counts are non-zero.

Before a refresh pushes its cache commit, it fetches the latest `origin/main`. If `main` advanced while media was being generated, the workflow replays only the two validated cache files onto the new tip, validates them again, and uses a normal fast-forward push. It never force-pushes or overwrites intervening design changes.

If generation, validation, or the safe push fails, no partial cache is deployed and the last validated cache committed to `main` remains unchanged. If a normal design deployment finds invalid cache files on `main`, it fails clearly instead of falling back to placeholder content.

## Deprecated `media-cache` branch

The `media-cache` branch is no longer read or updated by the deployment workflow. It remains temporarily available only as a rollback source during migration and can be removed after the simplified deployment and refresh paths have both been verified.

## Manual refresh

1. Open `Actions` in the repository.
2. Select `Build and deploy Anchor Faith Streaming`.
3. Choose `Run workflow` on `main`.
4. Confirm the run generates and validates the media cache, creates one commit containing both cache files when content changed, uploads the standard `github-pages` artifact, and completes the Pages deployment.

The workflow-generated cache commit uses the current run number and records the source `main` SHA and generation timestamp in the commit body.

## What to check in Actions

A healthy validation summary reports non-zero values for:

- sermons
- playlists
- topic groups
- series groups
- speaker groups
- podcast episodes

Spotify matching warnings do not fail a build: unmatched RSS episodes are deployed with RSS-audio fallback playback and can receive Spotify IDs on a later refresh. To inspect the deployed cache, open:

`https://tfooshee.github.io/afcstream/media-cache.json?v=test`
