# Anchor Faith Streaming — GitHub Actions cache setup

This project is designed so the public browser app does **not** fetch YouTube or Spotify live.
Instead, GitHub Actions runs the cache generator, writes `media-cache.json` and `media-cache.js`, then deploys those generated files to GitHub Pages.

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

If those are non-zero, the generator is working. If the live page still looks stale, open:

`https://tfooshee.github.io/afcstream/media-cache.json?v=test`

and verify that the deployed cache contains the generated counts.
