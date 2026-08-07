(function (root) {
  function podcastDisplayName(episode = {}) {
    const name = String(episode.podcastName || episode.host || episode.minister || "Anchor Faith Podcast").trim();
    return name.replace(/\s+Podcast$/i, "") || name;
  }

  function absoluteHttpsUrl(candidate = "", baseUrl = "") {
    if (!candidate) return "";
    try {
      const url = new URL(candidate, baseUrl || "https://anchor.faith/");
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function artworkCandidates(episode = {}, baseUrl = "") {
    const candidates = [
      {
        src: episode.episodeArtworkUrl,
        width: episode.episodeArtworkWidth,
        height: episode.episodeArtworkHeight,
        type: episode.episodeArtworkType,
      },
      {
        src: episode.podcastArtworkUrl || episode.showArtworkUrl,
        width: episode.podcastArtworkWidth || episode.showArtworkWidth,
        height: episode.podcastArtworkHeight || episode.showArtworkHeight,
        type: episode.podcastArtworkType || episode.showArtworkType,
      },
      {
        src: episode.spotifyArtworkUrl || episode.artworkUrl,
        width: episode.spotifyArtworkWidth || episode.artworkWidth,
        height: episode.spotifyArtworkHeight || episode.artworkHeight,
        type: episode.spotifyArtworkType || episode.artworkType,
      },
      { src: episode.thumbnail || episode.image },
      { src: episode.fallbackArtworkUrl },
    ];
    const seen = new Set();
    return candidates
      .map((candidate) => ({ ...candidate, src: absoluteHttpsUrl(candidate.src, baseUrl) }))
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

  function inspectArtworkCandidate(candidate, options = {}) {
    const fetchImplementation = options.fetch;
    const ImageClass = options.Image;
    const typePromise = typeof fetchImplementation === "function"
      ? fetchImplementation(candidate.src, { method: "HEAD", mode: "cors", cache: "force-cache" })
          .then((response) => response.ok ? validImageType(response.headers?.get("content-type")) : "")
          .catch(() => "")
      : Promise.resolve("");
    const dimensionsPromise = typeof ImageClass === "function"
      ? new Promise((resolve) => {
          const image = new ImageClass();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve({ width: 0, height: 0 });
          image.src = candidate.src;
        })
      : Promise.resolve({ width: 0, height: 0 });

    return Promise.all([typePromise, dimensionsPromise]).then(([type, dimensions]) =>
      artworkDescriptor({
        ...candidate,
        type: type || candidate.type,
        width: dimensions.width || candidate.width,
        height: dimensions.height || candidate.height,
      })
    );
  }

  async function resolvePodcastArtwork(episode = {}, options = {}) {
    const candidates = artworkCandidates(episode, options.baseUrl);
    let fallbackDescriptor = null;
    for (const candidate of candidates) {
      const descriptor = await inspectArtworkCandidate(candidate, options);
      if (!descriptor) continue;
      fallbackDescriptor ||= descriptor;
      const [width, height] = String(descriptor.sizes || "").split("x").map(Number);
      if (width > 0 && width === height) return [descriptor];
    }
    return fallbackDescriptor ? [fallbackDescriptor] : [];
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
    const resolveArtwork = options.resolveArtwork || ((episode) => resolvePodcastArtwork(episode, {
      baseUrl,
      fetch: options.fetch || root.fetch?.bind(root),
      Image: options.Image || root.Image,
    }));
    let activeAudio = null;
    let activeCleanup = null;
    let bindingId = 0;

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
      bindingId += 1;
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
      const currentBindingId = bindingId;
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
        Promise.resolve(resolveArtwork(episode)).then((artwork) => {
          if (activeAudio !== audio || bindingId !== currentBindingId || !Array.isArray(artwork) || !artwork.length) return;
          try {
            mediaSession.metadata = new MediaMetadataClass({ ...metadata, artwork });
          } catch {
            // Retain the valid title metadata if enriched artwork is rejected.
          }
        }).catch(() => {});
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
    inspectArtworkCandidate,
    metadataForPodcastEpisode,
    podcastDisplayName,
    resolvePodcastArtwork,
    validImageType,
  };
})(typeof window !== "undefined" ? window : globalThis);
