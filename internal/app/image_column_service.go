// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type imageColumnFile map[string]map[string][]string

type ImageColumnService struct {
	mu   sync.Mutex
	data imageColumnFile
}

func NewImageColumnService() *ImageColumnService {
	return &ImageColumnService{}
}

func (s *ImageColumnService) GetImageColumns(connectionKey, tableKey string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}
	if connectionKey == "" || tableKey == "" {
		return []string{}, nil
	}

	columns := append([]string(nil), s.data[connectionKey][tableKey]...)
	sort.Strings(columns)
	return columns, nil
}

func (s *ImageColumnService) GetImageColumnsByConnection(connectionKey string) (map[string][]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.ensureLoaded(); err != nil {
		return nil, err
	}
	if connectionKey == "" {
		return map[string][]string{}, nil
	}

	result := map[string][]string{}
	for tableKey, columns := range s.data[connectionKey] {
		sorted := append([]string(nil), columns...)
		sort.Strings(sorted)
		result[tableKey] = sorted
	}
	return result, nil
}

func (s *ImageColumnService) SetImageColumn(connectionKey, tableKey, column string, marked bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if connectionKey == "" || tableKey == "" || column == "" {
		return fmt.Errorf("image column: connectionKey, tableKey and column are required")
	}
	if err := s.ensureLoaded(); err != nil {
		return err
	}

	if s.data[connectionKey] == nil {
		s.data[connectionKey] = map[string][]string{}
	}

	columns := s.data[connectionKey][tableKey]
	index := -1
	for i, existing := range columns {
		if existing == column {
			index = i
			break
		}
	}

	if marked {
		if index == -1 {
			columns = append(columns, column)
		}
	} else if index != -1 {
		columns = append(columns[:index], columns[index+1:]...)
	}

	s.data[connectionKey][tableKey] = columns
	return s.saveToFile()
}

func (s *ImageColumnService) ensureLoaded() error {
	if s.data != nil {
		return nil
	}
	loaded, err := s.loadFromFile()
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if loaded == nil {
		loaded = imageColumnFile{}
	}
	s.data = loaded
	return nil
}

func (s *ImageColumnService) filePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "zentro", "image_columns.json"), nil
}

func (s *ImageColumnService) saveToFile() error {
	path, err := s.filePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return json.NewEncoder(f).Encode(s.data)
}

func (s *ImageColumnService) loadFromFile() (imageColumnFile, error) {
	path, err := s.filePath()
	if err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var data imageColumnFile
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}
