import assert from "node:assert/strict";
import test from "node:test";

import { fetchYouTubePages, resetYouTubeRequestCount } from "./generate-media-cache.mjs";

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
