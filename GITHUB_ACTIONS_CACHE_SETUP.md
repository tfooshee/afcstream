# Anchor Faith Streaming — GitHub Actions cache setup

This project is designed so the public browser app does **not** fetch YouTube or Spotify live.
Instead, GitHub Actions runs the cache generator during approved refresh events, validates the generated `media-cache.json` and `media-cache.js`, and persists those two files on the dedicated `media-cache` branch. Normal design/code deployments retrieve that branch's latest valid cache before packaging the GitHub Pages artifact, so a design-only deployment cannot revert the live site to older seeded cache files committed on `main`.

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

## Automatic refresh cadence

The workflow runs:

- on every push to `main`, using the latest persisted cache from the `media-cache` branch without contacting YouTube, Spotify, or podcast RSS feeds
- manually with `workflow_dispatch`, performing a full media refresh before deployment
- on approved scheduled refreshes for Monday and Thursday at `12:00 PM America/New_York`, plus Tuesday at `6:31 PM America/New_York`

The workflow includes both EST and EDT cron entries for each scheduled refresh window, then uses an `America/New_York` gate to approve only the intended local times. Alternate DST cron triggers make no media API requests and do not deploy.

## Persistent generated cache branch

The latest successful generated cache is stored on the `media-cache` branch as:

- `media-cache.json`
- `media-cache.js`

Do not use the `media-cache` branch for ordinary application development. It exists only so separate workflow runs can reuse the most recently validated media cache.

During a manual or approved scheduled refresh, the workflow:

1. checks out the application code,
2. generates fresh media from YouTube, podcast RSS, and Spotify,
3. validates both cache files and confirms they contain the same cache object,
4. updates the `media-cache` branch only after validation succeeds,
5. deploys the site with the newly generated cache.

If generation or validation fails, the workflow restores the checked-in cache files in the temporary runner, does **not** update the `media-cache` branch, and fails visibly. The last valid persisted cache remains available for future design/code deployments.

During a push to `main`, the workflow:

1. checks out the latest application code,
2. restores `media-cache.json` and `media-cache.js` from the `media-cache` branch,
3. validates the restored cache,
4. deploys the site with the latest code and latest persisted media.

If the `media-cache` branch is unavailable or invalid, the workflow fails safely instead of deploying older seeded media from `main`.

## What to check in Actions

After the workflow runs, open the workflow log and look for the cache summary.
A healthy run should show non-zero values for:

- sermons
- playlists
- topicGroups
- seriesGroups
- speakerGroups
- podcastEpisodes
- spotifyReadyPodcastEpisodes

Spotify matching warnings do not fail a build: unmatched RSS episodes are deployed with RSS-audio fallback playback and can receive Spotify IDs on a later run. If the live page still looks stale, open:

`https://tfooshee.github.io/afcstream/media-cache.json?v=test`

and verify that the deployed cache contains the generated counts.
