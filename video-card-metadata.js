(function (root) {
  function normalizeSpeakerName(value = "") {
    return String(value)
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function knownSpeakerName(value, approvedSpeakers = []) {
    const normalized = normalizeSpeakerName(value);
    if (!normalized) return "";

    const speaker = approvedSpeakers.find((candidate) =>
      [candidate.displayName, ...(candidate.matchNames || [])]
        .map(normalizeSpeakerName)
        .includes(normalized)
    );
    return speaker?.displayName || "";
  }

  function getVideoCardMetadata(item = {}, approvedSpeakers = []) {
    if (item.mediaType !== "video") return null;

    let subtitle = String(item.subtitle || "").trim();
    const explicitSpeaker = String(item.canonicalSpeaker || item.speaker || item.minister || "").trim();
    let speaker = knownSpeakerName(explicitSpeaker, approvedSpeakers) || explicitSpeaker;
    const legacySubtitleSpeaker = !speaker ? knownSpeakerName(subtitle, approvedSpeakers) : "";

    if (legacySubtitleSpeaker) {
      speaker = legacySubtitleSpeaker;
      subtitle = "";
    }

    return {
      title: String(item.mainTitle || item.title || "").trim(),
      subtitle,
      speaker,
      date: String(item.date || "").trim(),
      hasSubtitle: Boolean(subtitle),
    };
  }

  root.AnchorFaithVideoCardMetadata = {
    getVideoCardMetadata,
    knownSpeakerName,
    normalizeSpeakerName,
  };
})(typeof window !== "undefined" ? window : globalThis);
