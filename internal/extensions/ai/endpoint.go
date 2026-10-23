// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

const (
	// HoldHost means the model host is new and has not been confirmed.
	HoldHost = "host"
	// HoldSensitive means the outbound body matched a sensitive shape.
	HoldSensitive = "sensitive"
)

// Policy is the set of facts the endpoint check needs. It does not include
// the API key or any database credential.
type Policy struct {
	AllowCloud    bool
	Airgap        bool
	AllowedHosts  []string
	AcceptNewHost bool
}

// Endpoint is the URL the request will use and the adapter that speaks to it.
type Endpoint struct {
	URL               string
	Host              string
	Adapter           Adapter
	Loopback          bool
	NeedsAllowlistAdd bool
}

var errHostApproval = errors.New("confirm this model host before sending")

// IsHostApproval reports the "confirm this host" result.
func IsHostApproval(err error) bool {
	return errors.Is(err, errHostApproval)
}

// ResolveEndpoint checks the user's base URL and returns the exact URL that
// may be posted to. The HTTP client also refuses redirects.
func ResolveEndpoint(base string, policy Policy) (Endpoint, error) {
	trimmed := strings.TrimSpace(base)
	if trimmed == "" {
		return Endpoint{}, fmt.Errorf("model address is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" || parsed.Scheme == "" {
		return Endpoint{}, fmt.Errorf("model address is not a valid URL")
	}
	if parsed.User != nil {
		return Endpoint{}, fmt.Errorf("model address must not include a username or password")
	}
	scheme := strings.ToLower(parsed.Scheme)
	host := parsed.Hostname()
	loopback := isLoopback(host)
	if scheme != "https" && !(scheme == "http" && loopback) {
		return Endpoint{}, fmt.Errorf("model address must use HTTPS, or HTTP on localhost")
	}
	if ip := net.ParseIP(host); ip != nil && !loopback {
		return Endpoint{}, fmt.Errorf("model address must be a hostname, not an IP address")
	}
	// Production is not a reason here (ADR 0017): blocking it only moves the
	// user to staging, where the same schema lives. Rows from production ask
	// the user in the chat instead.
	if !loopback && (!policy.AllowCloud || policy.Airgap) {
		return Endpoint{}, cloudBlockedReason(policy)
	}

	path := strings.TrimRight(parsed.EscapedPath(), "/")
	adapter := adapterForAddress(host, path)
	switch {
	case path == "":
		parsed.Path = "/v1" + adapter.Path()
	case strings.HasSuffix(path, adapter.Path()):
		parsed.Path = path
	default:
		parsed.Path = path + adapter.Path()
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""

	endpoint := Endpoint{URL: parsed.String(), Host: host, Adapter: adapter, Loopback: loopback}
	if loopback {
		return endpoint, nil
	}
	if !HostAllowed(host, policy.AllowedHosts) {
		if !policy.AcceptNewHost {
			return endpoint, errHostApproval
		}
		endpoint.NeedsAllowlistAdd = true
	}
	return endpoint, nil
}

func cloudBlockedReason(policy Policy) error {
	switch {
	case policy.Airgap:
		return fmt.Errorf("this license keeps the assistant on this computer")
	default:
		return fmt.Errorf("cloud models are off for this project")
	}
}

// EndpointHost returns the hostname of a model address. An invalid address
// returns an empty string.
func EndpointHost(base string) string {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func isLoopback(host string) bool {
	switch strings.ToLower(host) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func HostAllowed(host string, allowed []string) bool {
	for _, item := range allowed {
		if strings.EqualFold(strings.TrimSpace(item), host) {
			return true
		}
	}
	return false
}
