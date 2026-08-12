import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const JSON_CACHE_PATH = "media-cache.json";
const SCRIPT_CACHE_PATH = "media-cache.js";
const PODCAST_ARTWORK_PATHS = [
  "assets/podcast-artwork/anchor-faith-church.jpg",
  "assets/podcast-artwork/the-crnt.jpg",
];

function jpegDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error(`Podcast artwork is not JPEG: ${filePath}`);
  let offset = 2;
  while (offset < data.length - 9) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = data.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error(`Podcast artwork dimensions are unavailable: ${filePath}`);
}

for (const cacheFile of [JSON_CACHE_PATH, SCRIPT_CACHE_PATH]) {
  if (!fs.existsSync(cacheFile)) {
    throw new Error(`Required cache file is missing: ${cacheFile}`);
  }
}

for (const artworkPath of PODCAST_ARTWORK_PATHS) {
  if (!fs.existsSync(artworkPath)) throw new Error(`Required podcast artwork is missing: ${artworkPath}`);
  const { width, height } = jpegDimensions(artworkPath);
  if (width !== 512 || height !== 512) {
    throw new Error(`Podcast artwork must be 512x512: ${artworkPath} is ${width}x${height}`);
  }
}

const cache = JSON.parse(fs.readFileSync(JSON_CACHE_PATH, "utf8"));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(SCRIPT_CACHE_PATH, "utf8"), context);

const scriptCache = context.window.AnchorFaithMediaCache;
if (JSON.stringify(cache) !== JSON.stringify(scriptCache)) {
  throw new Error("media-cache.json and media-cache.js do not contain the same cache object.");
}

execFileSync(process.execPath, ["--check", SCRIPT_CACHE_PATH], { stdio: "inherit" });

const data = cache.data || {};
const summary = {
  lastUpdated: cache.lastUpdated || "missing",
  sermons: (data.sermons || []).length,
  playlists: Object.keys(data.playlists || {}).length,
  latestSermons: (data.latestSermons || []).length,
  highlightedMessages: (data.highlightedMessages || []).length,
  topicGroups: (data.topicGroups || []).length,
  seriesGroups: (data.seriesGroups || []).length,
  speakerGroups: (data.speakerGroups || []).length,
  podcastEpisodes: (data.audioEpisodes || []).length,
  spotifyReadyPodcastEpisodes: (data.audioEpisodes || []).filter(
    (episode) => episode.spotifyEpisodeId || episode.spotifyEpisodeUrl,
  ).length,
};

console.log(`${process.env.CACHE_LABEL || "Media"} cache verification:`);
console.table(summary);

const requiredCounts = [
  "sermons",
  "playlists",
  "topicGroups",
  "seriesGroups",
  "speakerGroups",
  "podcastEpisodes",
];
const failures = requiredCounts.filter((key) => !summary[key]);

if (failures.length) {
  throw new Error(`Cache failed required counts: ${failures.join(", ")}`);
}
