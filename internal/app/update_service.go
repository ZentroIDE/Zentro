// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	goruntime "runtime"
	"strings"
	"time"

	"golang.org/x/mod/semver"
)

// UpdateInfo contains information about the latest release.
type UpdateInfo struct {
	LatestVersion  string `json:"latest_version"`
	ReleaseURL     string `json:"release_url"`
	Changelog      string `json:"changelog"`
	HasUpdate      bool   `json:"has_update"`
	DownloadURL    string `json:"download_url"`
	ChecksumSHA256 string `json:"checksum_sha256,omitempty"`
}

// UpdateService checks zentro-api's release registry for a newer version of
// the app than the one currently running.
type UpdateService struct {
	apiBaseURL string
	channel    string
	client     *http.Client
}

func publicDownloadURL() string {
	u := strings.TrimRight(strings.TrimSpace(os.Getenv("ZENTRO_APP_URL")), "/")
	if u != "" {
		return u + "/downloads"
	}
	return "https://zentro-ide.com/downloads"
}

// embeddedLicenseAPIURL is baked into release builds via:
//
//	-X 'zentro/internal/app.embeddedLicenseAPIURL=...'
//
// Mirrors internal/extensions/license/default_api_url.go's embedded var so a
// single build-time value configures every call this app makes to
// zentro-api, not just licensing - it's the same backend either way. Kept as
// a separate package-level var (rather than importing the license package)
// to avoid coupling the update checker to licensing internals.
var embeddedLicenseAPIURL string

