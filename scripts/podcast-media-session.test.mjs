import assert from "node:assert/strict";
import test from "node:test";

await import("../podcast-media-session.js");

const { artworkCandidates, createPodcastMediaSession, metadataForPodcastEpisode } =
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
  podcastId: "anchor-faith-church-podcast",
};

const currentEpisode = {
  id: "current-episode",
  mediaType: "audio",
  mainTitle: "Left on Read - Pastor Chase Glisson",
  podcastName: "The.Crnt Podcast",
  podcastId: "the-current-podcast",
};

test("maps Anchor Faith Church episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(anchorEpisode, "https://stream.anchor.faith/"), {
    title: "Hear From Heaven - Kingdom Prayer",
    artist: "Anchor Faith Church",
    album: "Anchor Faith Church",
    artwork: [{ src: "https://stream.anchor.faith/assets/podcast-artwork/anchor-faith-church.jpg", sizes: "512x512", type: "image/jpeg" }],
  });
});

test("maps The.Crnt episode metadata", () => {
  assert.deepEqual(metadataForPodcastEpisode(currentEpisode, "https://stream.anchor.faith/"), {
    title: "Left on Read - Pastor Chase Glisson",
    artist: "The.Crnt",
    album: "The.Crnt",
    artwork: [{ src: "https://stream.anchor.faith/assets/podcast-artwork/the-crnt.jpg", sizes: "512x512", type: "image/jpeg" }],
  });
});

test("uses only same-origin local episode or show artwork", () => {
  assert.deepEqual(
    artworkCandidates(
      {
        podcastId: "anchor-faith-church-podcast",
        localEpisodeArtworkUrl: "./assets/podcast-artwork/special-episode.jpg",
        episodeArtworkUrl: "https://remote.example/untrusted.jpg",
      },
      "https://stream.anchor.faith/"
    ).map(({ src }) => src),
    [
      "https://stream.anchor.faith/assets/podcast-artwork/special-episode.jpg",
      "https://stream.anchor.faith/assets/podcast-artwork/anchor-faith-church.jpg",
    ]
  );
  assert.deepEqual(
    artworkCandidates(
      { podcastId: "unknown", localPodcastArtworkUrl: "https://remote.example/untrusted.jpg" },
      "https://stream.anchor.faith/"
    ),
    []
  );
});

test("switches metadata and connects playback, seek, and position controls", async () => {
  const environment = supportedEnvironment();
  const controller = createPodcastMediaSession({
    navigator: environment.navigator,
    MediaMetadata: environment.FakeMediaMetadata,
    baseUrl: "https://stream.anchor.faith/",
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
  assert.equal(
    environment.mediaSession.metadata.artwork[0].src,
    "https://stream.anchor.faith/assets/podcast-artwork/the-crnt.jpg"
  );
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
