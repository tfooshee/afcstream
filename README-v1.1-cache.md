# Anchor Faith Streaming v1.1.1

This version is configured as a prebuilt-cache streaming app.

## What changed in this package

- The bundled `media-cache.json` / `media-cache.js` now contains real Anchor Faith public YouTube and Spotify episode references so the page no longer opens to an empty "cached content" state.
- The visitor browser does **not** run live YouTube/RSS/Spotify refresh for v1.1. The page renders from the bundled cache immediately.
- Podcast episodes include episode-level Spotify IDs, allowing the modal to render the large Spotify episode player.
- The hero now behaves as a three-item Featured Sermon carousel and rotates automatically every 12 seconds.

## Important production note

The included cache is a real seeded cache assembled from publicly discoverable Anchor Faith YouTube/Spotify content. Before final public launch, run the generator in a network-enabled environment with credentials to replace the seeded cache with the latest complete dataset.

```bash
npm install
cp .env.example .env
# add your YouTube API key and Spotify credentials to .env
npm run generate:cache
```

The generated cache should be committed/deployed with the app so visitors get an immediate first paint with real media.

## Visitor-side behavior

For v1.1, keep visitor-side live refresh disabled. The browser should simply:

1. load `media-cache.js`
2. render the app immediately
3. open modals/shelves from cached data

This avoids page jumps, empty states, API waits, and un-premium loading screens.