// apiBaseURL mirrors internal/extensions/license/default_api_url.go's
// embedded-then-env override so a single ZENTRO_LICENSE_API_URL configures
// every call this app makes to zentro-api, not just licensing.
func defaultUpdateAPIURL() string {
	if v := strings.TrimSpace(embeddedLicenseAPIURL); v != "" {
		return strings.TrimRight(v, "/")
	}
	if v := strings.TrimSpace(os.Getenv("ZENTRO_LICENSE_API_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "https://api.zentro-ide.com"
}

// NewUpdateService constructs a service that checks zentro-api's release
// registry. Pass "" for apiBaseURL to use the default (env-overridable) API
// base URL, and "" for channel to default to "stable".
func NewUpdateService(apiBaseURL string, channel string) *UpdateService {
	base := strings.TrimSpace(apiBaseURL)
	if base == "" {
		base = defaultUpdateAPIURL()
	}
	ch := strings.TrimSpace(channel)
	if ch == "" {
		ch = "stable"
	}
	return &UpdateService{
		apiBaseURL: strings.TrimRight(base, "/"),
		channel:    ch,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

// releaseAPIPlatform maps GOOS to the platform string zentro-api's releases
// table uses (matches domain.Platform in zentro-api).
func releaseAPIPlatform() string {
	switch goruntime.GOOS {
	case "darwin":
		return "macos"
	default:
		return goruntime.GOOS // "windows", "linux"
	}
}

// releaseAPIArch is the registered arch value for the artifact this app can
// actually auto-update itself with. Windows specifically wants the installer
// variant ("amd64"), not the portable one ("amd64-portable"), since only the
// installer can be silently re-run to apply an update. An AppImage install on
// Linux is the same story: it checks against the "amd64-appimage" row so it
// only ever offers itself an artifact appimageupdatetool can actually apply
// in place; deb/rpm Linux installs keep checking "amd64" (which has no
// registered release - see release.yml's register-releases) and stay on the
// check-and-open-a-link flow, consistent with how a system package manager
// owns their upgrade path anyway. macOS is simpler - "universal" always
// points at the .pkg installer (see update_installer_darwin.go), since
// there's only one install location/format, unlike Linux's several.
func releaseAPIArch() string {
	switch goruntime.GOOS {
	case "darwin":
		return "universal"
	case "linux":
		if runningAsAppImage() {
			return "amd64-appimage"
		}
		return "amd64"
	default:
		return "amd64"
	}
}

// runningAsAppImage reports whether this process is executing from a mounted
// AppImage. The AppImage runtime sets $APPIMAGE (path to the image) and
// $APPDIR (mounted squashfs root) in the process env for the lifetime of the
// run - both are how update_installer_linux.go locates the image to update
// and the appimageupdatetool bundled alongside it.
func runningAsAppImage() bool {
	return strings.TrimSpace(os.Getenv("APPIMAGE")) != ""
}

// canAutoUpdateThisInstall reports whether this install has a signed,
// silently-reinstallable artifact - i.e. whether SpawnUpdateHelper actually
// does something instead of returning ErrAutoUpdateUnsupported. Exposed via
// AboutInfo.CanAutoUpdate so the frontend can pick the silent-restart flow
// vs. the check-and-open-a-link flow without needing to know what an
// AppImage is.
func canAutoUpdateThisInstall() bool {
	switch goruntime.GOOS {
	case "windows", "darwin":
		return true
	case "linux":
		return runningAsAppImage()
	default:
		return false
	}
}

type releaseResponse struct {
	Version        string  `json:"version"`
	DownloadURL    string  `json:"downloadUrl"`
	ChecksumSHA256 *string `json:"checksumSha256"`
	Changelog      *string `json:"changelog"`
}

// CheckForUpdates asks zentro-api for the latest published release on this
// platform/arch/channel and compares it against currentVersion.
func (s *UpdateService) CheckForUpdates(currentVersion string) (*UpdateInfo, error) {
	q := url.Values{}
	q.Set("platform", releaseAPIPlatform())
	q.Set("arch", releaseAPIArch())
	q.Set("channel", s.channel)
	releaseAPIURL := fmt.Sprintf("%s/api/v1/releases/latest?%s", s.apiBaseURL, q.Encode())

	log.Printf("[UpdateService] checking latest release: %s", releaseAPIURL)

	req, err := http.NewRequest(http.MethodGet, releaseAPIURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request release info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// No release registered yet for this platform/arch/channel - not an
		// error, just nothing to update to.
		return &UpdateInfo{HasUpdate: false}, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("release API returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var release releaseResponse
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("failed to parse release info: %w", err)
	}
	if strings.TrimSpace(release.Version) == "" {
		return nil, fmt.Errorf("release response missing version")
	}

	var changelog, checksum string
	if release.Changelog != nil {
		changelog = *release.Changelog
	}
	if release.ChecksumSHA256 != nil {
		checksum = *release.ChecksumSHA256
	}

	return buildUpdateInfo(currentVersion, release.Version, release.DownloadURL, checksum, changelog), nil
}

func buildUpdateInfo(currentVersion, latestVersion, downloadURL, checksum, changelog string) *UpdateInfo {
	current := normalizeSemver(currentVersion)
	latest := normalizeSemver(latestVersion)
	return &UpdateInfo{
		LatestVersion:  strings.TrimPrefix(latestVersion, "v"),
		ReleaseURL:     buildPublicDownloadURL(latestVersion),
		Changelog:      changelog,
		HasUpdate:      isNewer(current, latest),
		DownloadURL:    downloadURL,
		ChecksumSHA256: checksum,
	}
}

func buildPublicDownloadURL(tagVersion string) string {
	base := publicDownloadURL()
	version := strings.TrimSpace(tagVersion)
	if version == "" {
		return base
	}
	return fmt.Sprintf("%s?version=%s", base, url.QueryEscape(version))
}

// normalizeSemver ensures a "v" prefix, since golang.org/x/mod/semver
// requires it (bare "0.1.0" is treated as invalid, not just unprefixed).
func normalizeSemver(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return v
	}
	if !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	return v
}

// isNewer reports whether latest is a valid, greater semver than current.
// Falls back to false (no update) for anything that doesn't parse as
// semver, rather than risking a false positive from string comparison.
func isNewer(current, latest string) bool {
	if latest == "" || !semver.IsValid(latest) {
		return false
	}
	if current == "" || !semver.IsValid(current) {
		// No valid current version to compare against - be conservative.
		return false
	}
	return semver.Compare(latest, current) > 0
}
