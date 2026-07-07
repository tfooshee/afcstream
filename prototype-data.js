(function () {
  window.AnchorFaithPrototypeData = {
    sourceNotes: {
      mode: "real-data",
      intent:
        "v1.1 prebuilt-cache configuration. The UI renders bundled media-cache.js data only; no visitor-side live refresh or fallback media is generated.",
      configuration:
        "Run scripts/generate-media-cache.mjs to rebuild media-cache.js/json from YouTube, RSS, and Spotify before publishing.",
      youtubeChannel: "https://www.youtube.com/anchorfaith",
      spotifyShows: {
        anchorFaithChurch: "https://open.spotify.com/show/7sMWiLwUHPAqHyxYBQp7Qx",
        theCurrent: "https://open.spotify.com/show/7xu0obdpJbYpFT62IohTkl",
        kingdomFirstBusinessAlliance: "https://open.spotify.com/show/4rbu39RRiyRqVWzlfFk77I",
      },
    },

    mediaCacheUrl: "./media-cache.json?v=20260707-actions-cache",


    dataSources: {
      youtube: {
        channelId: "",
        channelHandle: "anchorfaith",
        channelUsername: "anchorfaith",
        channelSearchQuery: "Anchor Faith Church",
        latestPlaylistId: "",
        highlightedPlaylistId: "highlighted-messages",
      },
      podcasts: [
        {
          id: "anchor-faith-church-podcast",
          title: "Anchor Faith Church Podcast",
          subtitle: "",
          rssUrl: "https://anchor.fm/s/128ece40/podcast/rss",
          spotifyShowId: "7sMWiLwUHPAqHyxYBQp7Qx",
          sourceUrl: "https://open.spotify.com/show/7sMWiLwUHPAqHyxYBQp7Qx",
          spotifyUrl: "https://open.spotify.com/show/7sMWiLwUHPAqHyxYBQp7Qx",
          mediaType: "audioShelf",
        },
        {
          id: "the-current-podcast",
          title: "The.Crnt Podcast",
          subtitle: "",
          rssUrl: "https://anchor.fm/s/f9eea9b8/podcast/rss",
          spotifyShowId: "7xu0obdpJbYpFT62IohTkl",
          sourceUrl: "https://open.spotify.com/show/7xu0obdpJbYpFT62IohTkl",
          spotifyUrl: "https://open.spotify.com/show/7xu0obdpJbYpFT62IohTkl",
          mediaType: "audioShelf",
        },
        {
          id: "kingdom-first-business-alliance-podcast",
          title: "Kingdom First Business Alliance Podcast",
          subtitle: "",
          rssUrl: "https://anchor.fm/s/10ef5931c/podcast/rss",
          spotifyShowId: "4rbu39RRiyRqVWzlfFk77I",
          sourceUrl: "https://open.spotify.com/show/4rbu39RRiyRqVWzlfFk77I",
          spotifyUrl: "https://open.spotify.com/show/4rbu39RRiyRqVWzlfFk77I",
          mediaType: "audioShelf",
        },
      ],
    },

    app: {
      highlightedPlaylistId: "highlighted-messages",
      playlistFilters: [
        { id: "topic", label: "Topic", prefix: "Topic" },
        { id: "series", label: "Series", prefix: "Series" },
        { id: "speaker", label: "Speaker", type: "speaker" },
        { id: "worship-moments", label: "Worship Moments", prefix: "Worship Moments", hidden: true },
      ],
      youtubeShelfActions: [
        {
          label: "Subscribe on YouTube",
          href: "https://www.youtube.com/anchorfaith",
          kind: "youtube",
        },
        {
          label: "Get Notifications",
          href: "https://www.youtube.com/anchorfaith?sub_confirmation=1",
          kind: "youtube-notifications",
        },
      ],
      podcastActions: {
        spotifyLabel: "Spotify",
        appleLabel: "Apple Podcasts",
      },
    },

    playlists: {},
    shelves: [],
    podcastShelves: [],
    media: [],
  };
})();
