# Anchor Faith Streaming — GitHub Actions cache setup

This project is designed so the public browser app does **not** fetch YouTube or Spotify live.
Instead, GitHub Actions runs the cache generator and deploys the generated `media-cache.json` and `media-cache.js` inside the GitHub Pages artifact. The workflow does **not** commit regenerated cache files back to this repository.

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

- on every push to `main`
- manually with `workflow_dispatch`
- daily at `08:00 UTC`

This means the site will refresh from YouTube + Spotify automatically without your team touching the website.

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
