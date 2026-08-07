import assert from "node:assert/strict";
import test from "node:test";

await import("../podcast-media-session.js");

const { absoluteHttpsArtwork, createPodcastMediaSession, metadataForPodcastEpisode } =
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
  artworkUrl: "https://images.example/anchor-episode.png",
};

const currentEpisode = {
  id: "current-episode",
  mediaType: "audio",
  mainTitle: "Left on Read - Pastor Chase Glisson",
  podcastName: "The.Crnt Podcast",
  artworkUrl: "https://images.example/the-crnt.webp",
};

test("maps Anchor Faith Church episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(anchorEpisode), {
    title: "Hear From Heaven - Kingdom Prayer",
    artist: "Anchor Faith Church",
    album: "Anchor Faith Church",
    artwork: [{ src: "https://images.example/anchor-episode.png" }],
  });
});

test("maps The.Crnt episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(currentEpisode), {
    title: "Left on Read - Pastor Chase Glisson",
    artist: "The.Crnt",
    album: "The.Crnt",
    artwork: [{ src: "https://images.example/the-crnt.webp" }],
  });
});

test("uses episode, show, and fallback artwork priority and rejects non-HTTPS artwork", () => {
  assert.equal(
    absoluteHttpsArtwork({ episodeArtworkUrl: "https://images.example/episode.jpg", artworkUrl: "https://images.example/show.jpg" }),
    "https://images.example/episode.jpg"
  );
  assert.equal(
    absoluteHttpsArtwork({ podcastArtworkUrl: "https://images.example/show.jpg", fallbackArtworkUrl: "https://images.example/fallback.jpg" }),
    "https://images.example/show.jpg"
  );
  assert.equal(absoluteHttpsArtwork({ fallbackArtworkUrl: "https://images.example/fallback.jpg" }), "https://images.example/fallback.jpg");
  assert.equal(absoluteHttpsArtwork({ artworkUrl: "http://images.example/insecure.jpg" }), "");
});

test("switches metadata and connects playback, seek, and position controls", async () => {
  const environment = supportedEnvironment();
  const controller = createPodcastMediaSession({
    navigator: environment.navigator,
    MediaMetadata: environment.FakeMediaMetadata,
  });
  const firstAudio = new FakeAudio();
  const secondAudio = new FakeAudio();

  assert.equal(controller.bind(firstAudio, anchorEpisode), true);
  await firstAudio.play();
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
