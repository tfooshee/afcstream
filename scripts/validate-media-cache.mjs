import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";

const JSON_CACHE_PATH = "media-cache.json";
const SCRIPT_CACHE_PATH = "media-cache.js";

for (const cacheFile of [JSON_CACHE_PATH, SCRIPT_CACHE_PATH]) {
  if (!fs.existsSync(cacheFile)) {
    throw new Error(`Required cache file is missing: ${cacheFile}`);
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
