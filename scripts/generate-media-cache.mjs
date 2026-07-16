#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const mediaCacheJsonPath = path.join(appDir, "media-cache.json");
const mediaCacheJsPath = path.join(appDir, "media-cache.js");
const spotifyMapPath = path.join(appDir, "spotify-episode-map.json");
const envPath = path.join(appDir, ".env");

await loadDotEnv();

const CACHE_VERSION = "1.1";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YOUTUBE_CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE || "anchorfaith";
const REQUIRE_SPOTIFY_EPISODES = process.env.REQUIRE_SPOTIFY_EPISODES !== "0";
const HIGHLIGHTED_PLAYLIST_TITLE = "This is Who We Are";

const SPEAKER_PRIORITY = {
  "Ap. Earl Glisson": 100,
  "Ap. Marci Glisson": 90,
};

const podcastSources = [
  {
    id: "anchor-faith-church-podcast",
    title: "Anchor Faith Church Podcast",
    rssUrl: "https://anchor.fm/s/128ece40/podcast/rss",
    spotifyShowId: "7sMWiLwUHPAqHyxYBQp7Qx",
    spotifyUrl: "https://open.spotify.com/show/7sMWiLwUHPAqHyxYBQp7Qx",
    mediaType: "audioShelf",
  },
  {
    id: "the-current-podcast",
    title: "The.Crnt Podcast",
    rssUrl: "https://anchor.fm/s/f9eea9b8/podcast/rss",
    spotifyShowId: "7xu0obdpJbYpFT62IohTkl",
    spotifyUrl: "https://open.spotify.com/show/7xu0obdpJbYpFT62IohTkl",
    mediaType: "audioShelf",
  },
  {
    id: "kingdom-first-business-alliance-podcast",
    title: "Kingdom First Business Alliance Podcast",
    rssUrl: "https://anchor.fm/s/10ef5931c/podcast/rss",
    spotifyShowId: "4rbu39RRiyRqVWzlfFk77I",
    spotifyUrl: "https://open.spotify.com/show/4rbu39RRiyRqVWzlfFk77I",
    mediaType: "audioShelf",
  },
];

