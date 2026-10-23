// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"fmt"
	"strings"

	"github.com/zalando/go-keyring"
)

const (
	keyringService = "zentro"
	keyPrefix      = "ai-provider:"
)

func keyAccount(projectID, host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return keyPrefix + projectID
	}
	return keyPrefix + projectID + ":" + host
}

// SaveProviderKey stores an inference API key for one model host.
// The key is not written to the settings file.
func SaveProviderKey(projectID, host, secret string) error {
	if strings.TrimSpace(projectID) == "" {
		return fmt.Errorf("open a project before saving a model key")
	}
	if strings.TrimSpace(host) == "" {
		return fmt.Errorf("set the model address before saving a model key")
	}
	if strings.TrimSpace(secret) == "" {
		return fmt.Errorf("model key is empty")
	}
	if err := keyring.Set(keyringService, keyAccount(projectID, host), secret); err != nil {
		return fmt.Errorf("save model key: %w", err)
	}
	return nil
}

// LoadProviderKey reads the key for host. A missing host key falls back to a
// key saved before keys were split by host. A missing key returns an empty string.
func LoadProviderKey(projectID, host string) (string, error) {
	if strings.TrimSpace(projectID) == "" {
		return "", nil
	}
	secret, err := readKey(keyAccount(projectID, host))
	if err != nil || secret != "" || strings.TrimSpace(host) == "" {
		return secret, err
	}
	return readKey(keyAccount(projectID, ""))
}

// DeleteProviderKey removes the key for host and the older project-wide key.
func DeleteProviderKey(projectID, host string) error {
	if strings.TrimSpace(projectID) == "" {
		return nil
	}
	if err := deleteKey(keyAccount(projectID, host)); err != nil {
		return err
	}
	if strings.TrimSpace(host) == "" {
		return nil
	}
	return deleteKey(keyAccount(projectID, ""))
}

func readKey(account string) (string, error) {
	secret, err := keyring.Get(keyringService, account)
	if err != nil {
		if err == keyring.ErrNotFound {
			return "", nil
		}
		return "", fmt.Errorf("read model key: %w", err)
	}
	return secret, nil
}

func deleteKey(account string) error {
	err := keyring.Delete(keyringService, account)
	if err == nil || err == keyring.ErrNotFound {
		return nil
	}
	return fmt.Errorf("delete model key: %w", err)
}

// KeyHint returns a masked tail of the key for the settings screen.
func KeyHint(secret string) string {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return ""
	}
	if len(secret) <= 4 {
		return "••••"
	}
	return "••••" + secret[len(secret)-4:]
}
