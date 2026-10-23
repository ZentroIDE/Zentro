module.exports = {
  bumpFiles: [
    {
      filename: "package.json",
      type: "json"
    },
    {
      filename: "frontend/package.json",
      type: "json"
    },
    {
      filename: "wails.json",
      updater: require("./scripts/wails-version-updater.cjs")
    }
  ],
  packageFiles: [
    {
      filename: "package.json",
      type: "json"
    }
  ],
  scripts: {
    // Regenerate the derived release-notes artifacts from release-notes/v*.md and
    // stage them into the release commit. Aborts the release if the freshly bumped
    // version has no (non-stub) release-notes file.
    postbump:
      "node scripts/release-notes.mjs release-sync && git add RELEASE_NOTES.md release-notes/index.json"
  }
};
