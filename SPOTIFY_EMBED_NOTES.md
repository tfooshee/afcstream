# Spotify Episode Embed Notes

This build uses Spotify's large episode iframe as the primary podcast modal player:

```html
<iframe
  src="https://open.spotify.com/embed/episode/SPOTIFY_EPISODE_ID?utm_source=generator&theme=0"
  height="352"
  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

Spotify controls playback availability inside its embed. If the large embed still only plays a preview after these changes, check the podcast/show settings in Spotify for Creators for any embed/preview playback restrictions.
