(function (root) {
  function podcastDisplayName(episode = {}) {
    const name = String(episode.podcastName || episode.host || episode.minister || "Anchor Faith Podcast").trim();
    return name.replace(/\s+Podcast$/i, "") || name;
  }

  const LOCAL_SHOW_ARTWORK = Object.freeze({
    "anchor-faith-church-podcast": {
      src: "./assets/podcast-artwork/anchor-faith-church.jpg",
      width: 512,
      height: 512,
      type: "image/jpeg",
    },
    "the-current-podcast": {
      src: "./assets/podcast-artwork/the-crnt.jpg",
      width: 512,
      height: 512,
      type: "image/jpeg",
    },
  });

  function absoluteHttpsUrl(candidate = "", baseUrl = "") {
    if (!candidate) return "";
    try {
      const url = new URL(candidate, baseUrl || "https://anchor.faith/");
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function sameOriginArtwork(candidate = {}, baseUrl = "") {
    const src = absoluteHttpsUrl(candidate.src, baseUrl);
    if (!src) return null;
    try {
      const expectedOrigin = new URL(baseUrl || "https://anchor.faith/").origin;
      if (new URL(src).origin !== expectedOrigin) return null;
    } catch {
      return null;
    }
    return { ...candidate, src };
  }

  function artworkCandidates(episode = {}, baseUrl = "") {
    const showFallback = LOCAL_SHOW_ARTWORK[episode.podcastId] || null;
    const candidates = [
      {
        src: episode.localEpisodeArtworkUrl,
        width: episode.localEpisodeArtworkWidth,
        height: episode.localEpisodeArtworkHeight,
        type: episode.localEpisodeArtworkType,
      },
      {
        src: episode.localPodcastArtworkUrl || showFallback?.src,
        width: episode.localPodcastArtworkWidth || showFallback?.width,
        height: episode.localPodcastArtworkHeight || showFallback?.height,
        type: episode.localPodcastArtworkType || showFallback?.type,
      },
    ];
    const seen = new Set();
    return candidates
      .map((candidate) => sameOriginArtwork(candidate, baseUrl))
      .filter(Boolean)
      .filter((candidate) => {
        if (!candidate.src || seen.has(candidate.src)) return false;
        seen.add(candidate.src);
        return true;
      });
  }

  function validImageType(value = "") {
    const type = String(value).split(";")[0].trim().toLowerCase();
    return /^image\/[a-z0-9.+-]+$/.test(type) ? type : "";
  }

  function artworkDescriptor(candidate = {}) {
    if (!candidate.src) return null;
    const descriptor = { src: candidate.src };
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    const type = validImageType(candidate.type);
    if (Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0) {
      descriptor.sizes = `${width}x${height}`;
    }
    if (type) descriptor.type = type;
    return descriptor;
  }

  function metadataForPodcastEpisode(episode = {}, baseUrl = "") {
    const podcastName = podcastDisplayName(episode);
    const artwork = artworkCandidates(episode, baseUrl).map(artworkDescriptor).filter(Boolean).slice(0, 1);
    return {
      title: String(episode.mainTitle || episode.title || "Podcast episode").trim(),
      artist: podcastName,
      album: podcastName,
      artwork,
    };
  }

  function createPodcastMediaSession(options = {}) {
    const targetNavigator = options.navigator || root.navigator;
    const MediaMetadataClass = options.MediaMetadata || root.MediaMetadata;
    const baseUrl = options.baseUrl || root.location?.href || "https://anchor.faith/";
    const mediaSession = targetNavigator?.mediaSession;
    const supported = Boolean(mediaSession && typeof MediaMetadataClass === "function");
    let activeAudio = null;
    let activeCleanup = null;

    function safelySetActionHandler(action, handler) {
      if (!supported || typeof mediaSession.setActionHandler !== "function") return;
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Browsers may expose Media Session while omitting individual actions.
      }
    }

    function setPlaybackState(state) {
      if (!supported || !("playbackState" in mediaSession)) return;
      try {
        mediaSession.playbackState = state;
      } catch {
        // Playback state is optional in some partial implementations.
      }
    }

    function updatePositionState() {
      if (!supported || !activeAudio || typeof mediaSession.setPositionState !== "function") return;
      const duration = Number(activeAudio.duration);
      const position = Number(activeAudio.currentTime);
      const playbackRate = Number(activeAudio.playbackRate) || 1;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position) || position < 0) return;

      try {
        mediaSession.setPositionState({
          duration,
          playbackRate,
          position: Math.min(position, duration),
        });
      } catch {
        // Ignore incomplete position-state implementations.
      }
    }

    function seekBy(direction, details = {}) {
      if (!activeAudio) return;
      const offset = Number(details.seekOffset) > 0 ? Number(details.seekOffset) : 15;
      const duration = Number(activeAudio.duration);
      const limit = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
      activeAudio.currentTime = Math.min(Math.max(activeAudio.currentTime + direction * offset, 0), limit);
      updatePositionState();
    }

    function seekTo(details = {}) {
      if (!activeAudio || !Number.isFinite(Number(details.seekTime))) return;
      const duration = Number(activeAudio.duration);
      const limit = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
      const position = Math.min(Math.max(Number(details.seekTime), 0), limit);
      if (details.fastSeek && typeof activeAudio.fastSeek === "function") activeAudio.fastSeek(position);
      else activeAudio.currentTime = position;
      updatePositionState();
    }

    function registerActions() {
      safelySetActionHandler("play", () => {
        const playResult = activeAudio?.play();
        if (playResult && typeof playResult.catch === "function") playResult.catch(() => {});
      });
      safelySetActionHandler("pause", () => activeAudio?.pause());
      safelySetActionHandler("seekbackward", (details) => seekBy(-1, details));
      safelySetActionHandler("seekforward", (details) => seekBy(1, details));
      safelySetActionHandler("seekto", seekTo);
    }

    function clear(audio = activeAudio) {
      if (audio && activeAudio && audio !== activeAudio) return;
      if (activeCleanup) activeCleanup();
      activeCleanup = null;
      activeAudio = null;
      if (!supported) return;
      setPlaybackState("none");
      try {
        mediaSession.metadata = null;
        if (typeof mediaSession.setPositionState === "function") mediaSession.setPositionState();
      } catch {
        // Metadata and position cleanup are optional.
      }
      ["play", "pause", "seekbackward", "seekforward", "seekto"].forEach((action) => {
        safelySetActionHandler(action, null);
      });
    }

    function bind(audio, episode) {
      if (!supported || !audio || !episode || episode.mediaType !== "audio") return false;
      clear();
      activeAudio = audio;
      const metadata = metadataForPodcastEpisode(episode, baseUrl);
      const onPlay = () => {
        try {
          mediaSession.metadata = new MediaMetadataClass(metadata);
        } catch {
          // Invalid platform-specific metadata must never interrupt playback.
        }
        registerActions();
        setPlaybackState("playing");
        updatePositionState();
      };
      const onPause = () => setPlaybackState(audio.ended ? "none" : "paused");
      const onEnded = () => {
        setPlaybackState("none");
        updatePositionState();
      };
      const onPositionChange = () => updatePositionState();
      const listeners = [
        ["play", onPlay],
        ["pause", onPause],
        ["ended", onEnded],
        ["loadedmetadata", onPositionChange],
        ["durationchange", onPositionChange],
        ["ratechange", onPositionChange],
        ["timeupdate", onPositionChange],
      ];
      listeners.forEach(([event, handler]) => audio.addEventListener(event, handler));
      activeCleanup = () => listeners.forEach(([event, handler]) => audio.removeEventListener(event, handler));
      return true;
    }

    return {
      bind,
      clear,
      isSupported: () => supported,
      metadataForEpisode: (episode) => metadataForPodcastEpisode(episode, baseUrl),
      updatePositionState,
    };
  }

  root.AnchorFaithPodcastMediaSession = {
    absoluteHttpsUrl,
    artworkCandidates,
    artworkDescriptor,
    createPodcastMediaSession,
    LOCAL_SHOW_ARTWORK,
    metadataForPodcastEpisode,
    podcastDisplayName,
    sameOriginArtwork,
    validImageType,
  };
})(typeof window !== "undefined" ? window : globalThis);
