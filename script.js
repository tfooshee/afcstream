(function () {
  const prototypeData = window.AnchorFaithPrototypeData || {};
  const runtimeConfig = window.AnchorFaithStreamingConfig || {};
  const dataSourceConfig = mergeDataSourceConfig(prototypeData.dataSources || {}, runtimeConfig.dataSources || runtimeConfig);
  const playlists = prototypeData.playlists || {};
  let sermons = [];
  let audioEpisodes = [];
  let shelfConfigs = [];
  let podcastShelfConfigs = mergePodcastSources(
    Array.isArray(prototypeData.dataSources?.podcasts) ? prototypeData.dataSources.podcasts : [],
    Array.isArray(runtimeConfig.podcasts) ? runtimeConfig.podcasts : runtimeConfig.dataSources?.podcasts || []
  );
  const appConfig = prototypeData.app || {};
  const CACHE_VERSION = "1.1-final";
  const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const HIGHLIGHTED_PLAYLIST_TITLE = "This is Who We Are";
  const bundledMediaCacheUrl =
    runtimeConfig.mediaCacheUrl ||
    runtimeConfig.dataSources?.mediaCacheUrl ||
    prototypeData.mediaCacheUrl ||
    "./media-cache.json?v=20260702q";
  const cacheState = {
    source: "none",
    lastUpdated: "",
    isStale: false,
    isRefreshing: false,
    hasCache: false,
  };
  const playlistFilters = Array.isArray(appConfig.playlistFilters)
    ? appConfig.playlistFilters
    : [
        { id: "topic", label: "Topic", matchText: "topic" },
        { id: "series", label: "Series", matchText: "series" },
        { id: "speaker", label: "Speaker", type: "speaker" },
      ];
  const APPROVED_SPEAKERS = [
    {
      displayName: "Ap. Earl Glisson",
      matchNames: ["earl glisson", "pastor earl glisson", "apostle earl glisson", "ap. earl glisson", "ap earl glisson"],
    },
    {
      displayName: "Ap. Marci Glisson",
      matchNames: ["marci glisson", "pastor marci glisson", "apostle marci glisson", "ap. marci glisson", "ap marci glisson"],
    },
    {
      displayName: "P. Mike Krulcik",
      matchNames: ["mike krulcik", "pastor mike krulcik", "p. mike krulcik", "p mike krulcik"],
    },
    {
      displayName: "P. Angie Krulcik",
      matchNames: ["angie krulcik", "pastor angie krulcik", "p. angie krulcik", "p angie krulcik"],
    },
    {
      displayName: "P. Chase Glisson",
      matchNames: ["chase glisson", "pastor chase glisson", "p. chase glisson", "p chase glisson"],
    },
    {
      displayName: "P. Joshua Clay",
      matchNames: ["joshua clay", "pastor joshua clay", "p. joshua clay", "p joshua clay"],
    },
    {
      displayName: "P. Danni Clay",
      matchNames: ["danni clay", "pastor danni clay", "p. danni clay", "p danni clay"],
    },
    {
      displayName: "P. Vanessa Cintron",
      matchNames: ["vanessa cintron", "pastor vanessa cintron", "p. vanessa cintron", "p vanessa cintron"],
    },
    {
      displayName: "P. Darrell Huffman",
      matchNames: ["darrell huffman", "pastor darrell huffman", "p. darrell huffman", "p darrell huffman"],
    },
  ];
  let allMedia = [];
  let mediaById = new Map();
  let mediaByTypeAndId = new Map();
  const dataState = {
    youtube: { status: "empty", message: "Cached sermon media is unavailable.", errors: [] },
    podcasts: { status: "empty", message: "Cached podcast media is unavailable.", errors: [] },
  };

  const dom = {
    hero: document.getElementById("featuredHero"),
    primaryShelves: document.getElementById("primaryShelves"),
    extraShelves: document.getElementById("extraShelves"),
    podcasts: document.getElementById("podcasts"),
    viewMoreButton: document.getElementById("viewMoreButton"),
    modal: document.getElementById("sermonModal"),
    modalContent: document.getElementById("modalContent"),
  };

  const shelfPositions = new Map(JSON.parse(sessionStorage.getItem("afShelfPositions") || "[]"));
  let lastScrollY = 0;
  let suppressClick = false;
  let activeModalId = null;
  let scrollLockState = null;
  let modalTouchStartY = 0;
  let allVideoPlaylists = [];
  let podcastShelves = [];
  let currentCollectionType = "";
  let currentSelectedGroupId = "";
  let isCollectionCollapsed = false;
  let lastShelfInteractionAt = 0;
  let deferredRefreshPatchTimer = 0;
  let heroSlideIndex = 0;
  let heroCarouselTimer = 0;
  let heroTouchStartX = 0;
  let heroTouchStartY = 0;
  let heroTouchStarted = false;
  let previousHeroImage = "";
  const HERO_CAROUSEL_INTERVAL_MS = 12000;
  const MOBILE_SHELF_QUERY = "(max-width: 767px), (pointer: coarse)";
  const SHELF_INITIAL_LIMITS = {
    mobileVideo: 8,
    mobileAudio: 8,
    desktopVideo: 28,
    desktopAudio: 24,
  };
  const SHELF_APPEND_LIMITS = {
    mobileVideo: 6,
    mobileAudio: 6,
    desktopVideo: 18,
    desktopAudio: 16,
  };
  const renderedShelfItemsById = new Map();
  let windowScrollFrame = 0;

  function iconPlay() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>';
  }

  function iconPause() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8z"/><path d="M13 5h3v14h-3z"/></svg>';
  }

  function iconExternal() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  }

  function mergeDataSourceConfig(base = {}, override = {}) {
    return {
      ...base,
      ...override,
      youtube: {
        ...(base.youtube || {}),
        ...(override.youtube || {}),
      },
      podcasts: mergePodcastSources(base.podcasts || [], override.podcasts || []),
    };
  }

  function mergePodcastSources(baseSources = [], overrideSources = []) {
    const sourceMap = new Map();
    [...baseSources, ...overrideSources].filter(Boolean).forEach((source) => {
      const id = source.id || slugify(source.title || source.rssUrl || source.sourceUrl || "");
      if (!id) return;
      sourceMap.set(id, {
        ...(sourceMap.get(id) || {}),
        ...source,
        id,
      });
    });
    return [...sourceMap.values()];
  }

  function setDataState(source, status, message, errors = []) {
    dataState[source] = {
      status,
      message,
      errors: errors.filter(Boolean).map((error) => String(error.message || error)),
    };
    if (status === "error") console.error(`[Anchor Faith ${source}]`, message, errors);
    if (status === "empty") console.warn(`[Anchor Faith ${source}]`, message);
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  function resetPlaylistRegistry(nextPlaylists = {}) {
    Object.keys(playlists).forEach((key) => delete playlists[key]);
    Object.assign(playlists, nextPlaylists || {});
  }

  function cacheAgeMs(lastUpdated) {
    const date = new Date(lastUpdated || "");
    if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
    return Date.now() - date.getTime();
  }

  function mediaCacheHasContent(data = {}) {
    const media = Array.isArray(data.media) ? data.media : [];
    const cachedSermons = Array.isArray(data.sermons) ? data.sermons : data.videos || [];
    const cachedAudio = Array.isArray(data.audioEpisodes) ? data.audioEpisodes : data.podcastEpisodes || [];
    return Boolean(media.length || cachedSermons.length || cachedAudio.length);
  }

  function normalizeMediaCacheEnvelope(rawCache, source = "cache") {
    if (!rawCache) return null;
    const data = rawCache.data || rawCache;
    if (!mediaCacheHasContent(data)) return null;
    const lastUpdated = rawCache.lastUpdated || rawCache.generatedAt || "";

    return {
      lastUpdated,
      source: rawCache.source || source,
      version: rawCache.version || CACHE_VERSION,
      data,
    };
  }

  function mediaCacheQuality(envelope) {
    if (!envelope?.data) return -1;
    const data = envelope.data;
    const videos = [
      ...(Array.isArray(data.sermons) ? data.sermons : []),
      ...(Array.isArray(data.videos) ? data.videos : []),
      ...cachedMediaByType(data, "video"),
    ];
    const audio = [
      ...(Array.isArray(data.audioEpisodes) ? data.audioEpisodes : []),
      ...(Array.isArray(data.podcastEpisodes) ? data.podcastEpisodes : []),
      ...cachedMediaByType(data, "audio"),
    ];
    const shelves = Array.isArray(data.shelfConfigs) ? data.shelfConfigs : data.shelves || [];
    const renderableVideos = videos.filter((item) => {
      const videoId = extractYouTubeVideoId(item.youtubeVideoId || item.youtubeId || item.videoId || item.embedUrl || item.externalUrl);
      const thumbnailUrl = item.thumbnailUrl || item.thumbnail || item.heroImage || item.image || "";
      const title = String(item.title || item.rawTitle || item.mainTitle || "").toLowerCase().trim();
      return videoId && thumbnailUrl && !title.includes("deleted video") && !title.includes("private video");
    });
    const renderableAudio = audio.filter((item) => {
      const title = String(item.title || item.rawTitle || item.mainTitle || "").trim();
      const artworkUrl = item.artworkUrl || item.thumbnailUrl || item.thumbnail || item.image || "";
      const localPrototypeUrl = `${item.audioUrl || ""} ${artworkUrl}`.toLowerCase();
      return title && artworkUrl && !/\.\/assets\//.test(localPrototypeUrl);
    });
    const spotifyReadyEpisodes = countSpotifyReadyEpisodes(audio);
    const generatedBonus = /generated|spotify/i.test(envelope.source || "") ? 1000 : 0;

    return (
      generatedBonus +
      renderableVideos.length * 8 +
      (renderableVideos.length ? shelves.length * 4 : 0) +
      renderableAudio.length * 5 +
      spotifyReadyEpisodes * 10
    );
  }

  function rankedCaches(envelopes = []) {
    return envelopes
      .filter(Boolean)
      .sort((a, b) => {
        const qualityDelta = mediaCacheQuality(b) - mediaCacheQuality(a);
        if (qualityDelta) return qualityDelta;
        return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
      });
  }

  function freshestCache(envelopes = []) {
    return rankedCaches(envelopes)[0] || null;
  }

  function readInlineBundledMediaCache() {
    return normalizeMediaCacheEnvelope(
      runtimeConfig.mediaCache ||
        runtimeConfig.dataSources?.mediaCache ||
        window.AnchorFaithMediaCache,
      "embedded-cache"
    );
  }

  async function readBundledMediaCache() {
    if (!bundledMediaCacheUrl) return null;

    try {
      const response = await fetch(bundledMediaCacheUrl, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Bundled cache failed with ${response.status}`);
      return normalizeMediaCacheEnvelope(await response.json(), "media-cache.json");
    } catch (error) {
      console.warn("[Anchor Faith cache] bundled cache could not be loaded.", error);
      return null;
    }
  }

  function cachedMediaByType(data = {}, mediaType) {
    const combinedMedia = Array.isArray(data.media) ? data.media : [];
    return combinedMedia.filter((item) => item.mediaType === mediaType);
  }

  function applyMediaDataset(data = {}, source = "cache") {
    const nextPlaylists = {
      ...(prototypeData.playlists || {}),
      ...(data.playlists || {}),
    };
    const nextShelfConfigs = Array.isArray(data.shelfConfigs)
      ? data.shelfConfigs
      : Array.isArray(data.shelves)
        ? data.shelves.filter((shelf) => shelf.mediaType === "video")
        : [];
    const nextPodcastConfigs = Array.isArray(data.podcastShelfConfigs)
      ? data.podcastShelfConfigs
      : Array.isArray(data.podcastShelves)
        ? data.podcastShelves
        : [];
    const nextSermons = [
      ...(Array.isArray(data.sermons) ? data.sermons : []),
      ...(Array.isArray(data.videos) ? data.videos : []),
      ...cachedMediaByType(data, "video"),
    ].map((item) => ({ ...item, mediaType: "video" }));
    const nextAudioEpisodes = [
      ...(Array.isArray(data.audioEpisodes) ? data.audioEpisodes : []),
      ...(Array.isArray(data.podcastEpisodes) ? data.podcastEpisodes : []),
      ...cachedMediaByType(data, "audio"),
    ].map((item) => ({ ...item, mediaType: "audio" }));

    resetPlaylistRegistry(nextPlaylists);
    shelfConfigs = clonePlain(nextShelfConfigs) || [];
    podcastShelfConfigs = mergePodcastSources(podcastShelfConfigs, clonePlain(nextPodcastConfigs) || []);
    sermons = dedupeMediaItems(clonePlain(nextSermons) || []);
    audioEpisodes = dedupeMediaItems(clonePlain(nextAudioEpisodes) || []);
    sermons.forEach(normalizeMediaItem);
    sermons = sermons.filter((item) => !isUnavailableYouTubeVideo(item));
    audioEpisodes.forEach(normalizeMediaItem);
    audioEpisodes = audioEpisodes.filter((item) => !isUnavailablePodcastEpisode(item));
    rebuildMediaLookups();

    if (sermons.length && shelfConfigs.length) {
      setDataState("youtube", "loaded", `Showing ${source} video cache.`);
    } else {
      setDataState("youtube", "empty", "No cached sermon videos are available yet.");
    }

    if (audioEpisodes.length) {
      setDataState("podcasts", "loaded", `Showing ${source} podcast cache.`);
    } else {
      setDataState("podcasts", "empty", "No cached podcast episodes are available yet.");
    }

    return hasRenderableMedia();
  }

  function applyMediaCacheEnvelope(envelope) {
    if (!envelope) return false;
    const applied = applyMediaDataset(envelope.data, envelope.source);
    if (!applied) return false;
    cacheState.source = envelope.source;
    cacheState.lastUpdated = envelope.lastUpdated || "";
    cacheState.isStale = cacheAgeMs(envelope.lastUpdated) > CACHE_MAX_AGE_MS;
    cacheState.hasCache = true;
    console.log("Anchor Faith media cache applied:", {
      source: cacheState.source,
      lastUpdated: cacheState.lastUpdated,
      stale: cacheState.isStale,
    });
    return true;
  }

  function captureMediaDataset() {
    return {
      playlists: clonePlain(playlists) || {},
      shelfConfigs: clonePlain(shelfConfigs) || [],
      podcastShelfConfigs: clonePlain(podcastShelfConfigs) || [],
      sermons: clonePlain(sermons) || [],
      audioEpisodes: clonePlain(audioEpisodes) || [],
    };
  }

  function restoreYouTubeDataset(snapshot, previousState) {
    resetPlaylistRegistry(snapshot.playlists || {});
    shelfConfigs = snapshot.shelfConfigs || [];
    sermons = snapshot.sermons || [];
    dataState.youtube = previousState || dataState.youtube;
    rebuildMediaLookups();
  }

  function restorePodcastDataset(snapshot, previousState) {
    podcastShelfConfigs = snapshot.podcastShelfConfigs || podcastShelfConfigs;
    audioEpisodes = snapshot.audioEpisodes || [];
    dataState.podcasts = previousState || dataState.podcasts;
    rebuildMediaLookups();
  }

  function hasRenderableMedia() {
    return Boolean(sermons.length || audioEpisodes.length);
  }

  function hasEpisodeLevelSpotify(item) {
    return Boolean(
      extractSpotifyEpisodeId(item.spotifyEpisodeId || item.spotifyEpisodeUrl || item.spotifyUrl || item.embedUrl || item.externalUrl)
    );
  }

  function countSpotifyReadyEpisodes(items = []) {
    return items.filter((item) => item.mediaType === "audio" && hasEpisodeLevelSpotify(item)).length;
  }

  function podcastRefreshLooksIncomplete(nextEpisodes = [], previousEpisodes = []) {
    if (!previousEpisodes.length) return false;
    if (!nextEpisodes.length) return true;

    const previousPodcastIds = new Set(previousEpisodes.map((item) => item.podcastId || item.feedId || "").filter(Boolean));
    const nextPodcastIds = new Set(nextEpisodes.map((item) => item.podcastId || item.feedId || "").filter(Boolean));
    const missingExistingFeed = [...previousPodcastIds].some((id) => !nextPodcastIds.has(id));
    const previousSpotifyCount = countSpotifyReadyEpisodes(previousEpisodes);
    const nextSpotifyCount = countSpotifyReadyEpisodes(nextEpisodes);
    const largeEpisodeDrop = nextEpisodes.length < Math.max(1, Math.floor(previousEpisodes.length * 0.65));

    return missingExistingFeed || largeEpisodeDrop || (previousSpotifyCount > 0 && nextSpotifyCount < previousSpotifyCount);
  }

  function videoRefreshLooksIncomplete(nextSermons = [], nextShelfConfigs = [], previousDataset = {}) {
    if (!previousDataset.sermons?.length || !previousDataset.shelfConfigs?.length) return false;
    if (!nextSermons.length || !nextShelfConfigs.length) return true;

    const largeVideoDrop = nextSermons.length < Math.max(1, Math.floor(previousDataset.sermons.length * 0.65));
    const largeShelfDrop = nextShelfConfigs.length < Math.max(1, Math.floor(previousDataset.shelfConfigs.length * 0.65));

    return largeVideoDrop || largeShelfDrop;
  }

  function saveMediaCache(source = "youtube-rss") {
    void source;
  }

  function hydrateInitialMediaFromCacheSync() {
    const inlineCache = readInlineBundledMediaCache();

    if (applyMediaCacheEnvelope(inlineCache)) {
      return true;
    }

    return false;
  }

  function renderFromBundledRealCacheImmediately() {
    return hydrateInitialMediaFromCacheSync();
  }

  async function hydrateBundledMediaCacheInBackground() {
    return false;
  }

  function captureShelfScrollPositions(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    scope.querySelectorAll(".af-shelf__rail").forEach((rail) => {
      if (rail.dataset.shelfRail) shelfPositions.set(rail.dataset.shelfRail, rail.scrollLeft);
    });
    sessionStorage.setItem("afShelfPositions", JSON.stringify([...shelfPositions]));
  }

  function rebuildMediaLookups() {
    allMedia = [...sermons, ...audioEpisodes];
    mediaById = new Map(allMedia.map((item) => [String(item.id), item]));
    mediaByTypeAndId = buildMediaLookup(allMedia);
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseAnchorFaithTitle(rawTitle) {
    const normalizedRawTitle = String(rawTitle || "").trim();
    const parts = normalizedRawTitle.split("|").map((part) => part.trim());
    const parsed = {
      rawTitle: normalizedRawTitle,
      mainTitle: parts[0] || normalizedRawTitle,
      subtitle: "",
      minister: "",
    };

    if (parts.length >= 2) parsed.subtitle = parts[1] || "";
    if (parts.length >= 3) parsed.minister = parts.slice(2).join(" | ").trim();

    return parsed;
  }

  function extractYouTubeVideoId(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;

    try {
      const parsed = new URL(source, window.location.href);
      const host = parsed.hostname.replace(/^www\./, "");

      if (host === "youtu.be") {
        const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
      }

      if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
        const watchId = parsed.searchParams.get("v");
        if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

        const parts = parsed.pathname.split("/").filter(Boolean);
        const embedIndex = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
        const pathId = embedIndex >= 0 ? parts[embedIndex + 1] : "";
        return pathId && /^[a-zA-Z0-9_-]{11}$/.test(pathId) ? pathId : "";
      }
    } catch (error) {
      const match = source.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : "";
    }

    return "";
  }

  function youtubeEmbedUrl(videoId, options = {}) {
    const cleanVideoId = extractYouTubeVideoId(videoId);
    if (!cleanVideoId) return "";
    const params = options.autoplay ? "autoplay=1&rel=0" : "rel=0";
    return `https://www.youtube.com/embed/${cleanVideoId}?${params}`;
  }

  function youtubeThumbnailUrl(videoId, fileName) {
    const cleanVideoId = extractYouTubeVideoId(videoId);
    return cleanVideoId && fileName ? `https://i.ytimg.com/vi/${cleanVideoId}/${fileName}` : "";
  }

  function modalVideoPosterSource(item, videoId) {
    const cleanVideoId = extractYouTubeVideoId(videoId);
    const candidates = [
      item.heroImage,
      item.maxresThumbnail,
      item.maxresdefault,
      cleanVideoId ? youtubeThumbnailUrl(cleanVideoId, "maxresdefault.jpg") : "",
      item.standardThumbnail,
      item.thumbnailUrl,
      item.thumbnail,
    ].filter(Boolean);

    return {
      src: candidates[0] || "",
      fallback: cleanVideoId ? youtubeThumbnailUrl(cleanVideoId, "hqdefault.jpg") : item.thumbnail || item.thumbnailUrl || "",
    };
  }

  function extractSpotifyEpisodeId(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^[A-Za-z0-9]{16,32}$/.test(source)) return source;

    const uriMatch = source.match(/spotify:episode:([A-Za-z0-9]{16,32})/);
    if (uriMatch) return uriMatch[1];

    const urlMatch = source.match(/open\.spotify\.com\/(?:embed\/)?episode\/([A-Za-z0-9]{16,32})/);
    if (urlMatch) return urlMatch[1];

    try {
      const parsed = new URL(source, window.location.href);
      const host = parsed.hostname.replace(/^www\./, "");
      if (host !== "open.spotify.com") return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      const episodeIndex = parts.findIndex((part) => part === "episode");
      const id = episodeIndex >= 0 ? parts[episodeIndex + 1] : "";
      return id && /^[A-Za-z0-9]{16,32}$/.test(id) ? id : "";
    } catch (error) {
      return "";
    }
  }

  function spotifyEpisodeUrlFromText(value) {
    const match = String(value || "").match(/https?:\/\/open\.spotify\.com\/episode\/[A-Za-z0-9]{16,32}(?:\?[^"'<\s]*)?/);
    return match ? match[0] : "";
  }

  function spotifyEpisodeUrl(episodeId) {
    const cleanEpisodeId = extractSpotifyEpisodeId(episodeId);
    return cleanEpisodeId ? `https://open.spotify.com/episode/${cleanEpisodeId}` : "";
  }

  function spotifyEpisodeEmbedUrl(episodeIdOrUrl) {
    const cleanEpisodeId = extractSpotifyEpisodeId(episodeIdOrUrl);
    return cleanEpisodeId
      ? `https://open.spotify.com/embed/episode/${cleanEpisodeId}?utm_source=generator&theme=0`
      : "";
  }

  function isLikelyAudioUrl(value) {
    const source = String(value || "").trim();
    if (!source) return false;
    return (
      /\.(mp3|m4a|wav|aac|ogg)(?:[?#].*)?$/i.test(source) ||
      /\/audio\//i.test(source) ||
      /anchor\.fm\/s\/.+\/podcast\/play\//i.test(source)
    );
  }

  function youtubeApiUrl(endpoint, params = {}) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function fetchJson(url, label) {
    const response = await fetch(url);
    if (!response.ok) {
      let errorMessage = `${label} failed with ${response.status}`;
      try {
        const body = await response.json();
        errorMessage = body.error?.message || errorMessage;
      } catch (error) {
        errorMessage = `${errorMessage}: ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
    return response.json();
  }

  async function fetchYouTubePages(endpoint, params = {}) {
    const items = [];
    let pageToken = "";

    do {
      const body = await fetchJson(
        youtubeApiUrl(endpoint, {
          ...params,
          maxResults: 50,
          pageToken,
        }),
        `YouTube ${endpoint}`
      );
      items.push(...(body.items || []));
      pageToken = body.nextPageToken || "";
    } while (pageToken);

    return items;
  }

  async function fetchYouTubeVideoDetails(videoIds, apiKey) {
    const details = new Map();
    const uniqueIds = [...new Set(videoIds.filter(Boolean))];

    for (let index = 0; index < uniqueIds.length; index += 50) {
      const ids = uniqueIds.slice(index, index + 50);
      const body = await fetchJson(
        youtubeApiUrl("videos", {
          part: "snippet,contentDetails",
          id: ids.join(","),
          key: apiKey,
          maxResults: 50,
        }),
        "YouTube videos"
      );
      (body.items || []).forEach((item) => details.set(item.id, item));
    }

    return details;
  }

  async function fetchYouTubeChannelByFilter(apiKey, filterName, filterValue, label) {
    if (!filterValue) return null;
    const body = await fetchJson(
      youtubeApiUrl("channels", {
        part: "snippet,contentDetails",
        [filterName]: filterValue,
        key: apiKey,
      }),
      label
    );
    return body.items?.[0] || null;
  }

  function cleanYouTubeHandle(value) {
    return String(value || "")
      .trim()
      .replace(/^@/, "");
  }

  function chooseYouTubeChannelSearchResult(items = [], query = "") {
    if (!items.length) return null;
    const normalizedQuery = normalizedText(query);
    const normalizedAnchorFaith = "anchor-faith-church";

    return (
      items.find((item) => normalizedText(item.snippet?.title) === normalizedQuery) ||
      items.find((item) => normalizedText(item.snippet?.title) === normalizedAnchorFaith) ||
      items.find((item) => normalizedText(item.snippet?.title).includes("anchor-faith")) ||
      items[0]
    );
  }

  async function resolveYouTubeChannel(apiKey, config = {}) {
    const configuredChannelId = String(config.channelId || "").trim();
    const channelHandle = cleanYouTubeHandle(config.channelHandle || config.handle || "");
    const channelUsername = cleanYouTubeHandle(config.channelUsername || config.username || "");
    const channelSearchQuery = String(
      config.channelSearchQuery || config.searchQuery || config.channelTitle || "Anchor Faith Church"
    ).trim();
    const attemptedLookups = [];

    if (configuredChannelId) {
      try {
        const channel = await fetchYouTubeChannelByFilter(apiKey, "id", configuredChannelId, "YouTube channel by ID");
        if (channel) return channel;
        attemptedLookups.push(`channelId ${configuredChannelId}: no channel returned`);
      } catch (error) {
        attemptedLookups.push(`channelId ${configuredChannelId}: ${error.message}`);
      }
    }

    if (channelHandle) {
      try {
        const channel = await fetchYouTubeChannelByFilter(apiKey, "forHandle", channelHandle, "YouTube channel by handle");
        if (channel) return channel;
        attemptedLookups.push(`handle @${channelHandle}: no channel returned`);
      } catch (error) {
        attemptedLookups.push(`handle @${channelHandle}: ${error.message}`);
      }
    }

    if (channelUsername) {
      try {
        const channel = await fetchYouTubeChannelByFilter(
          apiKey,
          "forUsername",
          channelUsername,
          "YouTube channel by username"
        );
        if (channel) return channel;
        attemptedLookups.push(`username ${channelUsername}: no channel returned`);
      } catch (error) {
        attemptedLookups.push(`username ${channelUsername}: ${error.message}`);
      }
    }

    if (channelSearchQuery) {
      try {
        const searchResults = await fetchJson(
          youtubeApiUrl("search", {
            part: "snippet",
            type: "channel",
            q: channelSearchQuery,
            maxResults: 5,
            key: apiKey,
          }),
          "YouTube channel search"
        );
        const searchMatch = chooseYouTubeChannelSearchResult(searchResults.items || [], channelSearchQuery);
        const searchChannelId = searchMatch?.snippet?.channelId || "";

        if (searchChannelId) {
          const channel = await fetchYouTubeChannelByFilter(
            apiKey,
            "id",
            searchChannelId,
            "YouTube searched channel"
          );
          if (channel) return channel;
        }

        attemptedLookups.push(`search "${channelSearchQuery}": no channel returned`);
      } catch (error) {
        attemptedLookups.push(`search "${channelSearchQuery}": ${error.message}`);
      }
    }

    throw new Error(`No YouTube channel found. ${attemptedLookups.join(" | ")}`);
  }

  function youtubeThumbnailFromSnippet(snippet = {}) {
    const thumbnails = snippet.thumbnails || {};
    return (
      thumbnails.maxres?.url ||
      thumbnails.standard?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      ""
    );
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function formatYouTubeDuration(value) {
    const match = String(value || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "";
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function playlistVideoIdsInOrder(playlistItems = []) {
    const seen = new Set();
    return [...playlistItems]
      .sort((a, b) => Number(a.contentDetails?.position ?? Number.MAX_SAFE_INTEGER) - Number(b.contentDetails?.position ?? Number.MAX_SAFE_INTEGER))
      .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "")
      .filter((videoId) => {
        if (!videoId || seen.has(videoId)) return false;
        seen.add(videoId);
        return true;
      });
  }

  function videoItemFromYouTube(playlistConfig, playlistItem, detail) {
    const videoId = playlistItem.contentDetails?.videoId || playlistItem.snippet?.resourceId?.videoId || detail?.id || "";
    const snippet = detail?.snippet || playlistItem.snippet || {};
    const rawTitle = snippet.title || "Untitled sermon";
    const description = snippet.description || playlistItem.snippet?.description || "";
    const thumbnail = youtubeThumbnailFromSnippet(snippet) || youtubeThumbnailFromSnippet(playlistItem.snippet);

    return {
      id: `yt-${videoId}`,
      mediaType: "video",
      rawTitle,
      title: rawTitle,
      date: formatDate(detail?.snippet?.publishedAt || playlistItem.contentDetails?.videoPublishedAt || playlistItem.snippet?.publishedAt),
      duration: formatYouTubeDuration(detail?.contentDetails?.duration),
      description,
      youtubeDescription: description,
      youtubeVideoId: videoId,
      youtubeId: videoId,
      thumbnail,
      heroImage: thumbnail,
      embedUrl: youtubeEmbedUrl(videoId),
      externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      externalActionLabel: "Play on YouTube",
      playlistIds: [playlistConfig.playlistId],
      tags: [playlistConfig.title],
      playlistTitle: playlistConfig.title,
    };
  }

  function mergeVideoIntoCollection(collection, item) {
    if (!item.youtubeVideoId) return;
    const existing = collection.get(item.youtubeVideoId);
    if (!existing) {
      collection.set(item.youtubeVideoId, item);
      return;
    }

    existing.playlistIds = [...new Set([...(existing.playlistIds || []), ...(item.playlistIds || [])])];
    existing.tags = [...new Set([...(existing.tags || []), ...(item.tags || [])])];
  }

  async function loadYouTubeData(options = {}) {
    const config = dataSourceConfig.youtube || {};
    const apiKey = config.apiKey || "";
    const configuredChannelId = config.channelId || "";
    const channelHandle = config.channelHandle || config.handle || "";
    const channelUsername = config.channelUsername || config.username || "";
    const channelSearchQuery = config.channelSearchQuery || config.searchQuery || config.channelTitle || "";
    const previousDataset = captureMediaDataset();
    const previousState = clonePlain(dataState.youtube);

    function preserveYouTubeCache(message, errors = []) {
      if (!options.preserveExistingData || !previousDataset.sermons.length || !previousDataset.shelfConfigs.length) {
        return false;
      }

      restoreYouTubeDataset(previousDataset, previousState);
      console.warn("[Anchor Faith youtube] Keeping cached videos after refresh failure.", message, errors);
      return true;
    }

    if (!apiKey || (!configuredChannelId && !channelHandle && !channelUsername && !channelSearchQuery)) {
      const errors = [
        !apiKey ? "Missing youtube.apiKey" : "",
        !configuredChannelId && !channelHandle && !channelUsername && !channelSearchQuery
          ? "Missing youtube.channelId, youtube.channelHandle, youtube.channelUsername, or youtube.channelSearchQuery"
          : "",
      ];
      const message =
        "Sermon media is temporarily unavailable.";
      if (preserveYouTubeCache(message, errors)) return { ok: false, preserved: true, source: "youtube" };
      setDataState("youtube", "error", message, errors);
      sermons = [];
      shelfConfigs = [];
      return { ok: false, source: "youtube" };
    }

    setDataState("youtube", "refreshing", "Refreshing YouTube playlists in the background.");

    try {
      const channel = await resolveYouTubeChannel(apiKey, config);
      const channelId = channel?.id || configuredChannelId;
      if (!channelId) throw new Error("No YouTube channel ID was returned after channel lookup.");
      console.log("Resolved YouTube channel:", channel.snippet?.title || channelId, channelId);
      const uploadsPlaylistId = config.latestPlaylistId || channel?.contentDetails?.relatedPlaylists?.uploads || "";
      const playlistItems = await fetchYouTubePages("playlists", {
        part: "snippet,contentDetails",
        channelId,
        key: apiKey,
      });

      const realShelfConfigs = [];
      if (uploadsPlaylistId) {
        realShelfConfigs.push({
          id: "latest-sermons",
          title: "Recent Sermons",
          subtitle: "",
          mediaType: "video",
          playlistId: uploadsPlaylistId,
          isLatestShelf: true,
          actions: appConfig.youtubeShelfActions || [],
        });
        playlists[uploadsPlaylistId] = "Latest Sermons";
      }

      playlistItems.forEach((playlist) => {
        const title = playlist.snippet?.title || "Untitled Playlist";
        realShelfConfigs.push({
          id: `youtube-${playlist.id}`,
          title,
          subtitle: playlist.snippet?.description || "",
          mediaType: "video",
          playlistId: playlist.id,
        });
        playlists[playlist.id] = title;
      });

      shelfConfigs = realShelfConfigs;
      const playlistPages = new Map();
      const allVideoIds = [];

      for (const shelf of shelfConfigs) {
        const items = await fetchYouTubePages("playlistItems", {
          part: "snippet,contentDetails",
          playlistId: shelf.playlistId,
          key: apiKey,
        });
        playlistPages.set(shelf.playlistId, items);
        items.forEach((item) => {
          const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
          if (videoId) allVideoIds.push(videoId);
        });
      }

      const videoDetails = await fetchYouTubeVideoDetails(allVideoIds, apiKey);
      const videoMap = new Map();

      shelfConfigs.forEach((shelf) => {
        const items = playlistPages.get(shelf.playlistId) || [];
        items.forEach((playlistItem) => {
          const videoId = playlistItem.contentDetails?.videoId || playlistItem.snippet?.resourceId?.videoId || "";
          if (!videoId) return;
          mergeVideoIntoCollection(videoMap, videoItemFromYouTube(shelf, playlistItem, videoDetails.get(videoId)));
        });
      });

      sermons = [...videoMap.values()];
      sermons.forEach(normalizeMediaItem);
      sermons = sermons.filter((item) => !isUnavailableYouTubeVideo(item));
      shelfConfigs = shelfConfigs.filter((shelf) => itemsForVideoShelf(shelf).length > 0);

      if (videoRefreshLooksIncomplete(sermons, shelfConfigs, previousDataset)) {
        if (preserveYouTubeCache("YouTube refresh returned incomplete playlist data.")) {
          return { ok: false, preserved: true, source: "youtube" };
        }
      }

      if (!sermons.length || !shelfConfigs.length) {
        if (preserveYouTubeCache("YouTube loaded successfully, but no playlist videos were returned.")) {
          return { ok: false, preserved: true, source: "youtube" };
        }
        setDataState("youtube", "empty", "Sermon media is temporarily unavailable.");
        return { ok: false, source: "youtube" };
      }

      const highlightedShelf = shelfConfigs.find((shelf) => playlistTitleMatches(shelf.title));
      if (highlightedShelf) {
        highlightedShelf.itemIds = playlistVideoIdsInOrder(playlistPages.get(highlightedShelf.playlistId) || []);
      }
      setDataState("youtube", "loaded", `Loaded ${shelfConfigs.length} YouTube shelves and ${sermons.length} videos.`);
      return { ok: true, source: "youtube" };
    } catch (error) {
      if (preserveYouTubeCache(`YouTube refresh failed: ${error.message}`, [error])) {
        return { ok: false, preserved: true, source: "youtube" };
      }
      sermons = [];
      shelfConfigs = [];
      setDataState("youtube", "error", "Sermon media is temporarily unavailable.", [error]);
      return { ok: false, source: "youtube" };
    }
  }

  function rssFetchUrl(source) {
    const rssUrl = source.rssUrl || "";
    const proxy = source.rssProxyUrl || dataSourceConfig.rssProxyUrl || "";
    if (!rssUrl || !proxy) return rssUrl;
    return proxy.includes("{url}") ? proxy.replace("{url}", encodeURIComponent(rssUrl)) : `${proxy}${encodeURIComponent(rssUrl)}`;
  }

  function childText(node, names = []) {
    const wanted = names.map((name) => name.toLowerCase());
    const match = [...(node?.children || [])].find((child) => wanted.includes(child.localName.toLowerCase()));
    return match?.textContent?.trim() || "";
  }

  function childAttribute(node, names = [], attribute) {
    const wanted = names.map((name) => name.toLowerCase());
    const match = [...(node?.children || [])].find((child) => wanted.includes(child.localName.toLowerCase()));
    return match?.getAttribute(attribute) || "";
  }

  async function fetchPodcastFeed(source) {
    if (!source.rssUrl) {
      throw new Error(`${source.title} is missing rssUrl. Add a real podcast RSS feed URL before publishing.`);
    }

    const response = await fetch(rssFetchUrl(source));
    if (!response.ok) throw new Error(`${source.title} RSS failed with ${response.status}: ${response.statusText}`);
    const xmlText = await response.text();
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) throw new Error(`${source.title} RSS could not be parsed.`);

    const channel = doc.querySelector("channel");
    const channelArtwork =
      childAttribute(channel, ["image"], "href") ||
      childText(channel?.querySelector("image"), ["url"]) ||
      childAttribute(channel, ["image"], "url") ||
      "";

    return [...doc.querySelectorAll("item")].map((item, index) => {
      const guid = childText(item, ["guid"]) || `${source.id}-${index}`;
      const enclosure = [...item.children].find((child) => child.localName.toLowerCase() === "enclosure");
      const artwork =
        childAttribute(item, ["image"], "href") ||
        childAttribute(item, ["thumbnail"], "url") ||
        childAttribute(item, ["content"], "url") ||
        channelArtwork;
      const title = childText(item, ["title"]) || "Untitled episode";
      const description = childText(item, ["description", "summary", "encoded"]);
      const itemLink = childText(item, ["link"]);
      const audioUrl = enclosure?.getAttribute("url") || childText(item, ["link"]);
      const spotifyEpisodeCandidate =
        [
          source.spotifyEpisodeUrl,
          source.spotifyEpisodeId,
          itemLink,
          guid,
          description,
          spotifyEpisodeUrlFromText(description),
        ].find((value) => extractSpotifyEpisodeId(value)) || "";
      const spotifyEpisodeId = extractSpotifyEpisodeId(spotifyEpisodeCandidate);
      const resolvedSpotifyEpisodeUrl = spotifyEpisodeId ? spotifyEpisodeUrl(spotifyEpisodeId) : "";

      return {
        id: `${source.id}-${slugify(guid || title)}`,
        mediaType: "audio",
        title,
        mainTitle: title,
        host: source.title,
        minister: source.title,
        date: formatDate(childText(item, ["pubDate", "published", "updated"])),
        duration: childText(item, ["duration"]),
        description,
        fullDescription: description,
        summaryDescription: previewDescriptionLines(description),
        rssGuid: guid,
        thumbnail: artwork,
        artworkUrl: artwork,
        sourceUrl: source.rssUrl,
        audioUrl,
        externalUrl: resolvedSpotifyEpisodeUrl || itemLink || audioUrl || source.sourceUrl || "",
        spotifyEpisodeId,
        spotifyEpisodeUrl: resolvedSpotifyEpisodeUrl,
        spotifyUrl: resolvedSpotifyEpisodeUrl || source.spotifyUrl || "",
        spotifyShowId: source.spotifyShowId || "",
        showSpotifyUrl: source.spotifyUrl || "",
        applePodcastUrl: source.applePodcastUrl || "",
        externalActionLabel: "Open Episode",
        podcastId: source.id,
        podcastName: source.title,
        tags: ["Podcast", source.title],
      };
    });
  }

  async function loadPodcastData(options = {}) {
    const previousDataset = captureMediaDataset();
    const previousState = clonePlain(dataState.podcasts);

    function preservePodcastCache(message, errors = []) {
      if (!options.preserveExistingData || !previousDataset.audioEpisodes.length) {
        return false;
      }

      restorePodcastDataset(previousDataset, previousState);
      console.warn("[Anchor Faith podcasts] Keeping cached episodes after refresh failure.", message, errors);
      return true;
    }

    podcastShelfConfigs = mergePodcastSources(dataSourceConfig.podcasts || [], runtimeConfig.podcasts || []);

    if (!podcastShelfConfigs.length) {
      if (preservePodcastCache("No podcast sources are configured.")) {
        return { ok: false, preserved: true, source: "podcasts" };
      }
      setDataState("podcasts", "empty", "Podcast media is temporarily unavailable.");
      audioEpisodes = [];
      return { ok: false, source: "podcasts" };
    }

    setDataState("podcasts", "refreshing", "Refreshing podcast RSS feeds in the background.");
    const errors = [];
    const episodes = [];

    for (const source of podcastShelfConfigs) {
      try {
        const sourceEpisodes = await fetchPodcastFeed(source);
        episodes.push(...sourceEpisodes);
      } catch (error) {
        errors.push(error);
      }
    }

    let nextAudioEpisodes = dedupeMediaItems(episodes);
    nextAudioEpisodes.forEach(normalizeMediaItem);
    nextAudioEpisodes = nextAudioEpisodes.filter((item) => !isUnavailablePodcastEpisode(item));

    if (podcastRefreshLooksIncomplete(nextAudioEpisodes, previousDataset.audioEpisodes || [])) {
      if (preservePodcastCache("Podcast refresh returned incomplete episode data.", errors)) {
        return { ok: false, preserved: true, source: "podcasts" };
      }
    }

    audioEpisodes = nextAudioEpisodes;

    if (errors.length && !audioEpisodes.length) {
      if (preservePodcastCache("Podcast refresh failed.", errors)) {
        return { ok: false, preserved: true, source: "podcasts" };
      }
      setDataState("podcasts", "error", "Podcast media is temporarily unavailable.", errors);
      return { ok: false, source: "podcasts" };
    }

    if (!audioEpisodes.length) {
      if (preservePodcastCache("Podcast feeds loaded, but no real episodes were returned.", errors)) {
        return { ok: false, preserved: true, source: "podcasts" };
      }
      setDataState("podcasts", "empty", "Podcast media is temporarily unavailable.", errors);
      return { ok: false, source: "podcasts" };
    }

    setDataState(
      "podcasts",
      errors.length ? "loaded" : "loaded",
      errors.length
        ? `Loaded ${audioEpisodes.length} podcast episodes. Some feeds reported errors.`
        : `Loaded ${audioEpisodes.length} podcast episodes.`,
      errors
    );
    return { ok: true, source: "podcasts" };
  }

  async function loadRealData(options = {}) {
    void options;
    return [];
  }

  function cleanDescriptionText(value) {
    const source = String(value || "");
    if (!source) return "";

    const htmlAwareText = source
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*p\s*>/gi, "\n\n")
      .replace(/<\/\s*div\s*>/gi, "\n")
      .replace(/<\/\s*li\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "");

    const decodedText = decodeHtmlEntities(htmlAwareText);

    return decodedText
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0|&nbsp;/gi, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function decodeHtmlEntities(value) {
    const source = String(value || "");
    if (!source) return "";

    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = source;
      return textarea.value;
    }

    return source
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  function previewDescriptionLines(fullDescription, lineCount = 3, maxCharacters = 360) {
    const cleanDescription = cleanDescriptionText(fullDescription);
    if (!cleanDescription) return "";

    const nonEmptyLines = cleanDescription
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const linePreview = nonEmptyLines.slice(0, lineCount).join("\n");
    const previewSource = linePreview || cleanDescription;

    if (previewSource.length <= maxCharacters) return previewSource;

    const truncated = previewSource.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim();
    return `${truncated}...`;
  }

  function normalizeDescription(item) {
    const fallbackDescription =
      item.mediaType === "video"
        ? "A sermon from Anchor Faith Church's public YouTube channel."
        : "An episode from Anchor Faith Church's podcast feed.";
    const youtubeDescription =
      item.youtubeDescription || item.youtubeVideoDescription || item.videoDescription || item.snippet?.description || "";
    const sourceDescription =
      item.mediaType === "video"
        ? youtubeDescription || item.fullDescription || item.rawDescription || item.description || fallbackDescription
        : item.fullDescription || item.rawDescription || item.description || fallbackDescription;
    const fullDescription = cleanDescriptionText(sourceDescription) || fallbackDescription;
    const summaryDescription = cleanDescriptionText(item.summaryDescription) || previewDescriptionLines(fullDescription);

    return {
      rawDescription: cleanDescriptionText(sourceDescription),
      fullDescription,
      summaryDescription,
      hasExpandableDescription: fullDescription !== summaryDescription,
      descriptionSource: youtubeDescription ? "youtube" : "fallback",
    };
  }

  function normalizeMediaItem(item) {
    const titleSource = item.rawTitle || item.youtubeTitle || item.title || item.mainTitle;
    const parsedTitle =
      item.mediaType === "video"
        ? parseAnchorFaithTitle(titleSource)
        : {
            rawTitle: String(titleSource || "").trim(),
            mainTitle: item.mainTitle || item.title || String(titleSource || "").trim(),
            subtitle: item.subtitle || "",
            minister: "",
          };
    const fallbackMinister = item.minister || item.host || "";
    const collection = item.mediaType === "audio" ? "podcasts" : "sermons";
    const descriptionData = normalizeDescription(item);
    const youtubeVideoId =
      item.mediaType === "video"
        ? extractYouTubeVideoId(item.youtubeVideoId || item.youtubeId || item.videoId || item.embedUrl || item.externalUrl)
        : "";
    const spotifyEpisodeId =
      item.mediaType === "audio"
        ? extractSpotifyEpisodeId(
            item.spotifyEpisodeId ||
              item.spotifyEpisodeUrl ||
              item.spotifyUrl ||
              item.embedUrl ||
              item.externalUrl ||
              item.sourceUrl
          )
        : "";
    const spotifyEpisodeHref = spotifyEpisodeId
      ? spotifyEpisodeUrl(item.spotifyEpisodeUrl || spotifyEpisodeId)
      : spotifyEpisodeUrlFromText(item.description || item.fullDescription || item.rawDescription);
    const spotifyEmbedHref = spotifyEpisodeId
      ? spotifyEpisodeEmbedUrl(spotifyEpisodeId)
      : spotifyEpisodeEmbedUrl(spotifyEpisodeHref || item.embedUrl);
    const originalAudioUrl = item.audioUrl || item.enclosureUrl || item.enclosure?.url || "";

    item.rawTitle = item.rawTitle || parsedTitle.rawTitle;
    item.mainTitle = item.mainTitle || parsedTitle.mainTitle || item.rawTitle;
    item.subtitle = item.subtitle || parsedTitle.subtitle || "";
    item.minister = parsedTitle.minister || fallbackMinister;
    item.host = item.host || item.minister || "";
    item.title = item.mainTitle || item.title || item.rawTitle;
    item.slug = item.slug || slugify(item.mainTitle || item.title || item.rawTitle);
    item.cmsUrl = item.cmsUrl || `/${collection}/${item.slug}`;
    item.thumbnail = item.thumbnail || item.artworkUrl || item.image || "";
    item.thumbnailUrl = item.thumbnailUrl || item.thumbnail;
    item.artworkUrl = item.artworkUrl || item.thumbnail;
    item.heroImage = item.heroImage || item.thumbnail;
    item.externalUrl = item.externalUrl || item.audioUrl || item.sourceUrl || "";
    if (item.mediaType === "video") {
      item.youtubeVideoId = youtubeVideoId;
      item.youtubeId = youtubeVideoId || item.youtubeId || "";
      item.embedUrl = youtubeVideoId ? youtubeEmbedUrl(youtubeVideoId) : "";
    } else {
      item.spotifyEpisodeId = spotifyEpisodeId || extractSpotifyEpisodeId(spotifyEpisodeHref);
      item.spotifyEpisodeUrl = spotifyEpisodeHref || (item.spotifyEpisodeId ? spotifyEpisodeUrl(item.spotifyEpisodeId) : "");
      item.showSpotifyUrl = item.showSpotifyUrl || "";
      item.spotifyUrl = item.spotifyEpisodeUrl || item.spotifyUrl || "";
      item.embedUrl = spotifyEmbedHref || "";
      item.audioUrl = isLikelyAudioUrl(originalAudioUrl) ? originalAudioUrl : "";
      item.externalUrl = item.spotifyEpisodeUrl || item.externalUrl || item.audioUrl || item.sourceUrl || "";
    }
    item.spotifyUrl = item.spotifyUrl || (item.mediaType === "audio" ? item.externalUrl : "");
    item.applePodcastUrl = item.applePodcastUrl || "";
    item.rawDescription = descriptionData.rawDescription;
    item.fullDescription = descriptionData.fullDescription;
    item.summaryDescription = descriptionData.summaryDescription;
    item.hasExpandableDescription = Boolean(descriptionData.hasExpandableDescription);
    item.descriptionSource = descriptionData.descriptionSource;
    item.description = item.summaryDescription || descriptionData.summaryDescription;
    item.playlistIds = Array.isArray(item.playlistIds) ? item.playlistIds : [];
    item.podcastId = item.podcastId || item.feedId || "";
    item.podcastName = item.podcastName || "";
  }

  function mediaLookupId(item) {
    if (item.mediaType === "video") return String(item.youtubeVideoId || item.youtubeId || item.id);
    return String(item.spotifyEpisodeId || item.rssGuid || item.guid || item.id);
  }

  function lookupKeysForMediaItem(item) {
    const keys = [
      item.id,
      mediaLookupId(item),
      item.youtubeVideoId,
      item.youtubeId,
      item.spotifyEpisodeId,
      item.rssGuid,
      item.guid,
      item.audioUrl,
      item.cmsUrl,
      item.externalUrl,
      item.sourceUrl,
    ]
      .filter(Boolean)
      .map(String);

    return [...new Set(keys)].map((key) => `${item.mediaType}:${key}`);
  }

  function buildMediaLookup(items) {
    return new Map(
      items.flatMap((item) => lookupKeysForMediaItem(item).map((key) => [key, item]))
    );
  }

  function uniqueMediaItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item) return false;
      const key = `${item.mediaType}:${mediaLookupId(item)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function findMediaItemById(id, mediaType) {
    const lookupId = String(id || "");
    if (!lookupId) return null;

    if (mediaType) {
      const directMatch = mediaByTypeAndId.get(`${mediaType}:${lookupId}`);
      if (directMatch) return directMatch;
    }

    const legacyMatch = mediaById.get(lookupId);
    if (legacyMatch && (!mediaType || legacyMatch.mediaType === mediaType)) return legacyMatch;

    const playlistItems = allVideoPlaylists.flatMap((playlist) => playlist.items || []);
    const audioItems = podcastShelves.flatMap((feed) => feed.items || []);
    const allItems = uniqueMediaItems([...playlistItems, ...audioItems, ...allMedia]);

    return (
      allItems.find((item) => {
        if (mediaType && item.mediaType !== mediaType) return false;
        return lookupKeysForMediaItem(item).includes(`${item.mediaType}:${lookupId}`);
      }) || null
    );
  }

  function itemMeta(item) {
    const creator = item.mediaType === "audio" ? item.podcastName || item.host || item.minister : item.minister;
    return [creator, item.date, item.duration].filter(Boolean);
  }

  function normalizedText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeSpeakerText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function approvedSpeakerNameParts(speaker) {
    return normalizeSpeakerText(speaker.displayName)
      .split(" ")
      .filter((part) => part && !["ap", "p", "pastor", "apostle"].includes(part));
  }

  function approvedSpeakerFirstNames() {
    const counts = new Map();
    APPROVED_SPEAKERS.forEach((speaker) => {
      const firstName = approvedSpeakerNameParts(speaker)[0];
      if (firstName) counts.set(firstName, (counts.get(firstName) || 0) + 1);
    });
    return counts;
  }

  const approvedSpeakerFirstNameCounts = approvedSpeakerFirstNames();

  function textHasSpeakerFirstAndLast(value, speaker) {
    const normalized = normalizeSpeakerText(value);
    const nameParts = approvedSpeakerNameParts(speaker);
    if (nameParts.length < 2) return false;
    return normalized.includes(`${nameParts[0]} ${nameParts[nameParts.length - 1]}`);
  }

  function textHasUniquePastorFirstName(value, speaker) {
    const normalized = normalizeSpeakerText(value);
    const firstName = approvedSpeakerNameParts(speaker)[0];
    if (!firstName || approvedSpeakerFirstNameCounts.get(firstName) !== 1) return false;
    return new RegExp(`\\b(?:pastor|p|ap|apostle)\\s+${firstName}\\b`).test(normalized);
  }

  function textIsBareUniqueFirstName(value, speaker) {
    const normalized = normalizeSpeakerText(value);
    const firstName = approvedSpeakerNameParts(speaker)[0];
    return Boolean(firstName && approvedSpeakerFirstNameCounts.get(firstName) === 1 && normalized === firstName);
  }

  function canonicalSpeakerFromControlledText(value, options = {}) {
    const normalized = normalizeSpeakerText(value);
    if (!normalized) return null;

    for (const speaker of APPROVED_SPEAKERS) {
      const matchedAlias = speaker.matchNames.some((name) => {
        const normalizedName = normalizeSpeakerText(name);
        return normalized === normalizedName || normalized.includes(normalizedName);
      });

      if (matchedAlias || textHasSpeakerFirstAndLast(value, speaker)) return speaker.displayName;
      if (options.allowUniquePastorFirstName && textHasUniquePastorFirstName(value, speaker)) return speaker.displayName;
      if (options.allowBareUniqueFirstName && textIsBareUniqueFirstName(value, speaker)) return speaker.displayName;
    }

    return null;
  }

  function getCanonicalSpeakerName(video) {
    const cachedCanonical = canonicalSpeakerFromControlledText(video.canonicalSpeaker || video.speaker || "", {
      allowUniquePastorFirstName: true,
      allowBareUniqueFirstName: true,
    });
    if (cachedCanonical) return cachedCanonical;

    const explicitMinister = String(video.minister || "").trim();
    const explicitMatch = canonicalSpeakerFromControlledText(explicitMinister, {
      allowUniquePastorFirstName: true,
      allowBareUniqueFirstName: true,
    });
    if (explicitMatch) return explicitMatch;

    const rawTitle = String(video.rawTitle || video.youtubeTitle || video.title || "").trim();
    const titleParts = rawTitle.split("|").map((part) => part.trim()).filter(Boolean);

    if (titleParts.length >= 3) {
      return canonicalSpeakerFromControlledText(titleParts.slice(2).join(" | "), {
        allowUniquePastorFirstName: true,
        allowBareUniqueFirstName: true,
      });
    }

    return null;
  }

  function isUnavailableYouTubeVideo(video) {
    if (!video || video.mediaType !== "video") return false;
    const title = String(video.title || video.rawTitle || video.mainTitle || "").toLowerCase().trim();
    const youtubeVideoId = extractYouTubeVideoId(video.youtubeVideoId || video.youtubeId || video.videoId || video.embedUrl || video.externalUrl);
    const thumbnailUrl = video.thumbnailUrl || video.thumbnail || video.heroImage || video.image || "";

    return (
      title === "deleted video" ||
      title === "private video" ||
      title.includes("deleted video") ||
      title.includes("private video") ||
      !youtubeVideoId ||
      !thumbnailUrl
    );
  }

  function isUnavailablePodcastEpisode(item) {
    if (!item || item.mediaType !== "audio") return false;
    const title = String(item.title || item.rawTitle || item.mainTitle || "").trim().toLowerCase();
    const artworkUrl = item.artworkUrl || item.thumbnailUrl || item.thumbnail || item.image || "";
    const prototypeSource = `${item.audioUrl || ""} ${artworkUrl}`.toLowerCase();

    return (
      !title ||
      title === "untitled episode" ||
      !artworkUrl ||
      /\.\/assets\//.test(prototypeSource)
    );
  }

  function normalizedSourceUrl(value) {
    const rawUrl = String(value || "").trim();
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl, window.location.href);
      url.search = "";
      url.hash = "";
      return `${url.origin}${url.pathname}`.replace(/\/$/, "");
    } catch (error) {
      return rawUrl.replace(/[?#].*$/, "").replace(/\/$/, "");
    }
  }

  function canonicalYouTubeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      const host = url.hostname.replace(/^www\./, "");
      const videoId = host === "youtu.be" ? url.pathname.slice(1).split("/")[0] : url.searchParams.get("v");
      if (!videoId || !["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) return "";
      return `https://www.youtube.com/watch?v=${videoId}`;
    } catch (error) {
      return "";
    }
  }

  function mediaIdentityKey(item) {
    if (item.youtubeVideoId || item.youtubeId) return `youtube-id:${String(item.youtubeVideoId || item.youtubeId).trim()}`;

    const canonicalYoutube = canonicalYouTubeUrl(item.youtubeUrl || item.externalUrl || item.sourceUrl);
    if (canonicalYoutube) return `youtube-url:${canonicalYoutube}`;

    if (item.mediaType === "audio") {
      if (item.spotifyEpisodeId) return `spotify-id:${String(item.spotifyEpisodeId).trim()}`;
      if (item.rssGuid) return `rss-guid:${String(item.rssGuid).trim()}`;
      if (item.guid) return `guid:${String(item.guid).trim()}`;
      if (item.audioUrl || item.externalUrl || item.sourceUrl) {
        return `audio-url:${String(item.audioUrl || item.externalUrl || item.sourceUrl).trim()}`;
      }
    }

    return `title-date:${normalizedText(item.mainTitle || item.title)}:${normalizedText(item.date)}`;
  }

  function dedupeMediaItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = mediaIdentityKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function itemsForShelf(config) {
    if (config.mediaType === "audio" || config.mediaType === "audioShelf") return itemsForPodcastShelf(config);
    return itemsForVideoShelf(config);
  }

  function itemsForVideoShelf(config) {
    const playlistItems = dedupeMediaItems(
      sermons.filter((item) => item.playlistIds.includes(config.playlistId) && !isUnavailableYouTubeVideo(item))
    );
    const orderedItemIds = Array.isArray(config.itemIds) ? config.itemIds.map(String) : [];
    if (!orderedItemIds.length) return playlistItems;

    const itemById = new Map();
    playlistItems.forEach((item) => {
      [item.id, item.youtubeVideoId, item.youtubeId].filter(Boolean).forEach((id) => itemById.set(String(id), item));
    });
    const orderedItems = orderedItemIds.map((id) => itemById.get(id)).filter(Boolean);
    return orderedItems.length ? dedupeMediaItems(orderedItems) : playlistItems;
  }

  function itemsForPodcastShelf(config, excludedItem) {
    const inlineItems = Array.isArray(config.items)
      ? config.items
          .map((entry) => (typeof entry === "string" ? findMediaItemById(entry, "audio") : entry))
          .filter(Boolean)
      : [];
    const configItemIds = Array.isArray(config.itemIds) ? config.itemIds.map(String) : [];
    const excludedKey = excludedItem ? mediaIdentityKey(excludedItem) : "";
    const configSourceUrl = normalizedSourceUrl(config.sourceUrl);
    const configSpotifyShowId = config.spotifyShowId || "";
    const sourceItems = audioEpisodes.filter((item) => {
      const itemPodcastId = item.podcastId || item.feedId || "";
      const itemSourceUrl = normalizedSourceUrl(item.sourceUrl || item.feedUrl || item.showUrl || item.podcastSourceUrl);
      if (configItemIds.includes(String(item.id))) return true;
      if (configItemIds.includes(mediaLookupId(item))) return true;
      if (itemPodcastId && itemPodcastId === config.id) return true;
      if (itemPodcastId && itemPodcastId === config.podcastId) return true;
      if (item.podcastName && item.podcastName === config.title) return true;
      if (configSourceUrl && itemSourceUrl && itemSourceUrl === configSourceUrl) return true;
      if (configSpotifyShowId && item.spotifyShowId === configSpotifyShowId) return true;
      return false;
    });

    return dedupeMediaItems([...inlineItems, ...sourceItems]).filter((item) => {
      if (!excludedItem) return true;
      return item.id !== excludedItem.id && mediaIdentityKey(item) !== excludedKey;
    });
  }

  function podcastPublishedTimestamp(item) {
    const timestamp = Date.parse(item.publishedAt || item.date || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function buildPodcastShelves() {
    return podcastShelfConfigs
      .map((config) => {
        const items = itemsForPodcastShelf(config).sort((a, b) => podcastPublishedTimestamp(b) - podcastPublishedTimestamp(a));

        return {
          ...config,
          subtitle: "",
          mediaType: "audio",
          actions: podcastActionsFor(config),
          items,
        };
      })
      .filter((feed) => feed.items.length > 0);
  }

  function playlistTitleMatches(value, expectedTitle = HIGHLIGHTED_PLAYLIST_TITLE) {
    return String(value || "").trim().toLocaleLowerCase() === String(expectedTitle || "").trim().toLocaleLowerCase();
  }

  function highlightedPlaylistShelf() {
    return allVideoPlaylists.find((playlist) => playlistTitleMatches(playlist.title)) || null;
  }

  function buildAllVideoPlaylists() {
    return shelfConfigs
      .filter((config) => config.mediaType === "video")
      .map((config) => ({
        ...config,
        playlistTitle: playlists[config.playlistId] || config.title,
        items: itemsForVideoShelf(config),
      }))
      .filter((playlist) => playlist.items.length > 0);
  }

  function collectionFilterById(filterId) {
    const filter = playlistFilters.find((candidate) => candidate.id === filterId);
    return filter || null;
  }

  function visiblePlaylistFilters() {
    return playlistFilters.filter((filter) => !filter.hidden && filter.id !== "worship-moments");
  }

  function isVisiblePlaylistFilter(filterId) {
    return visiblePlaylistFilters().some((filter) => filter.id === filterId);
  }

  function collectionGroupId(filterId, value) {
    return `collection-${filterId}-${normalizedText(value)}`;
  }

  function collectionGroupCacheKey(collectionType) {
    return collectionType ? `${collectionType}Groups` : "";
  }

  function cachedCollectionGroupSource(collectionType) {
    const cacheData = window.AnchorFaithMediaCache?.data || {};
    const cacheKey = collectionGroupCacheKey(collectionType);
    return Array.isArray(cacheData[cacheKey]) ? cacheData[cacheKey] : [];
  }

  function compareCollectionGroupsByLabel(a, b) {
    return String(a?.optionLabel || a?.title || "").localeCompare(
      String(b?.optionLabel || b?.title || ""),
      undefined,
      { sensitivity: "base", numeric: true }
    );
  }

  function sortTopicSeriesCollectionGroups(groups = [], collectionType = "") {
    if (!["topic", "series"].includes(collectionType)) return groups;
    return [...groups].sort(compareCollectionGroupsByLabel);
  }

  function displayLabelForCollectionGroup(group, collectionType = "") {
    const label = group.optionLabel || group.title || group.rawCollectionTitle || "";
    if (collectionType !== "speaker") return label;
    return String(label).replace(/^Speaker\s*\|\s*/i, "").trim();
  }
  
  function itemsForCachedCollectionGroup(group) {
    const inlineItems = Array.isArray(group.items)
      ? group.items.filter((item) => item && typeof item === "object")
      : [];
    const itemIds = [
      ...(Array.isArray(group.itemIds) ? group.itemIds : []),
      ...(Array.isArray(group.items)
        ? group.items.filter((item) => typeof item === "string" || typeof item === "number")
        : []),
    ];
    const resolvedItems = itemIds
      .map((id) => findMediaItemById(id, "video"))
      .filter(Boolean);

    return dedupeMediaItems([...inlineItems, ...resolvedItems])
      .map((item) => ({ ...item, mediaType: "video" }))
      .filter((item) => !isUnavailableYouTubeVideo(item));
  }

  function collectionGroupsForType(collectionType) {
    const groups = cachedCollectionGroupSource(collectionType)
      .map((group) => {
        const label = displayLabelForCollectionGroup(group, collectionType);
        const id = group.id || collectionGroupId(collectionType, label);
        const items = itemsForCachedCollectionGroup(group);

        return {
          ...group,
          id,
          collectionType,
          optionLabel: label,
          title: label,
          subtitle: "",
          mediaType: "video",
          items,
        };
      })
      .filter((group) => group.items.length > 0);

    return sortTopicSeriesCollectionGroups(groups, collectionType);
  }

  function moveCollectionGroupToFront(groups = [], groupId = "") {
    if (!groupId) return groups;
    const selectedGroup = groups.find((group) => group.id === groupId);
    if (!selectedGroup) return groups;
    return [selectedGroup, ...groups.filter((group) => group.id !== groupId)];
  }

  function selectedCollectionGroups() {
    if (!selectedPlaylistFilterId || !isVisiblePlaylistFilter(selectedPlaylistFilterId)) return [];
    return collectionGroupsFor(selectedPlaylistFilterId);
  }

  function visibleSelectedCollectionGroups() {
    return moveCollectionGroupToFront(selectedCollectionGroups(), selectedCollectionGroupId);
  }
  
  function podcastActionsFor(config) {
    const actions = [];
    if (config.spotifyUrl) {
      actions.push({
        label: appConfig.podcastActions?.spotifyLabel || "Spotify",
        href: config.spotifyUrl,
        kind: "spotify",
      });
    }
    if (config.applePodcastUrl) {
      actions.push({
        label: appConfig.podcastActions?.appleLabel || "Apple Podcasts",
        href: config.applePodcastUrl,
        kind: "apple",
      });
    }
    return actions;
  }

  function shelfByPlaylistId(playlistId, overrides = {}) {
    const shelf = allVideoPlaylists.find((playlist) => playlist.playlistId === playlistId);
    return shelf
      ? {
          ...shelf,
          ...overrides,
          actions: overrides.actions || shelf.actions || [],
        }
      : null;
  }

  function renderDataState(source, title = "") {
    const state = dataState[source] || { status: "empty", message: "No data available.", errors: [] };
    const shouldShowErrors = Boolean(runtimeConfig.showDataErrors || prototypeData.showDataErrors);
    const heading =
      title ||
      (source === "youtube"
        ? "YouTube data"
        : source === "podcasts"
          ? "Podcast data"
          : "Data source");
    const details = shouldShowErrors && state.errors?.length
      ? `<ul class="af-data-state__list">${state.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`
      : "";

    return `
      <section class="af-data-state" data-source="${source}" data-state="${state.status}">
        <p class="af-kicker">${state.status}</p>
        <h2 class="af-data-state__title">${heading}</h2>
        <p class="af-data-state__message">${escapeHtml(state.message)}</p>
        ${details}
      </section>
    `;
  }

  function renderCacheStatus() {
    if (!cacheState.hasCache || !cacheState.isRefreshing) return "";
    return `<p class="af-cache-status" aria-live="polite">Updating...</p>`;
  }

  function renderGracefulEmptyState() {
    dom.hero.classList.add("af-hero--state");
    dom.hero.innerHTML = `
      <div class="af-hero__content">
        <p class="af-kicker">Anchor Faith Streaming</p>
        <h1 class="af-hero__title">Anchor Faith Streaming</h1>
        <p class="af-hero__description">Media shelves will appear here as soon as cached content is available.</p>
      </div>
    `;
    dom.primaryShelves.innerHTML = "";
    dom.extraShelves.innerHTML = "";
    dom.extraShelves.setAttribute("aria-hidden", "true");
    dom.podcasts.hidden = true;
    dom.podcasts.innerHTML = "";
    syncViewMoreButton();
  }

  function syncViewMoreButton() {
    const viewMoreWrap = dom.viewMoreButton.closest(".af-view-more");
    if (viewMoreWrap) {
      viewMoreWrap.classList.remove("is-visible");
      viewMoreWrap.hidden = true;
    }
    dom.viewMoreButton.hidden = false;
    dom.viewMoreButton.disabled = false;
    dom.viewMoreButton.setAttribute("aria-expanded", "false");
    dom.viewMoreButton.textContent = "View More";
  }

  function featuredHeroItems() {
    return sermons
      .filter((item) => !isUnavailableYouTubeVideo(item))
      .slice(0, 3);
  }

  function startHeroCarousel() {
    window.clearInterval(heroCarouselTimer);
    const heroItems = featuredHeroItems();
    if (heroItems.length <= 1) return;
    heroCarouselTimer = window.setInterval(() => {
      heroSlideIndex = (heroSlideIndex + 1) % heroItems.length;
      renderHero();
    }, HERO_CAROUSEL_INTERVAL_MS);
  }

  function setHeroSlide(index) {
    const heroItems = featuredHeroItems();
    if (!heroItems.length) return;
    heroSlideIndex = Math.max(0, Math.min(Number(index) || 0, heroItems.length - 1));
    renderHero();
    startHeroCarousel();
  }

  function moveHeroSlideBy(offset = 0) {
    const heroItems = featuredHeroItems();
    if (heroItems.length <= 1) return;
    const nextIndex = (heroSlideIndex + offset + heroItems.length) % heroItems.length;
    setHeroSlide(nextIndex);
  }

  function beginHeroSwipe(event) {
    if (!isMobileShelfEnvironment() || event.touches.length !== 1) return;
    if (event.target.closest("a, button")) return;

    const touch = event.touches[0];
    heroTouchStartX = touch.clientX;
    heroTouchStartY = touch.clientY;
    heroTouchStarted = true;
  }

  function endHeroSwipe(event) {
    if (!heroTouchStarted || !isMobileShelfEnvironment()) return;
    heroTouchStarted = false;

    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - heroTouchStartX;
    const deltaY = touch.clientY - heroTouchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < 40 || absX <= absY) return;
    moveHeroSlideBy(deltaX < 0 ? 1 : -1);
  }

  function cancelHeroSwipe() {
    heroTouchStarted = false;
  }


  function highQualityYouTubeImage(item) {
    const videoId =
      item?.youtubeVideoId ||
      item?.youtubeId ||
      extractYouTubeVideoId(item?.externalUrl || item?.youtubeUrl || item?.embedUrl || "");
    if (!videoId) return "";
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  function renderHero() {
    const heroItems = featuredHeroItems();
    if (!heroItems.length) {
      dom.hero.classList.add("af-hero--state");
      dom.hero.innerHTML = `
        <div class="af-hero__content">
          <p class="af-kicker">Anchor Faith Streaming</p>
          <h1 class="af-hero__title">Anchor Faith Streaming</h1>
          <p class="af-hero__description">Cached media is not available yet. Run the cache generator before publishing this page.</p>
        </div>
      `;
      return;
    }

    if (heroSlideIndex >= heroItems.length) heroSlideIndex = 0;
    const featured = heroItems[heroSlideIndex];
    dom.hero.classList.remove("af-hero--state");
    const heroImage = highQualityYouTubeImage(featured) || featured.heroImage || featured.thumbnail;
    const heroPrevImage = previousHeroImage && previousHeroImage !== heroImage ? previousHeroImage : "";
    const introSurface = dom.hero.closest(".af-main");
    dom.hero.style.setProperty("--hero-image", `url("${heroImage}")`);
    dom.hero.style.setProperty("--hero-prev-image", heroPrevImage ? `url("${heroPrevImage}")` : "none");
    introSurface?.style.setProperty("--hero-image", `url("${heroImage}")`);
    introSurface?.style.setProperty("--hero-prev-image", heroPrevImage ? `url("${heroPrevImage}")` : "none");
    const heroMeta = [featured.minister, featured.date].filter(Boolean).join(" • ");
    dom.hero.innerHTML = `
      ${heroPrevImage ? `<div class="af-hero__bg af-hero__bg--previous" aria-hidden="true"></div>` : ""}
      <div class="af-hero__bg af-hero__bg--current" aria-hidden="true"></div>
      <div class="af-hero__content af-hero__content--carousel" data-cms-item-id="${featured.id}" data-hero-slide="${heroSlideIndex}">
        <div class="af-hero__slide-copy" aria-live="polite">
          <p class="af-kicker">Featured Sermon</p>
          <h1 class="af-hero__title" data-cms-field="main-title">${featured.mainTitle || featured.title}</h1>
          ${featured.subtitle ? `<p class="af-hero__subtitle" data-cms-field="subtitle">${featured.subtitle}</p>` : ""}
          ${heroMeta ? `<div class="af-hero__meta" data-cms-field="hero-meta">${heroMeta}</div>` : ""}
          <div class="af-hero__actions">
            <button class="af-button af-button--primary" type="button" data-media-id="${mediaLookupId(featured)}" data-media-type="${featured.mediaType}" data-open-media="${mediaLookupId(featured)}" data-modal-page-url="${featured.cmsUrl}" data-cms-url="${featured.cmsUrl}">
              ${iconPlay()} Watch
            </button>
          </div>
        </div>
      </div>
      <div class="af-hero__pagination" role="tablist" aria-label="Featured sermons">
        ${heroItems
          .map(
            (item, index) => `
              <button
                class="af-hero__dot ${index === heroSlideIndex ? "is-active" : ""}"
                type="button"
                role="tab"
                aria-selected="${index === heroSlideIndex}"
                aria-label="Show featured sermon ${index + 1}: ${escapeHtml(item.mainTitle || item.title)}"
                data-hero-index="${index}"
              ><span></span></button>
            `
          )
          .join("")}
      </div>
    `;
    previousHeroImage = heroImage;
  }

  function renderMediaCard(item) {
    const meta = itemMeta(item);
    const bodyMeta = item.mediaType === "audio"
      ? [item.date].filter(Boolean).join(" · ")
      : [meta[0], item.date].filter(Boolean).join(" · ");
    const ariaAction = item.mediaType === "audio" ? "Open audio episode" : "Open sermon";
    const lookupId = mediaLookupId(item);
    return `
      <button
        type="button"
        class="af-media-card"
        data-component="media-card-component"
        data-media-type="${item.mediaType}"
        data-media-id="${lookupId}"
        data-open-media="${lookupId}"
        data-cms-item-id="${item.id}"
        data-modal-page-url="${item.cmsUrl}"
        data-cms-url="${item.cmsUrl}"
        aria-label="${ariaAction}: ${item.mainTitle || item.title}"
      >
        <span class="af-media-card__frame">
          <img class="af-media-card__artwork" src="${item.thumbnail}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" data-cms-field="thumbnail" />
          <span class="af-media-card__shade"></span>
          <span class="af-media-card__play" aria-hidden="true">${iconPlay()}</span>
        </span>
        <span class="af-media-card__body">
          <span class="af-media-card__title">${item.mainTitle || item.title}</span>
          ${item.subtitle ? `<span class="af-media-card__subtitle">${item.subtitle}</span>` : ""}
          <span class="af-media-card__meta">${bodyMeta}</span>
        </span>
      </button>
    `;
  }

  function renderShelfActions(actions = []) {
    if (!actions.length) return "";
    return `
      <div class="af-shelf__actions">
        ${actions
          .map(
            (action) => `
              <a class="af-shelf__action" href="${action.href}" target="_blank" rel="noreferrer" data-action-kind="${action.kind || ""}">
                ${action.label}
              </a>
            `
          )
          .join("")}
      </div>
    `;
  }

  function isMobileShelfEnvironment() {
    return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_SHELF_QUERY).matches;
  }

  function isAudioShelf(config = {}) {
    return config.mediaType === "audio" || config.mediaType === "audioShelf";
  }

  function shelfInitialLimit(config = {}, options = {}) {
    if (Number.isFinite(options.itemLimit)) return options.itemLimit;
    if (options.renderAll) return Number.POSITIVE_INFINITY;

    const mobile = isMobileShelfEnvironment();
    if (isAudioShelf(config)) {
      return mobile ? SHELF_INITIAL_LIMITS.mobileAudio : SHELF_INITIAL_LIMITS.desktopAudio;
    }

    return mobile ? SHELF_INITIAL_LIMITS.mobileVideo : SHELF_INITIAL_LIMITS.desktopVideo;
  }

  function shelfAppendLimit(config = {}) {
    const mobile = isMobileShelfEnvironment();
    if (isAudioShelf(config)) {
      return mobile ? SHELF_APPEND_LIMITS.mobileAudio : SHELF_APPEND_LIMITS.desktopAudio;
    }

    return mobile ? SHELF_APPEND_LIMITS.mobileVideo : SHELF_APPEND_LIMITS.desktopVideo;
  }

  function renderShelf(config, options = {}) {
    const items = dedupeMediaItems(options.items || itemsForShelf(config));
    const minimumItems = options.minimumItems || 0;
    if (!items.length || items.length < minimumItems) return "";
    const initialLimit = shelfInitialLimit(config, options);
    const visibleItems = Number.isFinite(initialLimit) ? items.slice(0, initialLimit) : items;
    const shelfId = String(config.id);
    const appendLimit = shelfAppendLimit(config);
    renderedShelfItemsById.set(shelfId, items);

    return `
      <section
        class="af-shelf"
        data-component="shelf-component"
        data-shelf-id="${shelfId}"
        data-media-type="${config.mediaType}"
        data-playlist-id="${config.playlistId || ""}"
        data-total-items="${items.length}"
        data-rendered-items="${visibleItems.length}"
        data-render-batch="${appendLimit}"
        data-has-more="${visibleItems.length < items.length}"
        style="--shelf-delay:${options.delay || 0}ms"
      >
        ${
          config.title || config.subtitle || (config.actions || []).length
            ? `<div class="af-shelf__header">
                <div class="af-shelf__copy">
                  ${config.title ? `<h2 class="af-shelf__title" data-cms-field="shelf-title">${config.title}</h2>` : ""}
                  ${config.subtitle ? `<p class="af-shelf__subtitle" data-cms-field="shelf-subtitle">${config.subtitle}</p>` : ""}
                </div>
                ${renderShelfActions(config.actions || [])}
              </div>`
            : ""
        }
        <div class="af-shelf__rail" data-shelf-rail="${shelfId}">
          ${visibleItems.map(renderMediaCard).join("")}
        </div>
      </section>
    `;
  }

  function renderShelfStack(shelves, options = {}) {
    return shelves
      .map((shelf, index) =>
        renderShelf(
          {
            ...shelf,
            id: options.idSuffix ? `${shelf.id}-${options.idSuffix}` : shelf.id,
          },
          {
            delay: options.delayStep ? index * options.delayStep : 0,
            items: shelf.items,
            minimumItems: options.minimumItems || 0,
          }
        )
      )
      .join("");
  }


  function renderCollectionSecondaryOptions(activeFilter, collectionGroups) {
    if (!collectionGroups.length || isCollectionCollapsed) return "";
    return `<div class="af-playlist-filter__options-wrap" data-secondary-options>
          <div class="af-playlist-filter__options" role="group" aria-label="${escapeHtml(
            activeFilter?.label || "Collection"
          )} options">
            ${collectionGroups
              .map(
                (group, index) => `
                  <button
                    class="af-filter-button af-filter-button--secondary ${group.id === currentSelectedGroupId ? "is-active" : ""}"
                    type="button"
                    data-collection-option="${group.id}"
                    aria-pressed="${group.id === currentSelectedGroupId}"
                    style="--option-delay:${index * 36}ms"
                  >
                    ${escapeHtml(group.optionLabel || group.title)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>`;
  }

  function renderCollectionCollapseControl() {
    if (!currentCollectionType || isCollectionCollapsed) return "";
    return `<button
          class="af-playlist-filter__toggle af-playlist-filter__toggle--utility"
          type="button"
          data-collection-collapse
          aria-label="Collapse collection shelves"
          aria-expanded="${!isCollectionCollapsed}"
          aria-controls="extraShelves"
        >
          <span>Collapse</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>`;
  }

  function renderPlaylistFilters() {
    const filters = visiblePlaylistFilters();
    if (!filters.length) return "";
    const activeIndex = currentCollectionType ? Math.max(0, filters.findIndex((filter) => filter.id === currentCollectionType)) : -1;
    const collapseControl = renderCollectionCollapseControl();

    return `
      <section class="af-playlist-filter" data-component="playlist-filter-buttons" data-has-selection="${Boolean(
        currentCollectionType
      )}" data-is-collapsed="${isCollectionCollapsed}" style="--active-filter-index:${activeIndex}">
        <div class="af-playlist-filter__copy">
          <p class="af-kicker">Browse Playlists</p>
          <div class="af-playlist-filter__heading">
            <h2 class="af-playlist-filter__title">Choose a collection</h2>
          </div>
          ${renderCacheStatus()}
        </div>
        <div class="af-playlist-filter__control-row">
          <div class="af-playlist-filter__buttons" role="tablist" aria-label="Playlist filters">
            <span class="af-playlist-filter__hover-pill" aria-hidden="true"></span>
            <span class="af-playlist-filter__active-pill" aria-hidden="true"></span>
            ${filters
              .map(
                (filter) => `
                  <button
                    class="af-filter-button ${filter.id === currentCollectionType ? "is-active" : ""}"
                    type="button"
                    role="tab"
                    data-playlist-filter="${filter.id}"
                    aria-selected="${filter.id === currentCollectionType}"
                    aria-pressed="${filter.id === currentCollectionType}"
                  >
                    ${escapeHtml(filter.label)}
                  </button>
                `
              )
              .join("")}
          </div>
          ${collapseControl}
        </div>
      </section>
    `;
  }

  function renderShelves() {
    allVideoPlaylists = buildAllVideoPlaylists();
    podcastShelves = buildPodcastShelves();
    const rawLatestShelf = allVideoPlaylists.find((playlist) => playlist.isLatestShelf) || null;
    const latestShelf = rawLatestShelf
      ? {
          ...rawLatestShelf,
          title: "Recent Sermons",
          subtitle: "",
          actions: rawLatestShelf.actions?.length ? rawLatestShelf.actions : appConfig.youtubeShelfActions || [],
        }
      : null;
    const rawHighlightedShelf = highlightedPlaylistShelf();
    const highlightedShelf = rawHighlightedShelf
      ? { ...rawHighlightedShelf, title: HIGHLIGHTED_PLAYLIST_TITLE, subtitle: "" }
      : null;
    const visiblePodcastShelves = podcastShelves.filter((feed) => feed.items.length > 0);

    dom.primaryShelves.innerHTML = [
      latestShelf ? renderShelfStack([latestShelf], { delayStep: 70 }) : "",
      highlightedShelf ? renderShelfStack([highlightedShelf], { delayStep: 70 }) : "",
      dataState.youtube.status !== "loaded" ? renderDataState("youtube", "YouTube playlists") : "",
    ].join("");
    renderCollectionShelves();
    const podcastStateMarkup =
      visiblePodcastShelves.length === 0 && dataState.podcasts.status !== "loaded"
        ? renderDataState("podcasts", "Podcast feeds")
        : "";
    dom.podcasts.hidden = visiblePodcastShelves.length === 0 && !podcastStateMarkup;
    dom.podcasts.innerHTML =
      visiblePodcastShelves.length || podcastStateMarkup
        ? `
          <div class="af-audio-region__header">
            <p class="af-kicker">Audio Only</p>
            <h2 class="af-audio-region__title">Podcasts</h2>
            ${renderCacheStatus()}
          </div>
          ${podcastStateMarkup}
          ${renderShelfStack(visiblePodcastShelves, { delayStep: 70 })}
        `
        : "";

    syncViewMoreButton();
  }

  function collectionFilterElement() {
    return (
      dom.extraShelves?.querySelector?.("[data-component='playlist-filter-buttons']") ||
      dom.primaryShelves?.querySelector?.("[data-component='playlist-filter-buttons']")
    );
  }

  function updatePlaylistFilterButtons() {
    const filterSection = collectionFilterElement();
    if (filterSection) {
      filterSection.dataset.hasSelection = String(Boolean(currentCollectionType));
      filterSection.dataset.isCollapsed = String(isCollectionCollapsed);
    }

    filterSection?.querySelectorAll("[data-playlist-filter]").forEach((button) => {
      const isActive = button.dataset.playlistFilter === currentCollectionType;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    filterSection?.querySelectorAll("[data-collection-option]").forEach((button) => {
      const isActive = button.dataset.collectionOption === currentSelectedGroupId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setCollectionHoverPill(button) {
    const control = button?.closest(".af-playlist-filter__buttons");
    const filterSection = button?.closest("[data-component='playlist-filter-buttons']");
    if (!control || !filterSection) return;

    const buttons = [...control.querySelectorAll("[data-playlist-filter]")];
    const index = buttons.indexOf(button);
    if (index < 0) return;

    filterSection.style.setProperty("--hover-filter-index", index);
    filterSection.classList.add("is-hovering-filter");
  }

  function clearCollectionHoverPill(control) {
    const filterSection = control?.closest?.("[data-component='playlist-filter-buttons']");
    if (!filterSection) return;
    filterSection.classList.remove("is-hovering-filter");
  }

  function renderCollectionShelves(options = {}) {
    const preservedWindowScrollY = window.scrollY;
    if (currentCollectionType && !isVisiblePlaylistFilter(currentCollectionType)) {
      currentCollectionType = "";
      currentSelectedGroupId = "";
    }
    const activeGroups = currentCollectionType ? collectionGroupsForType(currentCollectionType) : [];
    if (currentSelectedGroupId && !activeGroups.some((group) => group.id === currentSelectedGroupId)) {
      currentSelectedGroupId = "";
    }
    const visibleCollectionGroups = moveCollectionGroupToFront(activeGroups, currentSelectedGroupId);

    if (!dom.extraShelves.querySelector("[data-component='playlist-filter-buttons']")) {
      dom.extraShelves.innerHTML = `${renderPlaylistFilters()}<div class="af-collection-shelves" data-collection-shelves></div>`;
    }

    const filterSection = collectionFilterElement();
    if (filterSection) {
      const filters = visiblePlaylistFilters();
      const activeFilter = collectionFilterById(currentCollectionType);
      const activeIndex = currentCollectionType ? Math.max(0, filters.findIndex((filter) => filter.id === currentCollectionType)) : -1;
      filterSection.dataset.hasSelection = String(Boolean(currentCollectionType));
      filterSection.dataset.isCollapsed = String(isCollectionCollapsed);
      filterSection.style.setProperty("--active-filter-index", activeIndex);
      filterSection.querySelectorAll("[data-playlist-filter]").forEach((button) => {
        const isActive = button.dataset.playlistFilter === currentCollectionType;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
        button.setAttribute("aria-pressed", String(isActive));
      });

      const controlRow = filterSection.querySelector(".af-playlist-filter__control-row");
      const oldCollapse = filterSection.querySelector("[data-collection-collapse]");
      if (oldCollapse) oldCollapse.remove();
      const collapseMarkup = renderCollectionCollapseControl();
      if (controlRow && collapseMarkup) controlRow.insertAdjacentHTML("beforeend", collapseMarkup);

      const oldOptions = filterSection.querySelector("[data-secondary-options]");
      const oldOptionsScroll = oldOptions?.querySelector(".af-playlist-filter__options");
      const optionsScrollLeft = options.optionsScrollLeft ?? oldOptionsScroll?.scrollLeft ?? 0;
      const secondaryMarkup = renderCollectionSecondaryOptions(activeFilter, activeGroups);
      if (oldOptions && secondaryMarkup && !options.preserveOptions) {
        oldOptions.outerHTML = secondaryMarkup;
      } else if (oldOptions && !secondaryMarkup) {
        oldOptions.remove();
      } else if (!oldOptions && secondaryMarkup) {
        filterSection.insertAdjacentHTML("beforeend", secondaryMarkup);
      }

      filterSection.querySelectorAll("[data-collection-option]").forEach((button) => {
        const isActive = button.dataset.collectionOption === currentSelectedGroupId;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

      const nextOptionsScroll = filterSection.querySelector("[data-secondary-options] .af-playlist-filter__options");
      if (nextOptionsScroll && optionsScrollLeft) nextOptionsScroll.scrollLeft = optionsScrollLeft;
    }

    let collectionShelfContainer = dom.extraShelves.querySelector("[data-collection-shelves]");
    if (!collectionShelfContainer) {
      dom.extraShelves.insertAdjacentHTML("beforeend", '<div class="af-collection-shelves" data-collection-shelves></div>');
      collectionShelfContainer = dom.extraShelves.querySelector("[data-collection-shelves]");
    }
    collectionShelfContainer.innerHTML = renderShelfStack(visibleCollectionGroups, { delayStep: 70 });
    dom.extraShelves.classList.toggle("is-collapsed", Boolean(isCollectionCollapsed && currentCollectionType));
    dom.extraShelves.classList.toggle("is-expanded", Boolean(visibleCollectionGroups.length && !isCollectionCollapsed));
    dom.extraShelves.setAttribute("aria-hidden", "false");
    attachShelfBehavior(collectionShelfContainer || dom.extraShelves);
    observeShelves(collectionShelfContainer || dom.extraShelves);
    syncViewMoreButton();
    updateCollectionStickyState();
    window.requestAnimationFrame(() => restoreWindowScrollInstant(preservedWindowScrollY));
  }

  function currentRenderedShelfConfigs() {
    allVideoPlaylists = buildAllVideoPlaylists();
    podcastShelves = buildPodcastShelves();

    const rawLatestShelf = allVideoPlaylists.find((playlist) => playlist.isLatestShelf) || null;
    const latestShelf = rawLatestShelf
      ? {
          ...rawLatestShelf,
          title: "Recent Sermons",
          subtitle: "",
          actions: rawLatestShelf.actions?.length ? rawLatestShelf.actions : appConfig.youtubeShelfActions || [],
        }
      : null;
    const rawHighlightedShelf = highlightedPlaylistShelf();
    const highlightedShelf = rawHighlightedShelf
      ? { ...rawHighlightedShelf, title: HIGHLIGHTED_PLAYLIST_TITLE, subtitle: "" }
      : null;
    const visibleCollectionGroups = moveCollectionGroupToFront(collectionGroupsForType(currentCollectionType), currentSelectedGroupId);
    const visiblePodcastShelves = podcastShelves.filter((feed) => feed.items.length > 0);
    const shelfMap = new Map();

    [latestShelf, highlightedShelf, ...visibleCollectionGroups, ...visiblePodcastShelves]
      .filter(Boolean)
      .forEach((shelf) => shelfMap.set(String(shelf.id), shelf));

    return shelfMap;
  }

  function syncCacheStatusVisibility() {
    document.querySelectorAll(".af-cache-status").forEach((element) => {
      if (!cacheState.isRefreshing) element.remove();
    });
  }

  function patchShelfElement(shelfElement, config) {
    const rail = shelfElement.querySelector(".af-shelf__rail");
    if (!rail || !config) return false;

    const items = dedupeMediaItems(config.items || itemsForShelf(config));
    const existingKeys = new Set(
      [...rail.querySelectorAll("[data-media-id]")].map((card) =>
        `${card.dataset.mediaType}:${card.dataset.mediaId}`
      )
    );
    let changed = false;

    items.forEach((item) => {
      const key = `${item.mediaType}:${mediaLookupId(item)}`;
      if (existingKeys.has(key)) return;
      rail.insertAdjacentHTML("beforeend", renderMediaCard(item));
      existingKeys.add(key);
      changed = true;
    });

    shelfElement.dataset.totalItems = String(items.length);
    return changed;
  }

  function ensurePodcastShelvesRenderedAfterRefresh() {
    const visiblePodcastShelves = podcastShelves.filter((feed) => feed.items.length > 0);
    if (!visiblePodcastShelves.length || dom.podcasts.querySelector(".af-shelf")) return false;

    dom.podcasts.hidden = false;
    dom.podcasts.innerHTML = `
      <div class="af-audio-region__header">
        <p class="af-kicker">Audio Only</p>
        <h2 class="af-audio-region__title">Podcasts</h2>
        ${renderCacheStatus()}
      </div>
      ${renderShelfStack(visiblePodcastShelves, { delayStep: 70 })}
    `;
    attachShelfBehavior(dom.podcasts);
    observeShelves(dom.podcasts);
    return true;
  }

  function patchRenderedShelvesAfterDataRefresh(options = {}) {
    const scrollY = options.scrollY ?? window.scrollY;
    const renderedShelves = document.querySelectorAll(".af-shelf[data-shelf-id]");

    if (!renderedShelves.length && hasRenderableMedia()) {
      renderCurrentExperience({ preserveScroll: true, scrollY });
      return;
    }

    captureShelfScrollPositions();
    const shelfMap = currentRenderedShelfConfigs();
    let patchedAnyShelf = false;
    const renderedPodcastShelves = ensurePodcastShelvesRenderedAfterRefresh();

    renderedShelves.forEach((shelfElement) => {
      const shelfId = String(shelfElement.dataset.shelfId || "");
      const baseShelfId = shelfId.replace(/-modal-.+$/, "");
      const config = shelfMap.get(shelfId) || shelfMap.get(baseShelfId);
      if (patchShelfElement(shelfElement, config)) patchedAnyShelf = true;
    });

    syncCacheStatusVisibility();
    attachShelfBehavior();
    revealShelvesInViewport();

    if (patchedAnyShelf || renderedPodcastShelves) {
      document.querySelectorAll(".af-shelf__rail").forEach((rail) => {
        const shelfId = rail.dataset.shelfRail;
        if (shelfId && shelfPositions.has(shelfId)) rail.scrollLeft = shelfPositions.get(shelfId);
      });
    }

    if (!dom.modal.classList.contains("is-open")) {
      window.requestAnimationFrame(() => restoreWindowScrollInstant(scrollY));
    }
  }

  function patchRenderedShelvesWhenIdle(options = {}) {
    window.clearTimeout(deferredRefreshPatchTimer);
    const idleDelay = Date.now() - lastShelfInteractionAt < 520 ? 560 : 0;
    deferredRefreshPatchTimer = window.setTimeout(() => {
      patchRenderedShelvesAfterDataRefresh(options);
    }, idleDelay);
  }

  function selectPlaylistFilter(filterId) {
    if (!filterId || !isVisiblePlaylistFilter(filterId)) return;
    if (filterId === currentCollectionType) {
      if (isCollectionCollapsed) {
        isCollectionCollapsed = false;
        renderCollectionShelves();
      }
      return;
    }
    currentCollectionType = filterId;
    currentSelectedGroupId = "";
    isCollectionCollapsed = false;
    if (!allVideoPlaylists.length) allVideoPlaylists = buildAllVideoPlaylists();
    updatePlaylistFilterButtons();
    renderCollectionShelves();
  }

  function toggleCollectionCollapse() {
    currentCollectionType = "";
    currentSelectedGroupId = "";
    isCollectionCollapsed = false;
    renderCollectionShelves();
  }

  function reorderCollectionGroup(groupId) {
    if (!groupId) return;
    const optionsScroll = collectionFilterElement()?.querySelector("[data-secondary-options] .af-playlist-filter__options");
    const optionsScrollLeft = optionsScroll?.scrollLeft || 0;
    currentSelectedGroupId = groupId;
    renderCollectionShelves({ preserveOptions: true, optionsScrollLeft });
    window.requestAnimationFrame(() => {
      const selectedShelf = [...dom.extraShelves.querySelectorAll("[data-shelf-id]")]
        .find((shelf) => shelf.dataset.shelfId === groupId);
      const filterSection = collectionFilterElement();
      if (!selectedShelf || !filterSection) return;

      const offset = Number.parseFloat(getComputedStyle(filterSection).getPropertyValue("--sticky-header-offset")) || 80;
      const targetTop = selectedShelf.getBoundingClientRect().top + window.scrollY - offset - filterSection.offsetHeight - 16;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });
  }

  function appendShelfItemsIfNeeded(rail, options = {}) {
    const shelf = rail?.closest?.(".af-shelf[data-shelf-id]");
    if (!rail || !shelf || shelf.dataset.hasMore !== "true") return false;
    const shelfId = String(shelf.dataset.shelfId || rail.dataset.shelfRail || "");
    const allItems = renderedShelfItemsById.get(shelfId) || [];
    if (!allItems.length) return false;

    const renderedCount = Number(shelf.dataset.renderedItems || rail.querySelectorAll("[data-media-id]").length || 0);
    if (renderedCount >= allItems.length) {
      shelf.dataset.hasMore = "false";
      return false;
    }

    const distanceFromEnd = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    const shouldAppend = options.force || distanceFromEnd < Math.max(rail.clientWidth * 0.85, 360);
    if (!shouldAppend) return false;

    const batchSize = Math.max(1, Number(shelf.dataset.renderBatch || 8));
    const nextItems = allItems.slice(renderedCount, renderedCount + batchSize);
    if (!nextItems.length) {
      shelf.dataset.hasMore = "false";
      return false;
    }

    rail.insertAdjacentHTML("beforeend", nextItems.map(renderMediaCard).join(""));
    const nextRenderedCount = renderedCount + nextItems.length;
    shelf.dataset.renderedItems = String(nextRenderedCount);
    shelf.dataset.hasMore = String(nextRenderedCount < allItems.length);
    return true;
  }

  function attachShelfBehavior(root = document) {
    root.querySelectorAll(".af-shelf__rail").forEach((rail) => {
      const shelfId = rail.dataset.shelfRail;
      if (rail.dataset.shelfBound === "true") return;
      rail.dataset.shelfBound = "true";
      if (shelfPositions.has(shelfId)) {
        rail.scrollLeft = shelfPositions.get(shelfId);
      }

      let isDown = false;
      let startX = 0;
      let startScroll = 0;
      let moved = 0;
      let scrollStorageFrame = 0;
      let appendFrame = 0;

      rail.addEventListener("scroll", () => {
        lastShelfInteractionAt = Date.now();
        shelfPositions.set(shelfId, rail.scrollLeft);
        if (scrollStorageFrame) return;
        scrollStorageFrame = window.requestAnimationFrame(() => {
          scrollStorageFrame = 0;
          sessionStorage.setItem("afShelfPositions", JSON.stringify([...shelfPositions]));
        });
        if (!appendFrame) {
          appendFrame = window.requestAnimationFrame(() => {
            appendFrame = 0;
            appendShelfItemsIfNeeded(rail);
          });
        }
      }, { passive: true });

      rail.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse") return;

        // IMPORTANT: do not capture pointer events that begin on a card or control.
        // Capturing from the rail was causing shelf-card clicks to target the rail
        // instead of the MediaCard, so the centralized modal handler never saw them.
        if (event.target.closest("[data-media-id], a, button")) return;

        isDown = true;
        lastShelfInteractionAt = Date.now();
        moved = 0;
        startX = event.clientX;
        startScroll = rail.scrollLeft;
        rail.classList.add("is-dragging");
        rail.setPointerCapture(event.pointerId);
      });

      rail.addEventListener("pointermove", (event) => {
        if (!isDown) return;
        lastShelfInteractionAt = Date.now();
        const delta = event.clientX - startX;
        moved = Math.max(moved, Math.abs(delta));
        rail.scrollLeft = startScroll - delta;
        if (moved > 4) suppressClick = true;
      }, { passive: true });

      rail.addEventListener("pointerup", () => {
        isDown = false;
        rail.classList.remove("is-dragging");
        window.setTimeout(() => {
          suppressClick = false;
        }, 80);
      });

      rail.addEventListener("pointerleave", () => {
        isDown = false;
        rail.classList.remove("is-dragging");
      });

      rail.addEventListener("pointercancel", () => {
        isDown = false;
        rail.classList.remove("is-dragging");
      });
    });
  }

  function observeShelves(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.02, rootMargin: "0px 0px 12% 0px" }
    );

    scope.querySelectorAll(".af-shelf").forEach((shelf) => observer.observe(shelf));
    revealShelvesInViewport(scope);
  }

  function revealShelvesInViewport(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    scope.querySelectorAll(".af-shelf").forEach((shelf) => {
      if (shelf.getBoundingClientRect().top < window.innerHeight * 1.08) {
        shelf.classList.add("is-visible");
      }
    });
  }

  function restoreWindowScrollInstant(scrollY) {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlScrollBehavior = html.style.scrollBehavior;
    const previousBodyScrollBehavior = body.style.scrollBehavior;

    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    window.scrollTo(0, scrollY);

    window.requestAnimationFrame(() => {
      html.style.scrollBehavior = previousHtmlScrollBehavior;
      body.style.scrollBehavior = previousBodyScrollBehavior;
    });
  }

  function relatedItemsFor(item) {
    const itemKey = mediaIdentityKey(item);
    const candidates = allMedia
      .filter(
        (candidate) =>
          candidate.id !== item.id && candidate.mediaType === item.mediaType && mediaIdentityKey(candidate) !== itemKey
      )
      .filter((candidate) => candidate.mediaType !== "video" || !isUnavailableYouTubeVideo(candidate))
      .map((candidate) => {
        const overlap = candidate.playlistIds.filter((id) => item.playlistIds.includes(id)).length;
        return { candidate, overlap };
      })
      .filter(({ overlap }) => overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || allMedia.indexOf(a.candidate) - allMedia.indexOf(b.candidate))
      .map(({ candidate }) => candidate);

    return dedupeMediaItems(candidates);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderModalDescription(item) {
    const summaryDescription = item.summaryDescription || item.description || "";
    const fullDescription = item.fullDescription || summaryDescription;
    const hasMore = Boolean(item.hasExpandableDescription && fullDescription !== summaryDescription);

    if (!summaryDescription) return "";

    return `
      <div class="af-modal__description" data-description-block data-description-expanded="false" data-cms-field="description">
        <div class="af-modal__description-window" data-description-window>
          <p class="af-modal__description-text" data-description-summary>${escapeHtml(summaryDescription)}</p>
          ${
            hasMore
              ? `<p class="af-modal__description-text" data-description-full hidden>${escapeHtml(fullDescription)}</p>`
              : ""
          }
        </div>
        ${
          hasMore
            ? `<button class="af-modal__description-toggle" type="button" data-description-toggle aria-expanded="false">
                Read more
              </button>`
            : ""
        }
      </div>
    `;
  }

  function modalActions(item, mode) {
    const isAudio = item.mediaType === "audio";
    const playMode = isAudio ? "listen" : "watch";
    const primaryLabel = isAudio ? "Listen Now" : "Watch Now";
    const watchButton =
      !isAudio && item.embedUrl
        ? `<button class="af-button af-button--primary" type="button" data-play-inside="${mediaLookupId(item)}" data-media-type="${item.mediaType}" data-play-mode="${playMode}">
             ${iconPlay()} ${primaryLabel}
           </button>`
        : "";
    const externalButtons = [];

    if (isAudio && item.spotifyEpisodeUrl) {
      externalButtons.push(`
        <a class="af-button af-button--secondary" href="${item.spotifyEpisodeUrl}" target="_blank" rel="noreferrer">
          ${iconExternal()} Open on Spotify
        </a>
      `);
    } else if (isAudio && item.externalUrl) {
      externalButtons.push(`
        <a class="af-button af-button--secondary" href="${item.externalUrl}" target="_blank" rel="noreferrer">
          ${iconExternal()} Open Episode
        </a>
      `);
    } else if (!isAudio && item.externalUrl) {
      externalButtons.push(`
        <a class="af-button af-button--secondary" href="${item.externalUrl}" target="_blank" rel="noreferrer">
          ${iconExternal()} ${item.externalActionLabel || "Play on YouTube"}
        </a>
      `);
    }

    if (isAudio && item.applePodcastUrl) {
      externalButtons.push(`
        <a class="af-button af-button--secondary" href="${item.applePodcastUrl}" target="_blank" rel="noreferrer">
          ${iconExternal()} Open on Apple Podcasts
        </a>
      `);
    }

    return `${watchButton}${externalButtons.join("")}`;
  }

  function embeddedPlayerUrl(item, options = {}) {
    if (item.mediaType === "video") {
      return youtubeEmbedUrl(item.youtubeVideoId || item.youtubeId || item.embedUrl || item.externalUrl, {
        autoplay: options.autoplay,
      });
    }

    return spotifyEpisodeEmbedUrl(item.spotifyEpisodeId || item.spotifyEpisodeUrl || item.spotifyUrl || item.embedUrl);
  }

  function renderCustomAudioPlayer(item) {
    if (!item.audioUrl) return "";
    const title = item.mainTitle || item.title;
    const podcastName = item.podcastName || item.host || "Anchor Faith Podcast";

    return `
      <div class="af-custom-audio" data-custom-audio-player>
        <audio data-custom-audio preload="metadata" src="${escapeHtml(item.audioUrl)}"></audio>
        <img class="af-custom-audio__artwork" src="${escapeHtml(item.artworkUrl || item.thumbnail)}" alt="" loading="lazy" />
        <div class="af-custom-audio__content">
          <p class="af-custom-audio__kicker">${escapeHtml(podcastName)}</p>
          <h3 class="af-custom-audio__title">${escapeHtml(title)}</h3>
          <div class="af-custom-audio__controls">
            <button class="af-custom-audio__button" type="button" data-audio-toggle aria-label="Play episode">
              <span data-audio-play-icon>${iconPlay()}</span>
              <span data-audio-pause-icon hidden>${iconPause()}</span>
            </button>
            <div class="af-custom-audio__timeline">
              <input class="af-custom-audio__seek" type="range" min="0" max="100" value="0" step="0.1" data-audio-seek aria-label="Episode progress" />
              <div class="af-custom-audio__time">
                <span data-audio-current>0:00</span>
                <span data-audio-duration>${escapeHtml(item.duration || "0:00")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function modalVisual(item, mode = "details") {
    const title = item.mainTitle || item.title;

    if (item.mediaType === "audio") {
      const playerSrc = embeddedPlayerUrl(item);
      return `
        <div class="af-modal__audio-layout ${playerSrc ? "af-modal__audio-layout--spotify" : "af-modal__audio-layout--custom"}" data-player-shell data-player-state="ready" data-player-source="${playerSrc ? "spotify" : "rss-audio"}">
          ${
            playerSrc
              ? `<div class="af-modal__spotify-shell">
                  <iframe
                    style="border-radius:12px"
                    class="af-modal__player af-modal__player--spotify"
                    data-modal-player
                    src="${escapeHtml(playerSrc)}"
                    title="${escapeHtml(title)}"
                    width="100%"
                    height="352"
                    frameborder="0"
                    loading="eager"
                    scrolling="no"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowfullscreen
                    referrerpolicy="strict-origin-when-cross-origin"
                  ></iframe>
                </div>`
              : item.audioUrl
                ? renderCustomAudioPlayer(item)
              : ""
          }
        </div>
      `;
    }

    const videoId = extractYouTubeVideoId(item.youtubeVideoId || item.youtubeId || item.embedUrl || item.externalUrl);
    const embedUrl = videoId ? youtubeEmbedUrl(videoId, { autoplay: true }) : "";
    if (!videoId) return `<img src="${item.thumbnail}" alt="" />`;
    const poster = modalVideoPosterSource(item, videoId);

    return `
      <div
        class="af-modal__player-shell"
        data-player-shell
        data-player-state="ready"
        data-youtube-video-id="${videoId}"
        data-youtube-embed-url="${escapeHtml(embedUrl)}"
      >
        <img
          class="af-modal__player-poster"
          data-player-poster
          data-fallback-src="${escapeHtml(poster.fallback)}"
          src="${escapeHtml(poster.src || item.thumbnail)}"
          alt="${escapeHtml(title)}"
        />
        <button
          class="af-modal__play-overlay"
          type="button"
          data-play-inside="${mediaLookupId(item)}"
          data-media-type="${item.mediaType}"
          data-play-mode="watch"
          aria-label="Play sermon video"
        >
          ${iconPlay()}
        </button>
      </div>
    `;
  }

  function activateInlinePlayer(item, mode = "watch") {
    const playerShell = dom.modalContent.querySelector("[data-player-shell]");

    if (item.mediaType === "video") {
      const videoId = extractYouTubeVideoId(item.youtubeVideoId || item.youtubeId || item.embedUrl || item.externalUrl);
      const embedUrl = videoId ? youtubeEmbedUrl(videoId, { autoplay: true }) : "";
      console.log("Video ID:", videoId);
      console.log("Embed URL:", embedUrl);

      if (!playerShell) {
        renderModal(item, "details");
        return;
      }

      if (!videoId || !embedUrl) {
        console.warn("Missing or invalid YouTube video ID for modal playback:", item);
        return;
      }

      let playerFrame = playerShell.querySelector("[data-modal-player]");
      if (!playerFrame) {
        playerFrame = document.createElement("iframe");
        playerFrame.className = "af-modal__player af-modal__player--youtube";
        playerFrame.dataset.modalPlayer = "";
        playerFrame.title = "YouTube video player";
        playerFrame.setAttribute("frameborder", "0");
        playerFrame.setAttribute(
          "allow",
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        );
        playerFrame.setAttribute("allowfullscreen", "");
        playerFrame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        playerShell.appendChild(playerFrame);
      }

      playerFrame.onerror = () => {
        playerFrame.remove();
        playerShell.classList.remove("is-playing");
        playerShell.dataset.playerState = "ready";
      };
      playerFrame.src = embedUrl;
      playerShell.classList.add("is-playing");
      playerShell.dataset.playerState = "playing";
      playerFrame.focus({ preventScroll: true });
      return;
    }

    const playerFrame = dom.modalContent.querySelector("[data-modal-player]");

    if (!playerShell || !playerFrame) {
      renderModal(item, mode);
      return;
    }

    playerShell.classList.add("is-playing");
    playerShell.dataset.playerState = "playing";

    playerFrame.focus({ preventScroll: true });
  }

  function handleModalPosterFallback(event) {
    const poster = event.target?.closest?.("[data-player-poster]");
    if (!poster || poster.dataset.fallbackAttempted === "true") return;

    const fallbackSrc = poster.dataset.fallbackSrc;
    if (!fallbackSrc) return;

    poster.dataset.fallbackAttempted = "true";
    poster.src = fallbackSrc;
  }

  function renderVideoModal(item, mode = "details") {
    const primaryPlaylist = playlists[item.playlistIds[0]] || "Anchor Faith";
    const videoId = extractYouTubeVideoId(item.youtubeVideoId || item.youtubeId || item.embedUrl || item.externalUrl);
    const embedUrl = videoId ? youtubeEmbedUrl(videoId, { autoplay: true }) : "";
    console.log("Video ID:", videoId);
    console.log("Embed URL:", embedUrl);
    const related = relatedItemsFor(item);
    const relatedShelf = related.length
      ? renderShelf(
          {
            id: `related-${item.id}`,
            title: "",
            subtitle: "",
            mediaType: "video",
            playlistId: item.playlistIds[0],
          },
          { items: related }
        )
      : "";

    return `
      <article
        class="af-cms-template-page af-cms-template-page--video"
        data-cms-template="Sermon Template"
        data-cms-item-id="${item.id}"
        data-cms-slug="${item.slug}"
        data-cms-url="${item.cmsUrl}"
      >
      <div class="af-modal__primary" data-media-type="${item.mediaType}">
        <div class="af-modal__copy">
          <p class="af-modal__eyebrow">${item.mediaType === "audio" ? "Audio Episode" : primaryPlaylist}</p>
          <h2 id="modalTitle" class="af-modal__title" data-cms-field="main-title">${item.mainTitle || item.title}</h2>
          ${item.subtitle ? `<p class="af-modal__subtitle" data-cms-field="subtitle">${item.subtitle}</p>` : ""}
          <div class="af-modal__meta">
            ${itemMeta(item)
              .map((value) => `<span>${value}</span>`)
              .join("")}
          </div>
          ${renderModalDescription(item)}
          <div class="af-modal__tags" aria-label="Categories">
            ${(item.tags || []).map((tag) => `<span class="af-tag">${tag}</span>`).join("")}
          </div>
          <div class="af-modal__actions">${modalActions(item, mode)}</div>
        </div>
        <div class="af-modal__visual af-modal__visual--video">${modalVisual(item, mode)}</div>
      </div>
      ${relatedShelf ? `<div class="af-modal__related"><h3 class="af-modal__section-title">Related Sermons</h3>${relatedShelf}</div>` : ""}
      </article>
    `;
  }

  function renderAudioModal(item, mode = "details") {
    if (!podcastShelves.length) podcastShelves = buildPodcastShelves();
    const relatedPodcastShelf = podcastShelves.find((shelf) => shelf.items.some((candidate) => candidate.id === item.id));
    const relatedEpisodeItems = relatedPodcastShelf ? itemsForPodcastShelf(relatedPodcastShelf, item) : [];
    const relatedShelfConfig =
      relatedPodcastShelf && relatedEpisodeItems.length
        ? {
            ...relatedPodcastShelf,
            title: "",
            subtitle: "",
            actions: [],
            items: relatedEpisodeItems,
          }
        : null;

    return `
      <article
        class="af-cms-template-page af-cms-template-page--audio"
        data-cms-template="Podcast Episode Template"
        data-cms-item-id="${item.id}"
        data-cms-slug="${item.slug}"
        data-cms-url="${item.cmsUrl}"
      >
      <div class="af-modal__primary af-modal__primary--audio" data-media-type="audio">
        <div class="af-modal__copy">
          <p class="af-modal__eyebrow">Audio Episode</p>
          <h2 id="modalTitle" class="af-modal__title" data-cms-field="main-title">${item.mainTitle || item.title}</h2>
          ${item.subtitle ? `<p class="af-modal__subtitle" data-cms-field="subtitle">${item.subtitle}</p>` : ""}
          <div class="af-modal__meta">
            ${itemMeta(item)
              .map((value) => `<span>${value}</span>`)
              .join("")}
          </div>
          ${renderModalDescription(item)}
          <div class="af-modal__tags" aria-label="Categories">
            ${(item.tags || []).map((tag) => `<span class="af-tag">${tag}</span>`).join("")}
          </div>
          <div class="af-modal__actions">${modalActions(item, mode)}</div>
        </div>
        <div class="af-modal__visual af-modal__visual--audio">${modalVisual(item, mode)}</div>
      </div>
      <div class="af-modal__related af-audio-modal__shelves">
        <h3 class="af-modal__section-title">Related Episodes</h3>
        ${
          relatedShelfConfig
            ? `<div class="af-related-audio-zone" data-related-audio-zone>${renderShelfStack(
                [relatedShelfConfig],
                { idSuffix: `modal-${item.id}` }
              )}</div>`
            : ""
        }
      </div>
      </article>
    `;
  }

  function renderModal(item, mode = "details") {
    dom.modalContent.innerHTML =
      item.mediaType === "audio" ? renderAudioModal(item, mode) : renderVideoModal(item, mode);

    attachShelfBehavior(dom.modalContent);
  }

  function lockPage() {
    if (scrollLockState) return;
    lastScrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    scrollLockState = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      htmlScrollBehavior: html.style.scrollBehavior,
      bodyScrollBehavior: body.style.scrollBehavior,
    };
    html.classList.add("af-modal-open");
    body.classList.add("af-modal-open");
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${lastScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  }

  function unlockPage() {
    const html = document.documentElement;
    const body = document.body;
    const restoreY = scrollLockState
      ? Math.abs(parseInt(body.style.top || `-${lastScrollY}`, 10)) || lastScrollY
      : lastScrollY;
    const previousHtmlScrollBehavior = scrollLockState?.htmlScrollBehavior || "";
    const previousBodyScrollBehavior = scrollLockState?.bodyScrollBehavior || "";

    // Temporarily force instant scrolling. The page uses smooth scrolling globally,
    // which caused a visible animated jump when closing the modal.
    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";

    html.classList.remove("af-modal-open");
    body.classList.remove("af-modal-open");

    if (scrollLockState) {
      html.style.overflow = scrollLockState.htmlOverflow;
      html.style.overscrollBehavior = scrollLockState.htmlOverscrollBehavior;
      body.style.overflow = scrollLockState.bodyOverflow;
      body.style.position = scrollLockState.bodyPosition;
      body.style.top = scrollLockState.bodyTop;
      body.style.left = scrollLockState.bodyLeft;
      body.style.right = scrollLockState.bodyRight;
      body.style.width = scrollLockState.bodyWidth;
      scrollLockState = null;
    }

    window.scrollTo({ top: restoreY, left: 0, behavior: "instant" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: restoreY, left: 0, behavior: "instant" });
      window.requestAnimationFrame(() => {
        html.style.scrollBehavior = previousHtmlScrollBehavior;
        body.style.scrollBehavior = previousBodyScrollBehavior;
      });
    });
  }

  function containModalScroll(event) {
    if (!dom.modal.classList.contains("is-open")) return;
    event.stopPropagation();
    const deltaY = event.deltaY || 0;
    const atTop = dom.modal.scrollTop <= 0;
    const atBottom = dom.modal.scrollTop + dom.modal.clientHeight >= dom.modal.scrollHeight - 1;
    if ((atTop && deltaY < 0) || (atBottom && deltaY > 0)) {
      event.preventDefault();
    }
  }

  function beginModalTouch(event) {
    if (!dom.modal.classList.contains("is-open") || !event.touches.length) return;
    modalTouchStartY = event.touches[0].clientY;
  }

  function containModalTouch(event) {
    if (!dom.modal.classList.contains("is-open") || !event.touches.length) return;
    event.stopPropagation();
    const currentY = event.touches[0].clientY;
    const deltaY = modalTouchStartY - currentY;
    const atTop = dom.modal.scrollTop <= 0;
    const atBottom = dom.modal.scrollTop + dom.modal.clientHeight >= dom.modal.scrollHeight - 1;
    if ((atTop && deltaY < 0) || (atBottom && deltaY > 0)) {
      event.preventDefault();
    }
  }

  function formatAudioClock(seconds) {
    const totalSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function setCustomAudioPlaying(player, isPlaying) {
    const button = player.querySelector("[data-audio-toggle]");
    const playIcon = player.querySelector("[data-audio-play-icon]");
    const pauseIcon = player.querySelector("[data-audio-pause-icon]");
    player.classList.toggle("is-playing", isPlaying);
    if (button) button.setAttribute("aria-label", isPlaying ? "Pause episode" : "Play episode");
    if (playIcon) playIcon.hidden = isPlaying;
    if (pauseIcon) pauseIcon.hidden = !isPlaying;
  }

  function updateCustomAudioProgress(player) {
    const audio = player.querySelector("[data-custom-audio]");
    const seek = player.querySelector("[data-audio-seek]");
    const current = player.querySelector("[data-audio-current]");
    const duration = player.querySelector("[data-audio-duration]");
    if (!audio || !seek) return;

    const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const progress = audioDuration ? (audio.currentTime / audioDuration) * 100 : 0;
    seek.value = String(progress);
    player.style.setProperty("--audio-progress", `${progress}%`);
    if (current) current.textContent = formatAudioClock(audio.currentTime);
    if (duration && audioDuration) duration.textContent = formatAudioClock(audioDuration);
  }

  function bindCustomAudioPlayer(player) {
    if (!player || player.dataset.audioBound === "true") return;
    const audio = player.querySelector("[data-custom-audio]");
    if (!audio) return;
    player.dataset.audioBound = "true";
    audio.addEventListener("loadedmetadata", () => updateCustomAudioProgress(player));
    audio.addEventListener("timeupdate", () => updateCustomAudioProgress(player));
    audio.addEventListener("pause", () => setCustomAudioPlaying(player, false));
    audio.addEventListener("play", () => setCustomAudioPlaying(player, true));
    audio.addEventListener("ended", () => {
      setCustomAudioPlaying(player, false);
      updateCustomAudioProgress(player);
    });
    updateCustomAudioProgress(player);
  }

  function pauseOtherCustomAudioPlayers(activePlayer) {
    dom.modal.querySelectorAll("[data-custom-audio-player]").forEach((player) => {
      if (player === activePlayer) return;
      const audio = player.querySelector("[data-custom-audio]");
      if (audio && !audio.paused) audio.pause();
    });
  }

  function toggleCustomAudioPlayer(button) {
    const player = button.closest("[data-custom-audio-player]");
    const audio = player?.querySelector("[data-custom-audio]");
    if (!player || !audio) return;
    bindCustomAudioPlayer(player);

    if (audio.paused) {
      pauseOtherCustomAudioPlayers(player);
      audio.play().catch((error) => {
        console.warn("Audio playback could not start.", error);
        setCustomAudioPlaying(player, false);
      });
    } else {
      audio.pause();
    }
  }

  function seekCustomAudioPlayer(input) {
    const player = input.closest("[data-custom-audio-player]");
    const audio = player?.querySelector("[data-custom-audio]");
    if (!player || !audio) return;
    bindCustomAudioPlayer(player);
    const audioDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!audioDuration) return;
    audio.currentTime = (Number(input.value) / 100) * audioDuration;
    updateCustomAudioProgress(player);
  }

  function openMediaModal(item, options = {}) {
    if (!item || item.disabled) return;
    const mode = options.mode || "details";
    const cmsUrl = options.cmsUrl;
    const alreadyOpen = dom.modal.classList.contains("is-open");
    activeModalId = item.id;
    item.cmsUrl = cmsUrl || item.cmsUrl;
    renderModal(item, mode);
    if (!alreadyOpen) lockPage();
    dom.modal.classList.add("is-open");
    dom.modal.setAttribute("aria-hidden", "false");
    if (!alreadyOpen) dom.modal.querySelector(".af-modal__close").focus({ preventScroll: true });
    dom.modal.scrollTo({ top: 0, behavior: alreadyOpen ? "smooth" : "auto" });
    console.log("Modal opened:", mediaLookupId(item), item.mediaType);
  }

  function closeModal() {
    if (!activeModalId) return;
    const iframe = dom.modal.querySelector("iframe");
    if (iframe) iframe.src = "about:blank";
    dom.modal.querySelectorAll("audio").forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    dom.modal.classList.remove("is-open");
    dom.modal.setAttribute("aria-hidden", "true");
    activeModalId = null;
    unlockPage();
    window.setTimeout(() => {
      if (!activeModalId && dom.modal.getAttribute("aria-hidden") === "true") {
        dom.modalContent.innerHTML = "";
      }
    }, 760);
  }

  function handleClicks() {
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-close-modal]");
      if (close) {
        closeModal();
        return;
      }

      const descriptionToggle = event.target.closest("[data-description-toggle]");
      if (descriptionToggle) {
        event.preventDefault();
        const descriptionBlock = descriptionToggle.closest("[data-description-block]");
        const summary = descriptionBlock?.querySelector("[data-description-summary]");
        const full = descriptionBlock?.querySelector("[data-description-full]");
        if (!descriptionBlock || !summary || !full) return;

        const shouldExpand = descriptionBlock.dataset.descriptionExpanded !== "true";
        descriptionBlock.dataset.descriptionExpanded = String(shouldExpand);
        summary.hidden = shouldExpand;
        full.hidden = !shouldExpand;
        descriptionToggle.setAttribute("aria-expanded", String(shouldExpand));
        descriptionToggle.textContent = shouldExpand ? "Show less" : "Read more";
        return;
      }

      const audioToggle = event.target.closest("[data-audio-toggle]");
      if (audioToggle) {
        event.preventDefault();
        toggleCustomAudioPlayer(audioToggle);
        return;
      }

      const playInside = event.target.closest("[data-play-inside]");
      if (playInside) {
        event.preventDefault();
        const item = findMediaItemById(playInside.dataset.playInside, playInside.dataset.mediaType);
        if (item) {
          activeModalId = item.id;
          activateInlinePlayer(item, playInside.dataset.playMode || "watch");
          dom.modal.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }

      const heroDot = event.target.closest("[data-hero-index]");
      if (heroDot) {
        event.preventDefault();
        setHeroSlide(heroDot.dataset.heroIndex);
        return;
      }

      const collectionCollapse = event.target.closest("[data-collection-collapse]");
      if (collectionCollapse) {
        event.preventDefault();
        toggleCollectionCollapse();
        return;
      }

      const collectionOption = event.target.closest("[data-collection-option]");
      if (collectionOption) {
        event.preventDefault();
        reorderCollectionGroup(collectionOption.dataset.collectionOption);
        return;
      }

      const filterButton = event.target.closest("[data-playlist-filter]");
      if (filterButton) {
        event.preventDefault();
        selectPlaylistFilter(filterButton.dataset.playlistFilter);
        return;
      }

      const openTarget = event.target.closest("[data-media-id]");
      if (openTarget) {
        if (suppressClick) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const mediaId = openTarget.dataset.mediaId;
        const mediaType = openTarget.dataset.mediaType;
        console.log("Media card clicked:", mediaId, mediaType);
        const item = findMediaItemById(mediaId, mediaType);
        console.log("Resolved media item:", item);
        if (!item) {
          console.warn("No media item found for clicked card:", mediaId, mediaType);
          return;
        }
        openTarget.classList.add("is-opening-modal");
        window.setTimeout(() => openTarget.classList.remove("is-opening-modal"), 720);
        const mode = openTarget.dataset.playNow ? "watch" : openTarget.dataset.listenNow ? "listen" : "details";
        openMediaModal(item, { mode, cmsUrl: openTarget.dataset.cmsUrl || openTarget.getAttribute("href") });
      }
    });

    document.addEventListener("input", (event) => {
      const audioSeek = event.target.closest("[data-audio-seek]");
      if (!audioSeek) return;
      seekCustomAudioPlayer(audioSeek);
    });

    document.addEventListener("pointerover", (event) => {
      const filterButton = event.target.closest("[data-playlist-filter]");
      if (filterButton) setCollectionHoverPill(filterButton);
    }, { passive: true });

    document.addEventListener("pointerout", (event) => {
      const control = event.target.closest(".af-playlist-filter__buttons");
      if (!control || control.contains(event.relatedTarget)) return;
      clearCollectionHoverPill(control);
    }, { passive: true });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function setupViewMore() {
    syncViewMoreButton();
  }


  function updateCollectionStickyState() {
    const filterSection = collectionFilterElement();
    if (!filterSection) return;
    const offset = Number.parseFloat(getComputedStyle(filterSection).getPropertyValue("--sticky-header-offset")) || 80;
    const rect = filterSection.getBoundingClientRect();
    const isSticky = rect.top <= offset + 1;
    filterSection.classList.toggle("is-sticky", isSticky);

    const podcastRect = dom.podcasts && !dom.podcasts.hidden ? dom.podcasts.getBoundingClientRect() : null;
    const shouldYieldToPodcasts = Boolean(isSticky && podcastRect && podcastRect.top <= offset + filterSection.offsetHeight + 24);
    filterSection.classList.toggle("is-past-collections", shouldYieldToPodcasts);
  }

  function toggleSecondaryOptionsForTouch(event) {
    const filterSection = event.target.closest?.("[data-component='playlist-filter-buttons']");
    if (!filterSection) return;
    if (event.target.closest("[data-collection-option], [data-collection-collapse], [data-playlist-filter]")) return;
    if (!filterSection.classList.contains("is-sticky")) return;
    filterSection.classList.toggle("is-secondary-open");
  }

  function renderCurrentExperience(options = {}) {
    const shouldPreserveScroll = Boolean(options.preserveScroll);
    const scrollY = options.scrollY ?? window.scrollY;
    captureShelfScrollPositions();
    renderHero();
    renderShelves();
    attachShelfBehavior();
    observeShelves();
    revealShelvesInViewport();

    if (shouldPreserveScroll && !dom.modal.classList.contains("is-open")) {
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    }
  }

  function handleWindowScroll() {
    if (windowScrollFrame) return;
    windowScrollFrame = window.requestAnimationFrame(() => {
      windowScrollFrame = 0;
      revealShelvesInViewport();
      updateCollectionStickyState();
    });
  }

  async function refreshMediaInBackground() {
    return false;
  }

  async function init() {
    const hydratedFromCache = renderFromBundledRealCacheImmediately();

    if (hydratedFromCache) {
      renderCurrentExperience();
      startHeroCarousel();
    } else {
      renderGracefulEmptyState();
    }

    handleClicks();
    setupViewMore();
    document.addEventListener("error", handleModalPosterFallback, true);
    dom.modal.addEventListener("wheel", containModalScroll, { passive: false });
    dom.modal.addEventListener("touchstart", beginModalTouch, { passive: true });
    dom.modal.addEventListener("touchmove", containModalTouch, { passive: false });
    dom.hero.addEventListener("touchstart", beginHeroSwipe, { passive: true });
    dom.hero.addEventListener("touchend", endHeroSwipe, { passive: true });
    dom.hero.addEventListener("touchcancel", cancelHeroSwipe, { passive: true });
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("resize", updateCollectionStickyState, { passive: true });
    dom.primaryShelves.addEventListener("pointerdown", toggleSecondaryOptionsForTouch, { passive: true });
    dom.extraShelves.addEventListener("pointerdown", toggleSecondaryOptionsForTouch, { passive: true });
    updateCollectionStickyState();
  }

  init();
})();