async function loadDotEnv() {
  if (!existsSync(envPath)) return;

  const envText = await readFile(envPath, "utf8");
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .forEach((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const rawValue = line.slice(index + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
}

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

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value = "") {
  return decodeHtmlEntities(String(value))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function previewDescription(value = "", lineCount = 3, maxChars = 360) {
  const clean = cleanText(value);
  const lines = clean
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const preview = (lines.slice(0, lineCount).join("\n") || clean).slice(0, maxChars);
  return preview.length < clean.length ? `${preview.replace(/\s+\S*$/, "").trim()}...` : preview;
}

function parseAnchorFaithTitle(rawTitle = "") {
  const parts = String(rawTitle).split("|").map((part) => part.trim());
  return {
    rawTitle: String(rawTitle).trim(),
    mainTitle: parts[0] || String(rawTitle).trim(),
    subtitle: parts[1] || "",
    minister: parts.length >= 3 ? parts.slice(2).join(" | ").trim() : "",
  };
}

function normalizeSpeakerText(value = "") {
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

const approvedSpeakerFirstNameCounts = APPROVED_SPEAKERS.reduce((counts, speaker) => {
  const firstName = approvedSpeakerNameParts(speaker)[0];
  if (firstName) counts.set(firstName, (counts.get(firstName) || 0) + 1);
  return counts;
}, new Map());

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

function getCanonicalSpeakerName({ rawTitle = "", parsedMinister = "" } = {}) {
  const explicitMatch = canonicalSpeakerFromControlledText(parsedMinister, {
    allowUniquePastorFirstName: true,
    allowBareUniqueFirstName: true,
  });
  if (explicitMatch) return explicitMatch;

  const titleParts = String(rawTitle || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (titleParts.length >= 3) {
    return canonicalSpeakerFromControlledText(titleParts.slice(2).join(" | "), {
      allowUniquePastorFirstName: true,
      allowBareUniqueFirstName: true,
    });
  }

  return null;
}

function extractSpotifyEpisodeId(value = "") {
  const source = String(value || "");
  const match = source.match(/open\.spotify\.com\/(?:embed\/)?episode\/([A-Za-z0-9]+)/i);
  return match?.[1] || (/^[A-Za-z0-9]{12,}$/.test(source.trim()) ? source.trim() : "");
}

function spotifyEpisodeUrl(episodeIdOrUrl = "") {
  const id = extractSpotifyEpisodeId(episodeIdOrUrl);
  return id ? `https://open.spotify.com/episode/${id}` : "";
}

function formatDate(value = "") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatYouTubeDuration(value = "") {
  const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMilliseconds(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function fetchJson(url, label, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} failed with ${response.status}. ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function fetchText(url, label, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${label} failed with ${response.status}: ${response.statusText}`);
  return response.text();
}

function youtubeApiUrl(endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchYouTubePages(endpoint, params = {}) {
  const items = [];
  let pageToken = "";

  do {
    const data = await fetchJson(
      youtubeApiUrl(endpoint, {
        maxResults: 50,
        ...params,
        pageToken,
      }),
      `YouTube ${endpoint}`
    );
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return items;
}

async function resolveYouTubeChannel() {
  required(YOUTUBE_API_KEY, "YOUTUBE_API_KEY");

  const handles = [
    YOUTUBE_CHANNEL_HANDLE,
    YOUTUBE_CHANNEL_HANDLE.startsWith("@") ? YOUTUBE_CHANNEL_HANDLE.slice(1) : `@${YOUTUBE_CHANNEL_HANDLE}`,
  ];

  for (const handle of [...new Set(handles.filter(Boolean))]) {
    try {
      const handleResult = await fetchJson(
        youtubeApiUrl("channels", {
          part: "snippet,contentDetails",
          forHandle: handle,
          key: YOUTUBE_API_KEY,
        }),
        `YouTube channel by handle ${handle}`
      );
      if (handleResult.items?.[0]) return handleResult.items[0];
    } catch (error) {
      console.warn(error.message);
    }
  }

  const searchResult = await fetchJson(
    youtubeApiUrl("search", {
      part: "snippet",
      q: "Anchor Faith Church",
      type: "channel",
      key: YOUTUBE_API_KEY,
    }),
    "YouTube channel search"
  );
  const channelId = searchResult.items?.[0]?.snippet?.channelId;
  if (!channelId) throw new Error("Could not resolve Anchor Faith YouTube channel.");

  const channelResult = await fetchJson(
    youtubeApiUrl("channels", {
      part: "snippet,contentDetails",
      id: channelId,
      key: YOUTUBE_API_KEY,
    }),
    "YouTube searched channel"
  );
  return channelResult.items?.[0];
}

function youtubeThumbnail(snippet = {}) {
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

function isUnavailableYouTubeVideo(video = {}) {
  const title = String(video.title || video.rawTitle || video.mainTitle || "").toLowerCase().trim();
  const thumbnailUrl = video.thumbnailUrl || video.thumbnail || video.heroImage || "";

  return (
    title === "deleted video" ||
    title === "private video" ||
    title.includes("deleted video") ||
    title.includes("private video") ||
    !video.youtubeVideoId ||
    !thumbnailUrl
  );
}

function getCollectionDisplayLabel(rawTitle, selectedCollection) {
  if (!rawTitle) return "";

  let label = String(rawTitle).trim();
  const prefixes = ["Topic", "Series", "Speaker"];
  const activePrefix =
    selectedCollection ||
    prefixes.find((prefix) => label.toLowerCase().startsWith(prefix.toLowerCase()));

  if (activePrefix && label.toLowerCase().startsWith(activePrefix.toLowerCase())) {
    label = label.slice(activePrefix.length).trim();
  }

  label = label.replace(/^(\||-|:|–|—)+\s*/g, "").trim();
  return label || String(rawTitle).trim();
}

function cleanSpeakerPlaylistTitle(title) {
  return String(title || "")
    .replace(/^Speaker\s*\|\s*/i, "")
    .trim();
}

function compareCollectionGroupsByLabel(a, b) {
  return String(a?.optionLabel || a?.title || "").localeCompare(
    String(b?.optionLabel || b?.title || ""),
    undefined,
    { sensitivity: "base", numeric: true }
  );
}

function sortTopicSeriesGroups(groups = [], type = "") {
  if (!["topic", "series"].includes(type)) return groups;
  return [...groups].sort(compareCollectionGroupsByLabel);
}

function playlistStartsWith(value, prefix) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .startsWith(String(prefix || "").trim().toLowerCase());
}

function isSpeakerPlaylistTitle(value) {
  return /^Speaker\s*\|\s*/i.test(String(value || "").trim());
}

function newestPublishedAtForItems(items = []) {
  return items.reduce((newest, item) => {
    const publishedAt = item.publishedAt || item.videoPublishedAt || "";
    if (!publishedAt) return newest;
    if (!newest) return publishedAt;
    return new Date(publishedAt).getTime() > new Date(newest).getTime() ? publishedAt : newest;
  }, "");
}

function compareSpeakerGroups(a, b) {
  const priorityDifference = Number(b.priority || 0) - Number(a.priority || 0);
  if (priorityDifference) return priorityDifference;

  const newestDifference =
    new Date(b.newestVideoPublishedAt || 0).getTime() -
    new Date(a.newestVideoPublishedAt || 0).getTime();
  if (newestDifference) return newestDifference;

  return compareCollectionGroupsByLabel(a, b);
}

function dedupeVideosById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.youtubeVideoId || item.youtubeId || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPlaylistCollectionGroups({ shelfConfigs = [], sermons = [], type = "", prefix = "", excludedPlaylistId = "" }) {
  const groups = shelfConfigs
    .filter((shelf) => shelf.playlistId !== excludedPlaylistId && playlistStartsWith(shelf.title, prefix))
    .map((shelf) => {
      const items = dedupeVideosById(
        sermons.filter((item) => (item.playlistIds || []).includes(shelf.playlistId))
      ).filter((item) => !isUnavailableYouTubeVideo(item));
      const label = getCollectionDisplayLabel(shelf.title, prefix);

      return {
        id: `collection-${type}-${slugify(shelf.playlistId || label)}`,
        title: label,
        optionLabel: label,
        collectionType: type,
        mediaType: "video",
        playlistId: shelf.playlistId,
        rawCollectionTitle: shelf.title,
        description: shelf.description || shelf.subtitle || "",
        thumbnailUrl: shelf.thumbnailUrl || items[0]?.thumbnailUrl || "",
        itemIds: items.map((item) => item.id),
      };
    })
    .filter((group) => group.itemIds.length > 0);

  return sortTopicSeriesGroups(groups, type);
}

function buildSpeakerGroups({ shelfConfigs = [], sermons = [], excludedPlaylistId = "" }) {
  return shelfConfigs
    .filter((shelf) => shelf.playlistId !== excludedPlaylistId && isSpeakerPlaylistTitle(shelf.title))
    .map((shelf) => {
      const items = dedupeVideosById(
        sermons.filter((item) => (item.playlistIds || []).includes(shelf.playlistId))
      ).filter((item) => !isUnavailableYouTubeVideo(item));
      const label = cleanSpeakerPlaylistTitle(shelf.title);

      return {
        id: `collection-speaker-${slugify(shelf.playlistId || label)}`,
        title: label,
        optionLabel: label,
        collectionType: "speaker",
        mediaType: "video",
        playlistId: shelf.playlistId,
        rawCollectionTitle: shelf.title,
        priority: SPEAKER_PRIORITY[label] || 0,
        newestVideoPublishedAt: newestPublishedAtForItems(items),
        description: shelf.description || shelf.subtitle || "",
        thumbnailUrl: shelf.thumbnailUrl || items[0]?.thumbnailUrl || "",
        itemIds: items.map((item) => item.id),
      };
    })
    .filter((group) => group.itemIds.length > 0)
    .sort(compareSpeakerGroups);
}

function sermonsForPlaylist(sermons = [], playlistId = "") {
  return dedupeVideosById(
    sermons.filter((item) => (item.playlistIds || []).includes(playlistId))
  ).filter((item) => !isUnavailableYouTubeVideo(item));
}

function playlistTitleMatches(value, expectedTitle) {
  return String(value || "").trim().toLocaleLowerCase() === String(expectedTitle || "").trim().toLocaleLowerCase();
}

function findHighlightedShelf(shelfConfigs = []) {
  return shelfConfigs.find((shelf) => playlistTitleMatches(shelf.title, HIGHLIGHTED_PLAYLIST_TITLE)) || null;
}

function sermonsForItemIds(sermons = [], itemIds = []) {
  const sermonsById = new Map();
  sermons.forEach((item) => {
    [item.id, item.youtubeVideoId, item.youtubeId].filter(Boolean).forEach((id) => sermonsById.set(String(id), item));
  });
  return dedupeVideosById(itemIds.map((id) => sermonsById.get(String(id))).filter(Boolean)).filter((item) => !isUnavailableYouTubeVideo(item));
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

async function fetchYouTubeVideoDetails(videoIds = []) {
  const details = new Map();
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const batch = uniqueIds.slice(index, index + 50);
    const data = await fetchJson(
      youtubeApiUrl("videos", {
        part: "snippet,contentDetails",
        id: batch.join(","),
        key: YOUTUBE_API_KEY,
      }),
      "YouTube videos"
    );
    (data.items || []).forEach((item) => details.set(item.id, item));
  }

  return details;
}

function mergeVideo(collection, item) {
  const existing = collection.get(item.youtubeVideoId);
  if (!existing) {
    collection.set(item.youtubeVideoId, item);
    return;
  }

  existing.playlistIds = [...new Set([...(existing.playlistIds || []), ...(item.playlistIds || [])])];
  existing.tags = [...new Set([...(existing.tags || []), ...(item.tags || [])])];
}

async function buildYouTubeCache() {
  const channel = await resolveYouTubeChannel();
  const channelId = channel.id;
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads || "";
  const playlists = {};
  const playlistDetails = {};
  const shelfConfigs = [];

  if (uploadsPlaylistId) {
    playlists[uploadsPlaylistId] = "Latest Sermons";
    playlistDetails[uploadsPlaylistId] = {
      id: uploadsPlaylistId,
      title: "Latest Sermons",
      description: cleanText(channel.snippet?.description || ""),
      thumbnailUrl: youtubeThumbnail(channel.snippet),
      isLatestShelf: true,
    };
    shelfConfigs.push({
      id: "latest-sermons",
      title: "Latest Sermons",
      subtitle: "",
      description: cleanText(channel.snippet?.description || ""),
      thumbnailUrl: youtubeThumbnail(channel.snippet),
      mediaType: "video",
      playlistId: uploadsPlaylistId,
      isLatestShelf: true,
    });
  }

  const channelPlaylists = await fetchYouTubePages("playlists", {
    part: "snippet,contentDetails",
    channelId,
    key: YOUTUBE_API_KEY,
  });

  channelPlaylists.forEach((playlist) => {
    const title = cleanText(playlist.snippet?.title || "Untitled Playlist");
    const description = cleanText(playlist.snippet?.description || "");
    const thumbnailUrl = youtubeThumbnail(playlist.snippet);
    playlists[playlist.id] = title;
    playlistDetails[playlist.id] = {
      id: playlist.id,
      title,
      description,
      thumbnailUrl,
      itemCount: playlist.contentDetails?.itemCount || 0,
      publishedAt: playlist.snippet?.publishedAt || "",
    };
    shelfConfigs.push({
      id: `youtube-${playlist.id}`,
      title,
      subtitle: description,
      description,
      thumbnailUrl,
      mediaType: "video",
      playlistId: playlist.id,
    });
  });

  const playlistPages = new Map();
  const videoIds = [];

  for (const shelf of shelfConfigs) {
    const items = await fetchYouTubePages("playlistItems", {
      part: "snippet,contentDetails",
      playlistId: shelf.playlistId,
      key: YOUTUBE_API_KEY,
    });
    playlistPages.set(shelf.playlistId, items);
    items.forEach((item) => {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
      if (videoId) videoIds.push(videoId);
    });
  }

  const videoDetails = await fetchYouTubeVideoDetails(videoIds);
  const videoMap = new Map();

  shelfConfigs.forEach((shelf) => {
    (playlistPages.get(shelf.playlistId) || []).forEach((playlistItem) => {
      const videoId = playlistItem.contentDetails?.videoId || playlistItem.snippet?.resourceId?.videoId || "";
      if (!videoId) return;

      const detail = videoDetails.get(videoId);
      const snippet = detail?.snippet || playlistItem.snippet || {};
      const titleData = parseAnchorFaithTitle(snippet.title || playlistItem.snippet?.title || "Untitled sermon");
      const description = cleanText(snippet.description || playlistItem.snippet?.description || "");
      const summaryDescription = previewDescription(description);
      const thumbnail = youtubeThumbnail(snippet) || youtubeThumbnail(playlistItem.snippet);
      const publishedAt = detail?.snippet?.publishedAt || playlistItem.contentDetails?.videoPublishedAt || playlistItem.snippet?.publishedAt || "";
      const canonicalSpeaker = getCanonicalSpeakerName({
        rawTitle: titleData.rawTitle,
        parsedMinister: titleData.minister,
      });

      console.log("Speaker match:", {
        rawTitle: titleData.rawTitle,
        parsedMinister: titleData.minister,
        canonicalSpeaker,
      });

      const video = {
        id: videoId,
        mediaType: "video",
        ...titleData,
        canonicalSpeaker,
        speaker: canonicalSpeaker,
        title: titleData.mainTitle,
        date: formatDate(publishedAt),
        publishedAt,
        duration: formatYouTubeDuration(detail?.contentDetails?.duration),
        description: summaryDescription,
        rawDescription: description,
        fullDescription: description,
        summaryDescription,
        youtubeDescription: description,
        youtubeVideoId: videoId,
        youtubeId: videoId,
        thumbnail,
        thumbnailUrl: thumbnail,
        heroImage: thumbnail,
        embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        externalActionLabel: "Play on YouTube",
        playlistIds: [shelf.playlistId],
        tags: [shelf.title],
        playlistTitle: shelf.title,
        featured: videoMap.size === 0,
      };

      if (!isUnavailableYouTubeVideo(video)) mergeVideo(videoMap, video);
    });
  });

  const sermons = [...videoMap.values()];
  const visibleShelfConfigs = shelfConfigs.filter((shelf) =>
    sermons.some((item) => item.playlistIds.includes(shelf.playlistId))
  );

  visibleShelfConfigs.forEach((shelf) => {
    const firstItem = sermons.find((item) => item.playlistIds.includes(shelf.playlistId));
    shelf.thumbnailUrl = shelf.thumbnailUrl || firstItem?.thumbnailUrl || "";
    shelf.description = shelf.description || shelf.subtitle || "";
    if (playlistDetails[shelf.playlistId]) {
      playlistDetails[shelf.playlistId].thumbnailUrl =
        playlistDetails[shelf.playlistId].thumbnailUrl || shelf.thumbnailUrl;
      playlistDetails[shelf.playlistId].description =
        playlistDetails[shelf.playlistId].description || shelf.description;
    }
  });

  const highlightedShelf = findHighlightedShelf(visibleShelfConfigs);
  const highlightedItemIds = highlightedShelf
    ? playlistVideoIdsInOrder(playlistPages.get(highlightedShelf.playlistId) || [])
    : [];
  if (highlightedShelf) highlightedShelf.itemIds = highlightedItemIds;
  const highlightedPlaylistId = highlightedShelf?.playlistId || "";
  const topicGroups = buildPlaylistCollectionGroups({
    shelfConfigs: visibleShelfConfigs,
    sermons,
    type: "topic",
    prefix: "Topic",
    excludedPlaylistId: highlightedPlaylistId,
  });
  const seriesGroups = buildPlaylistCollectionGroups({
    shelfConfigs: visibleShelfConfigs,
    sermons,
    type: "series",
    prefix: "Series",
    excludedPlaylistId: highlightedPlaylistId,
  });
  const speakerGroups = buildSpeakerGroups({
    shelfConfigs: visibleShelfConfigs,
    sermons,
    excludedPlaylistId: highlightedPlaylistId,
  });
  const latestSermons = sermonsForPlaylist(sermons, uploadsPlaylistId);
  const highlightedMessages = highlightedShelf ? sermonsForItemIds(sermons, highlightedItemIds) : [];

  return {
    playlists,
    playlistDetails,
    shelfConfigs: visibleShelfConfigs,
    sermons,
    latestSermons,
    highlightedMessages,
    highlightedPlaylistId,
    highlightedPlaylistTitle: HIGHLIGHTED_PLAYLIST_TITLE,
    topicGroups,
    seriesGroups,
    speakerGroups,
  };
}

function xmlTagText(block = "", tagName = "") {
  const escaped = tagName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return cleanText(match?.[1] || "");
}

function xmlAnyTagText(block = "", tagNames = []) {
  for (const tagName of tagNames) {
    const value = xmlTagText(block, tagName);
    if (value) return value;
  }
  return "";
}

function xmlAttribute(block = "", tagName = "", attribute = "") {
  const escapedTag = tagName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const escapedAttr = attribute.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = block.match(new RegExp(`<${escapedTag}\\b[^>]*\\s${escapedAttr}=["']([^"']+)["'][^>]*>`, "i"));
  return decodeHtmlEntities(match?.[1] || "").trim();
}

async function fetchPodcastRss(source) {
  const xml = await fetchText(source.rssUrl, `${source.title} RSS`);
  const channelArtwork =
    xmlAttribute(xml, "itunes:image", "href") ||
    xmlAnyTagText(xmlTagText(xml, "image"), ["url"]) ||
    xmlAnyTagText(xml, ["url"]);
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  return itemBlocks.map((block, index) => {
    const title = xmlAnyTagText(block, ["title"]) || "Untitled episode";
    const rawDescription = xmlAnyTagText(block, ["content:encoded", "description", "itunes:summary"]);
    const description = cleanText(rawDescription);
    const summaryDescription = previewDescription(description);
    const guid = xmlAnyTagText(block, ["guid"]) || `${source.id}-${index}`;
    const itemLink = xmlAnyTagText(block, ["link"]);
    const enclosureUrl = xmlAttribute(block, "enclosure", "url");
    const artwork =
      xmlAttribute(block, "itunes:image", "href") ||
      xmlAttribute(block, "media:thumbnail", "url") ||
      xmlAttribute(block, "media:content", "url") ||
      channelArtwork;
    const spotifyCandidate = [itemLink, guid, rawDescription].find((value) => extractSpotifyEpisodeId(value)) || "";
    const spotifyEpisodeId = extractSpotifyEpisodeId(spotifyCandidate);
    const spotifyUrl = spotifyEpisodeId ? spotifyEpisodeUrl(spotifyEpisodeId) : "";

    return {
      id: `${source.id}-${slugify(guid || title)}`,
      mediaType: "audio",
      title,
      mainTitle: title,
      host: source.title,
      minister: source.title,
      date: formatDate(xmlAnyTagText(block, ["pubDate", "published", "updated"])),
      duration: xmlAnyTagText(block, ["itunes:duration", "duration"]),
      description: summaryDescription,
      rawDescription: description,
      fullDescription: description,
      summaryDescription,
      rssGuid: guid,
      thumbnail: artwork,
      artworkUrl: artwork,
      sourceUrl: source.rssUrl,
      audioUrl: enclosureUrl,
      externalUrl: spotifyUrl || itemLink || enclosureUrl || source.spotifyUrl,
      spotifyEpisodeId,
      spotifyEpisodeUrl: spotifyUrl,
      spotifyUrl: spotifyUrl || source.spotifyUrl,
      spotifyShowId: source.spotifyShowId,
      showSpotifyUrl: source.spotifyUrl,
      podcastId: source.id,
      podcastName: source.title,
      tags: ["Podcast", source.title],
    };
  });
}

async function spotifyAccessToken() {
  if (process.env.SPOTIFY_ACCESS_TOKEN) return process.env.SPOTIFY_ACCESS_TOKEN;

  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) throw new Error(`Spotify token failed with ${response.status}`);
  const data = await response.json();
  return data.access_token || "";
}

async function fetchSpotifyShowEpisodes(showId, token) {
  if (!showId || !token) return [];

  const episodes = [];
  let url = `https://api.spotify.com/v1/shows/${showId}/episodes?limit=50&market=US`;

  while (url) {
    const data = await fetchJson(url, `Spotify show ${showId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    episodes.push(...(data.items || []));
    url = data.next || "";
  }

  return episodes;
}

async function loadManualSpotifyMap() {
  if (!existsSync(spotifyMapPath)) return {};
  return JSON.parse(await readFile(spotifyMapPath, "utf8"));
}

function manualSpotifyMatch(episode, source, manualMap = {}) {
  const sourceMap = manualMap[source.id] || {};
  const candidates = [
    episode.rssGuid,
    episode.id,
    episode.title,
    normalizeText(episode.title),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const mapped = sourceMap[candidate];
    if (mapped) return mapped;
  }

  return "";
}

function spotifyEpisodeMatch(episode, spotifyEpisodes = []) {
  const normalizedTitle = normalizeText(episode.title);
  const episodeDateYear = String(episode.date || "").match(/\b\d{4}\b/)?.[0] || "";

  return (
    spotifyEpisodes.find((spotifyEpisode) => normalizeText(spotifyEpisode.name) === normalizedTitle) ||
    spotifyEpisodes.find((spotifyEpisode) => {
      const spotifyTitle = normalizeText(spotifyEpisode.name);
      return spotifyTitle.includes(normalizedTitle) || normalizedTitle.includes(spotifyTitle);
    }) ||
    spotifyEpisodes.find((spotifyEpisode) => {
      const spotifyYear = String(spotifyEpisode.release_date || "").slice(0, 4);
      return episodeDateYear && spotifyYear === episodeDateYear && normalizeText(spotifyEpisode.name).split(" ")[0] === normalizedTitle.split(" ")[0];
    }) ||
    null
  );
}

async function buildPodcastCache() {
  const token = await spotifyAccessToken();
  const manualMap = await loadManualSpotifyMap();
  const podcastShelfConfigs = podcastSources.map((source) => ({
    id: source.id,
    title: source.title,
    subtitle: "",
    mediaType: "audioShelf",
    sourceUrl: source.rssUrl,
    rssUrl: source.rssUrl,
    spotifyShowId: source.spotifyShowId,
    spotifyUrl: source.spotifyUrl,
    applePodcastUrl: source.applePodcastUrl || "",
  }));
  const audioEpisodes = [];

  for (const source of podcastSources) {
    const rssEpisodes = await fetchPodcastRss(source);
    const spotifyEpisodes = token ? await fetchSpotifyShowEpisodes(source.spotifyShowId, token) : [];

    rssEpisodes.forEach((episode) => {
      let spotifyId = extractSpotifyEpisodeId(manualSpotifyMatch(episode, source, manualMap));
      let spotifyEpisode = spotifyId
        ? spotifyEpisodes.find((candidate) => candidate.id === spotifyId)
        : spotifyEpisodeMatch(episode, spotifyEpisodes);

      if (!spotifyId && spotifyEpisode?.id) spotifyId = spotifyEpisode.id;
      const episodeUrl = spotifyId ? spotifyEpisodeUrl(spotifyId) : "";
      const spotifyArtwork = spotifyEpisode?.images?.[0]?.url || "";

      audioEpisodes.push({
        ...episode,
        spotifyEpisodeId: spotifyId,
        spotifyEpisodeUrl: episodeUrl,
        spotifyUrl: episodeUrl || source.spotifyUrl,
        externalUrl: episodeUrl || episode.externalUrl,
        duration: spotifyEpisode?.duration_ms ? formatMilliseconds(spotifyEpisode.duration_ms) : episode.duration,
        thumbnail: spotifyArtwork || episode.thumbnail,
        artworkUrl: spotifyArtwork || episode.artworkUrl,
      });
    });
  }

  const spotifyReadyEpisodes = audioEpisodes.filter((episode) => extractSpotifyEpisodeId(episode.spotifyEpisodeId || episode.spotifyEpisodeUrl));

  if (REQUIRE_SPOTIFY_EPISODES && spotifyReadyEpisodes.length !== audioEpisodes.length) {
    const missing = audioEpisodes
      .filter((episode) => !extractSpotifyEpisodeId(episode.spotifyEpisodeId || episode.spotifyEpisodeUrl))
      .map((episode) => `${episode.podcastName}: ${episode.title}`)
      .slice(0, 10);
    throw new Error(
      `Spotify episode mapping is incomplete. Missing ${audioEpisodes.length - spotifyReadyEpisodes.length} episode IDs. ` +
        `Set SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET, add spotify-episode-map.json, or run with REQUIRE_SPOTIFY_EPISODES=0. ` +
        `Examples: ${missing.join(" | ")}`
    );
  }

  return {
    podcastShelfConfigs,
    audioEpisodes: REQUIRE_SPOTIFY_EPISODES ? spotifyReadyEpisodes : audioEpisodes,
  };
}

function validateCache(cache) {
  const data = cache.data || {};
  const errors = [];
  const spotifyReadyEpisodes = (data.audioEpisodes || []).filter((episode) =>
    extractSpotifyEpisodeId(episode.spotifyEpisodeId || episode.spotifyEpisodeUrl)
  );

  if (!data.sermons?.length) errors.push("No YouTube sermons were generated.");
  if (!data.shelfConfigs?.length) errors.push("No YouTube shelves were generated.");
  if (!Object.keys(data.playlists || {}).length) errors.push("No YouTube playlists were generated.");
  if (!data.latestSermons?.length) errors.push("No latest sermons were generated.");
  if (!data.highlightedPlaylistId) errors.push(`No ${HIGHLIGHTED_PLAYLIST_TITLE} playlist was generated.`);
  if (!data.highlightedMessages?.length) errors.push(`No ${HIGHLIGHTED_PLAYLIST_TITLE} videos were generated.`);
  if (!data.topicGroups?.length) errors.push("No Topic groups were generated.");
  if (!data.seriesGroups?.length) errors.push("No Series groups were generated.");
  if (!data.speakerGroups?.length) errors.push("No Speaker groups were generated.");
  if (!data.audioEpisodes?.length) errors.push("No podcast episodes were generated.");
  if (!spotifyReadyEpisodes.length) errors.push("No Spotify-ready podcast episodes were generated.");
  if (REQUIRE_SPOTIFY_EPISODES && spotifyReadyEpisodes.length !== (data.audioEpisodes || []).length) {
    errors.push("One or more podcast episodes is missing a Spotify episode ID.");
  }

  if (errors.length) throw new Error(errors.join(" "));
}

function cacheSummary(cache) {
  const data = cache.data || {};
  const spotifyReadyEpisodes = (data.audioEpisodes || []).filter((episode) =>
    extractSpotifyEpisodeId(episode.spotifyEpisodeId || episode.spotifyEpisodeUrl)
  );

  return {
    sermons: (data.sermons || []).length,
    playlists: Object.keys(data.playlists || {}).length,
    latestSermons: (data.latestSermons || []).length,
    highlightedMessages: (data.highlightedMessages || []).length,
    topicGroups: (data.topicGroups || []).length,
    seriesGroups: (data.seriesGroups || []).length,
    speakerGroups: (data.speakerGroups || []).length,
    podcastEpisodes: (data.audioEpisodes || []).length,
    spotifyReadyPodcastEpisodes: spotifyReadyEpisodes.length,
  };
}

async function writeCache(cache) {
  validateCache(cache);
  const jsonOutput = `${JSON.stringify(cache, null, 2)}\n`;
  const jsOutput = `(function () {\n  window.AnchorFaithMediaCache = ${JSON.stringify(cache, null, 2)};\n})();\n`;
  const tempJsonPath = `${mediaCacheJsonPath}.tmp`;
  const tempJsPath = `${mediaCacheJsPath}.tmp`;

  await writeFile(tempJsonPath, jsonOutput);
  await writeFile(tempJsPath, jsOutput);
  await rename(tempJsonPath, mediaCacheJsonPath);
  await rename(tempJsPath, mediaCacheJsPath);
}

async function main() {
  console.log("Generating Anchor Faith media cache...");
  const [youtubeData, podcastData] = await Promise.all([buildYouTubeCache(), buildPodcastCache()]);
  const cache = {
    lastUpdated: new Date().toISOString(),
    source: "youtube-rss-spotify-generated",
    version: CACHE_VERSION,
    data: {
      playlists: youtubeData.playlists,
      playlistDetails: youtubeData.playlistDetails,
      shelfConfigs: youtubeData.shelfConfigs,
      latestSermons: youtubeData.latestSermons,
      highlightedMessages: youtubeData.highlightedMessages,
      highlightedPlaylistId: youtubeData.highlightedPlaylistId,
      highlightedPlaylistTitle: youtubeData.highlightedPlaylistTitle,
      topicGroups: youtubeData.topicGroups,
      seriesGroups: youtubeData.seriesGroups,
      speakerGroups: youtubeData.speakerGroups,
      collectionGroups: {
        topic: youtubeData.topicGroups,
        series: youtubeData.seriesGroups,
        speaker: youtubeData.speakerGroups,
      },
      podcastShelfConfigs: podcastData.podcastShelfConfigs,
      sermons: youtubeData.sermons,
      audioEpisodes: podcastData.audioEpisodes,
    },
  };

  await writeCache(cache);
  const summary = cacheSummary(cache);
  console.log("Anchor Faith media cache summary:");
  console.table(summary);
  console.log(
    `Wrote media cache: ${summary.sermons} sermons, ` +
      `${summary.playlists} playlists, ` +
      `${summary.topicGroups} Topic groups, ` +
      `${summary.seriesGroups} Series groups, ` +
      `${summary.speakerGroups} Speaker groups, ` +
      `${summary.podcastEpisodes} podcast episodes, ` +
      `${summary.spotifyReadyPodcastEpisodes} Spotify-ready podcast episodes.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
