import assert from "node:assert/strict";
import test from "node:test";

await import("../video-card-metadata.js");

const { getVideoCardMetadata } = globalThis.AnchorFaithVideoCardMetadata;
const approvedSpeakers = [
  {
    displayName: "Ap. Earl Glisson",
    matchNames: ["earl glisson", "pastor earl glisson", "apostle earl glisson", "ap. earl glisson", "ap earl glisson"],
  },
  {
    displayName: "Ap. Marci Glisson",
    matchNames: ["marci glisson", "pastor marci glisson", "apostle marci glisson", "ap. marci glisson", "ap marci glisson"],
  },
];

function renderedLines(item) {
  const metadata = getVideoCardMetadata(item, approvedSpeakers);
  const lineTwo = metadata.hasSubtitle ? metadata.subtitle : metadata.speaker;
  const lineThree = metadata.hasSubtitle
    ? [metadata.speaker, metadata.date].filter(Boolean).join(" • ")
    : metadata.date;
  return [metadata.title, lineTwo, lineThree].filter(Boolean);
}

test("renders a video subtitle with semantic speaker and date metadata", () => {
  assert.deepEqual(
    renderedLines({
      mediaType: "video",
      mainTitle: "More Than Conversion",
      subtitle: "Kingdom Disciples",
      minister: "Ap. Earl Glisson",
      date: "February 19, 2026",
    }),
    ["More Than Conversion", "Kingdom Disciples", "Ap. Earl Glisson • February 19, 2026"]
  );
});

test("moves an exact known speaker out of a legacy subtitle without duplicating the date", () => {
  for (const item of [
    { mainTitle: "Stripped", date: "April 7, 2026" },
    { mainTitle: "Kingdom Everywhere", date: "March 24, 2026" },
    { mainTitle: "Kingdom Everywhere", date: "March 17, 2026" },
  ]) {
    assert.deepEqual(
      renderedLines({ ...item, mediaType: "video", subtitle: "Ap. Earl Glisson", minister: "" }),
      [item.mainTitle, "Ap. Earl Glisson", item.date]
    );
  }
});

test("renders a video with an explicit speaker and no subtitle on separate lines", () => {
  assert.deepEqual(
    renderedLines({
      mediaType: "video",
      mainTitle: "A Sermon Without a Subtitle",
      subtitle: "",
      speaker: "Ap. Marci Glisson",
      date: "August 13, 2026",
    }),
    ["A Sermon Without a Subtitle", "Ap. Marci Glisson", "August 13, 2026"]
  );
});

test("does not mistake a legitimate subtitle for a speaker", () => {
  assert.deepEqual(
    renderedLines({
      mediaType: "video",
      mainTitle: "Current Message",
      subtitle: "Kingdom Disciples",
      minister: "",
      date: "August 13, 2026",
    }),
    ["Current Message", "Kingdom Disciples", "August 13, 2026"]
  );
});

test("the shared video helper produces identical metadata in every YouTube shelf context", () => {
  const item = {
    mediaType: "video",
    mainTitle: "Stripped",
    subtitle: "Ap. Earl Glisson",
    minister: "",
    date: "April 7, 2026",
  };
  for (const shelf of ["Latest Sermons", "Playlist", "Topic", "Series", "Speaker"]) {
    assert.deepEqual(renderedLines(item), ["Stripped", "Ap. Earl Glisson", "April 7, 2026"], shelf);
  }
});

test("podcast items are outside the video metadata helper", () => {
  const podcast = {
    mediaType: "audio",
    mainTitle: "Podcast Episode",
    subtitle: "Ap. Earl Glisson",
    date: "August 13, 2026",
  };
  assert.equal(getVideoCardMetadata(podcast, approvedSpeakers), null);
  assert.deepEqual(podcast, {
    mediaType: "audio",
    mainTitle: "Podcast Episode",
    subtitle: "Ap. Earl Glisson",
    date: "August 13, 2026",
  });
});
