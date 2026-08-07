import assert from "node:assert/strict";
import test from "node:test";

await import("../podcast-media-session.js");

const { artworkCandidates, createPodcastMediaSession, inspectArtworkCandidate, metadataForPodcastEpisode, resolvePodcastArtwork } =
  globalThis.AnchorFaithPodcastMediaSession;

class FakeAudio extends EventTarget {
  constructor() {
    super();
    this.currentTime = 30;
    this.duration = 120;
    this.playbackRate = 1;
    this.ended = false;
    this.paused = true;
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

function supportedEnvironment() {
  const actions = new Map();
  const positions = [];
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(action, handler) {
      actions.set(action, handler);
    },
    setPositionState(value) {
      positions.push(value);
    },
  };
  return { actions, mediaSession, navigator: { mediaSession }, positions, FakeMediaMetadata };
}

const anchorEpisode = {
  id: "anchor-episode",
  mediaType: "audio",
  mainTitle: "Hear From Heaven - Kingdom Prayer",
  podcastName: "Anchor Faith Church Podcast",
  episodeArtworkUrl: "https://images.example/anchor-episode.jpg",
  episodeArtworkWidth: 640,
  episodeArtworkHeight: 640,
  episodeArtworkType: "image/jpeg",
};

const currentEpisode = {
  id: "current-episode",
  mediaType: "audio",
  mainTitle: "Left on Read - Pastor Chase Glisson",
  podcastName: "The.Crnt Podcast",
  episodeArtworkUrl: "https://images.example/the-crnt.webp",
  episodeArtworkWidth: 512,
  episodeArtworkHeight: 512,
  episodeArtworkType: "image/webp",
};

test("maps Anchor Faith Church episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(anchorEpisode), {
    title: "Hear From Heaven - Kingdom Prayer",
    artist: "Anchor Faith Church",
    album: "Anchor Faith Church",
    artwork: [{ src: "https://images.example/anchor-episode.jpg", sizes: "640x640", type: "image/jpeg" }],
  });
});

test("maps The.Crnt episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(currentEpisode), {
    title: "Left on Read - Pastor Chase Glisson",
    artist: "The.Crnt",
    album: "The.Crnt",
    artwork: [{ src: "https://images.example/the-crnt.webp", sizes: "512x512", type: "image/webp" }],
  });
});

test("uses episode, show, and fallback artwork priority and rejects non-HTTPS artwork", () => {
  assert.deepEqual(
    artworkCandidates({
      episodeArtworkUrl: "https://images.example/episode.jpg",
      podcastArtworkUrl: "https://images.example/show.jpg",
      spotifyArtworkUrl: "https://images.example/spotify.jpg",
      fallbackArtworkUrl: "https://images.example/fallback.jpg",
    }).map(({ src }) => src),
    [
      "https://images.example/episode.jpg",
      "https://images.example/show.jpg",
      "https://images.example/spotify.jpg",
      "https://images.example/fallback.jpg",
    ]
  );
  assert.deepEqual(artworkCandidates({ artworkUrl: "http://images.example/insecure.jpg" }), []);
});

test("inspects real response type and intrinsic dimensions without inventing descriptor data", async () => {
  class FakeImage {
    set src(value) {
      this.currentSrc = value;
      this.naturalWidth = 512;
      this.naturalHeight = 512;
      queueMicrotask(() => this.onload());
    }
  }
  const descriptor = await inspectArtworkCandidate(
    { src: "https://images.example/artwork" },
    {
      Image: FakeImage,
      fetch: async () => ({ ok: true, headers: { get: () => "image/png" } }),
    }
  );
  assert.deepEqual(descriptor, {
    src: "https://images.example/artwork",
    sizes: "512x512",
    type: "image/png",
  });
});

test("prefers a verified square show image when episode artwork is not square", async () => {
  class FakeImage {
    set src(value) {
      const isEpisode = value.includes("episode");
      this.naturalWidth = isEpisode ? 1200 : 512;
      this.naturalHeight = isEpisode ? 630 : 512;
      queueMicrotask(() => this.onload());
    }
  }
  const artwork = await resolvePodcastArtwork(
    {
      episodeArtworkUrl: "https://images.example/episode.jpg",
      podcastArtworkUrl: "https://images.example/show.jpg",
    },
    {
      Image: FakeImage,
      fetch: async () => ({ ok: true, headers: { get: () => "image/jpeg" } }),
    }
  );
  assert.deepEqual(artwork, [
    { src: "https://images.example/show.jpg", sizes: "512x512", type: "image/jpeg" },
  ]);
});

test("switches metadata and connects playback, seek, and position controls", async () => {
  const environment = supportedEnvironment();
  const controller = createPodcastMediaSession({
    navigator: environment.navigator,
    MediaMetadata: environment.FakeMediaMetadata,
    resolveArtwork: async (episode) => metadataForPodcastEpisode(episode).artwork,
  });
  const firstAudio = new FakeAudio();
  const secondAudio = new FakeAudio();

  assert.equal(controller.bind(firstAudio, anchorEpisode), true);
  await firstAudio.play();
  await Promise.resolve();
  assert.equal(environment.mediaSession.metadata.title, anchorEpisode.mainTitle);
  assert.equal(environment.mediaSession.playbackState, "playing");
  environment.actions.get("seekbackward")({});
  assert.equal(firstAudio.currentTime, 15);
  environment.actions.get("seekforward")({ seekOffset: 20 });
  assert.equal(firstAudio.currentTime, 35);
  environment.actions.get("seekto")({ seekTime: 80 });
  assert.equal(firstAudio.currentTime, 80);
  environment.actions.get("pause")();
  assert.equal(environment.mediaSession.playbackState, "paused");
  environment.actions.get("play")();
  await Promise.resolve();
  assert.equal(environment.mediaSession.playbackState, "playing");

  assert.equal(controller.bind(secondAudio, currentEpisode), true);
  await secondAudio.play();
  await Promise.resolve();
  assert.equal(environment.mediaSession.metadata.title, currentEpisode.mainTitle);
  assert.equal(environment.mediaSession.metadata.artist, "The.Crnt");
  assert.ok(environment.positions.some((value) => value?.duration === 120 && value.position === 30));
});

test("remains a no-op without Media Session support", async () => {
  const controller = createPodcastMediaSession({ navigator: {}, MediaMetadata: undefined });
  const audio = new FakeAudio();
  assert.equal(controller.isSupported(), false);
  assert.equal(controller.bind(audio, anchorEpisode), false);
  await audio.play();
  assert.equal(audio.paused, false);
  controller.clear(audio);
});
