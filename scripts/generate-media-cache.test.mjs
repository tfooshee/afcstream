import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPodcastCache,
  fetchPodcastRss,
  fetchYouTubePages,
  parsePodcastRss,
  resetYouTubeRequestCount,
  validatePodcastEpisodes,
} from "./generate-media-cache.mjs";

const podcastSource = {
  id: "test-podcast",
  title: "Test Podcast",
  rssUrl: "https://example.test/podcast/rss",
  spotifyUrl: "https://example.test/podcast",
};

function podcastRss({ title = "Newest episode", publishedAt = "Thu, 13 Aug 2026 16:00:00 GMT", audioUrl = "https://example.test/newest.mp3" } = {}) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test Podcast</title>
    <item><title>${title}</title><pubDate>${publishedAt}</pubDate><guid>newest</guid><enclosure url="${audioUrl}" type="audio/mpeg" /></item>
    <item><title>Older episode</title><pubDate>Thu, 06 Aug 2026 16:00:00 GMT</pubDate><guid>older</guid><enclosure url="https://example.test/older.mp3" type="audio/mpeg" /></item>
  </channel></rss>`;
}

function mockYouTubeResponses(responses) {
  let requestCount = 0;
  globalThis.fetch = async () => {
    const response = responses[requestCount];
    requestCount += 1;
    assert.ok(response, `Unexpected YouTube request ${requestCount}`);
    return {
      ok: true,
      json: async () => response,
    };
  };
  return () => requestCount;
}

test("playlist pagination rejects a repeated nextPageToken", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  resetYouTubeRequestCount();
  const requestCount = mockYouTubeResponses([
    { items: [{ id: "one" }], nextPageToken: "repeat-me" },
    { items: [{ id: "two" }], nextPageToken: "repeat-me" },
  ]);

  await assert.rejects(
    fetchYouTubePages(
      "playlistItems",
      { playlistId: "playlist-repeat" },
      { playlistId: "playlist-repeat", playlistTitle: "Repeated Token" }
    ),
    /YouTube playlistItems\.list playlist "Repeated Token" \(playlist-repeat\) returned repeated nextPageToken/
  );
  assert.equal(requestCount(), 2);
});

test("playlist pagination stops before requesting beyond its page limit", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  resetYouTubeRequestCount();
  const requestCount = mockYouTubeResponses([
    { items: [{ id: "one" }], nextPageToken: "page-two" },
    { items: [{ id: "two" }], nextPageToken: "page-three" },
  ]);

  await assert.rejects(
    fetchYouTubePages(
      "playlistItems",
      { playlistId: "playlist-limit" },
      { playlistId: "playlist-limit", playlistTitle: "Page Limit", maxPages: 2 }
    ),
    /YouTube playlistItems\.list playlist "Page Limit" \(playlist-limit\) exceeded the safety limit of 2 pages/
  );
  assert.equal(requestCount(), 2);
});

test("YouTube pagination stops at the cache-run request limit", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  resetYouTubeRequestCount();
  const responses = Array.from({ length: 300 }, (_, index) => ({
    items: [],
    nextPageToken: `page-${index + 2}`,
  }));
  const requestCount = mockYouTubeResponses(responses);

  await assert.rejects(
    fetchYouTubePages(
      "playlists",
      { channelId: "channel-limit" },
      { label: "request-limit test", maxPages: 400 }
    ),
    /YouTube playlists\.list for request-limit test reached the cache-run safety limit of 300 total YouTube API requests/
  );
  assert.equal(requestCount(), 300);
});

test("podcast RSS parsing and freshness validation require usable newest metadata", () => {
  const episodes = parsePodcastRss(podcastSource, podcastRss());
  assert.equal(episodes.length, 2);
  assert.equal(validatePodcastEpisodes(podcastSource, episodes).title, "Newest episode");

  assert.throws(
    () => validatePodcastEpisodes(podcastSource, parsePodcastRss(podcastSource, podcastRss({ publishedAt: "not-a-date" }))),
    /no valid publication date/
  );
  assert.throws(
    () => validatePodcastEpisodes(podcastSource, parsePodcastRss(podcastSource, podcastRss({ audioUrl: "" }))),
    /no enclosure\/audio URL/
  );
  assert.throws(() => parsePodcastRss(podcastSource, "<html>blocked</html>"), /not recognizable podcast RSS\/XML/);
});

test("podcast RSS requests accept XML, follow redirects, and expose current episodes", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      url: "https://podcasters.spotify.com/pod/show/test/rss",
      redirected: true,
      headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
      text: async () => podcastRss(),
    };
  };

  const episodes = await fetchPodcastRss(podcastSource);
  assert.equal(episodes[0].title, "Newest episode");
  assert.equal(request.url, podcastSource.rssUrl);
  assert.equal(request.options.redirect, "follow");
  assert.match(request.options.headers.Accept, /application\/rss\+xml/);
  assert.match(request.options.headers["User-Agent"], /AnchorFaithMediaCache/);
});

test("a Kingdom First Business Alliance RSS failure rejects the complete podcast refresh", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalGithubActions = process.env.GITHUB_ACTIONS;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = originalGithubActions;
  });
  delete process.env.GITHUB_ACTIONS;

  globalThis.fetch = async (url) => {
    if (url === "https://anchor.fm/s/10ef5931c/podcast/rss") {
      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        url,
        text: async () => "feed temporarily unavailable",
      };
    }
    return {
      ok: true,
      status: 200,
      url,
      redirected: false,
      headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
      text: async () => podcastRss(),
    };
  };

  await assert.rejects(
    buildPodcastCache(),
    /Required podcast RSS refresh failed.*Kingdom First Business Alliance Podcast.*HTTP 503 Service Unavailable/
  );
});
