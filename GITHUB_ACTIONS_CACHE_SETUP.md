# GitHub Actions cache generation setup

This project is now configured so GitHub Actions can generate the real `media-cache.json` and `media-cache.js` before deploying to GitHub Pages.

## Required repository secrets

In GitHub, go to:

`Settings → Secrets and variables → Actions → Repository secrets`

Add these three secrets:

- `YOUTUBE_API_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Do not commit these values into the repository.

## Pages source setting

In GitHub, go to:

`Settings → Pages`

Set **Build and deployment → Source** to **GitHub Actions**.

## How it updates

The workflow runs when:

- you push to `main`
- you manually run the workflow from the Actions tab
- the daily schedule runs at 8:00 UTC

Each run does this:

1. Installs Node 24.
2. Runs `npm run generate:cache` with the repository secrets.
3. Generates real YouTube/Spotify cache files.
4. Fails safely if the cache cannot be generated.
5. Deploys the generated site to GitHub Pages.

## Expected workflow log

Look for a section like:

`Anchor Faith media cache summary:`

It should show non-zero counts for sermons, playlists, Topic groups, Series groups, Speaker groups, podcast episodes, and Spotify-ready podcast episodes.
