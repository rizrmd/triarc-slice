package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type HeroConfig struct {
	FullName   string `json:"full_name"`
	FrameImage string `json:"frame_image,omitempty"`
	CharBgPos  struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"char_bg_pos"`
	CharFgPos struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"char_fg_pos"`
	CharBgScale float64 `json:"char_bg_scale"`
	CharFgScale float64 `json:"char_fg_scale"`
	Tint        string  `json:"tint"`
}

func resolvePath(path string) string {
	if _, err := os.Stat(path); err == nil {
		return path
	}
	// Try parent directory
	parentPath := filepath.Join("..", path)
	if _, err := os.Stat(parentPath); err == nil {
		return parentPath
	}
	return path
}

func main() {
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}

	exeDir := filepath.Dir(exePath)
	frontendDist := filepath.Join(exeDir, "editor", "frontend", "dist")
	if _, err := os.Stat(frontendDist); err != nil {
		frontendDist = "./editor/frontend/dist"
	}

	fs := http.FileServer(http.Dir(frontendDist))
	http.Handle("/", fs)

	// Serve card assets
	// Since the binary is in root, we can serve directly from cards/
	cardsDir := resolvePath("./cards")
	http.Handle("/cards/", http.StripPrefix("/cards/", http.FileServer(http.Dir(cardsDir))))

	// API endpoints
	http.HandleFunc("/api/cards", listCardsHandler)
	http.HandleFunc("/api/card/", cardHandler) // Handles both GET and POST for specific card
	http.HandleFunc("/api/card-mask/", cardMaskHandler)
	http.HandleFunc("/api/card-char/", cardCharHandler)
	http.HandleFunc("/api/card-char-select/", cardCharSelectHandler)
	http.HandleFunc("/api/rename-card", renameCardHandler)
	http.HandleFunc("/api/assets/", assetsListHandler)
	assetsDir := resolvePath("./assets")
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(assetsDir))))

	port := "8080"
	fmt.Printf("Server starting on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

type CardMaskPayload struct {
	MaskBg string `json:"mask_bg"`
	MaskFg string `json:"mask_fg"`
}

func decodeMaskDataURL(value string) ([]byte, error) {
	const prefix = "data:image/webp;base64,"
	if !strings.HasPrefix(value, prefix) {
		return nil, fmt.Errorf("invalid mask format")
	}
	raw := strings.TrimPrefix(value, prefix)
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("failed to decode mask")
	}
	return decoded, nil
}

func cardMaskHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	slug := strings.TrimPrefix(r.URL.Path, "/api/card-mask/")
	if slug == "" {
		http.Error(w, "Missing card slug", http.StatusBadRequest)
		return
	}
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	var payload CardMaskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	maskBgBytes, err := decodeMaskDataURL(payload.MaskBg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	maskFgBytes, err := decodeMaskDataURL(payload.MaskFg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	imgDir := filepath.Join(resolvePath("./cards"), "hero", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(filepath.Join(imgDir, "mask-bg.webp"), maskBgBytes, 0644); err != nil {
		http.Error(w, "Failed to write mask-bg", http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(filepath.Join(imgDir, "mask-fg.webp"), maskFgBytes, 0644); err != nil {
		http.Error(w, "Failed to write mask-fg", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func parseCharRequestPath(path string) (string, string, bool) {
	trimmed := strings.TrimPrefix(path, "/api/card-char/")
	parts := strings.Split(trimmed, "/")
	if len(parts) != 2 {
		return "", "", false
	}
	slug := parts[0]
	layer := parts[1]
	if slug == "" || strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		return "", "", false
	}
	if layer != "char-bg" && layer != "char-fg" {
		return "", "", false
	}
	return slug, layer, true
}

func parseCardCharSelectPath(path string) (string, string, bool) {
	trimmed := strings.TrimPrefix(path, "/api/card-char-select/")
	parts := strings.Split(trimmed, "/")
	if len(parts) != 2 {
		return "", "", false
	}
	slug := parts[0]
	layer := parts[1]
	if slug == "" || strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		return "", "", false
	}
	if layer != "char-bg" && layer != "char-fg" {
		return "", "", false
	}
	return slug, layer, true
}

func readPreferredCharImage(slug string, layer string) ([]byte, error) {
	heroDir := filepath.Join(resolvePath("./cards"), "hero")
	customPath := filepath.Join(heroDir, slug, "img", layer+".upload")
	if data, err := os.ReadFile(customPath); err == nil {
		return data, nil
	}
	defaultPath := filepath.Join(heroDir, slug, "img", layer+".webp")
	return os.ReadFile(defaultPath)
}

func cardCharHandler(w http.ResponseWriter, r *http.Request) {
	slug, layer, ok := parseCharRequestPath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid card char path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		data, err := readPreferredCharImage(slug, layer)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Character image not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to read character image", http.StatusInternalServerError)
			return
		}
		contentType := http.DetectContentType(data)
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 20<<20)
		if err := r.ParseMultipartForm(20 << 20); err != nil {
			http.Error(w, "Invalid multipart form", http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Missing file", http.StatusBadRequest)
			return
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read upload", http.StatusBadRequest)
			return
		}
		if len(data) == 0 {
			http.Error(w, "Empty file", http.StatusBadRequest)
			return
		}
		contentType := http.DetectContentType(data)
		switch contentType {
		case "image/webp", "image/png", "image/jpeg", "image/gif":
		default:
			http.Error(w, "Unsupported image type", http.StatusBadRequest)
			return
		}
		imgDir := filepath.Join(resolvePath("./cards"), "hero", slug, "img")
		if err := os.MkdirAll(imgDir, 0755); err != nil {
			http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
			return
		}
		target := filepath.Join(imgDir, layer+".upload")
		if err := os.WriteFile(target, data, 0644); err != nil {
			http.Error(w, "Failed to save image", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func renameCardHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		OldSlug string `json:"oldSlug"`
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if payload.OldSlug == "" || payload.NewName == "" {
		http.Error(w, "Missing old slug or new name", http.StatusBadRequest)
		return
	}

	// Slugify logic
	s := strings.ToLower(payload.NewName)
	var sb strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		} else {
			sb.WriteRune('-')
		}
	}
	newSlug := sb.String()
	for strings.Contains(newSlug, "--") {
		newSlug = strings.ReplaceAll(newSlug, "--", "-")
	}
	newSlug = strings.Trim(newSlug, "-")

	if newSlug == "" {
		http.Error(w, "Invalid name resulted in empty slug", http.StatusBadRequest)
		return
	}

	heroDir := filepath.Join(resolvePath("./cards"), "hero")
	oldPath := filepath.Join(heroDir, payload.OldSlug)
	newPath := filepath.Join(heroDir, newSlug)

	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		http.Error(w, "Card not found", http.StatusNotFound)
		return
	}

	if newSlug != payload.OldSlug {
		if _, err := os.Stat(newPath); err == nil {
			http.Error(w, "Card with this name already exists", http.StatusConflict)
			return
		}

		if err := os.Rename(oldPath, newPath); err != nil {
			http.Error(w, "Failed to rename directory", http.StatusInternalServerError)
			return
		}
	}

	// Update hero.json
	jsonPath := filepath.Join(newPath, "hero.json")
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		http.Error(w, "Failed to read hero.json", http.StatusInternalServerError)
		return
	}

	var config HeroConfig
	if err := json.Unmarshal(data, &config); err != nil {
		http.Error(w, "Failed to parse hero.json", http.StatusInternalServerError)
		return
	}

	config.FullName = payload.NewName

	file, err := os.Create(jsonPath)
	if err != nil {
		http.Error(w, "Failed to open hero.json for writing", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(config); err != nil {
		http.Error(w, "Failed to update hero.json", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"newSlug": newSlug,
		"status":  "renamed",
	})
}

type AssetPickPayload struct {
	Filename string `json:"filename"`
}

func resolveImageAssetPath(baseDir string, filename string) (string, error) {
	if filename == "" {
		return "", fmt.Errorf("missing filename")
	}
	if strings.Contains(filename, "/") || strings.Contains(filename, "\\") || strings.Contains(filename, "..") {
		return "", fmt.Errorf("invalid filename")
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif":
	default:
		return "", fmt.Errorf("unsupported file type")
	}
	fullPath := filepath.Join(baseDir, filename)
	info, err := os.Stat(fullPath)
	if err != nil {
		return "", fmt.Errorf("asset not found")
	}
	if info.IsDir() {
		return "", fmt.Errorf("invalid asset")
	}
	return fullPath, nil
}

func cardCharSelectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	slug, layer, ok := parseCardCharSelectPath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid card char select path", http.StatusBadRequest)
		return
	}
	var payload AssetPickPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	charAssetsDir := filepath.Join(resolvePath("./assets"), "characters")
	sourcePath, err := resolveImageAssetPath(charAssetsDir, payload.Filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		http.Error(w, "Failed to read source image", http.StatusInternalServerError)
		return
	}
	imgDir := filepath.Join(resolvePath("./cards"), "hero", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}
	target := filepath.Join(imgDir, layer+".upload")
	if err := os.WriteFile(target, data, 0644); err != nil {
		http.Error(w, "Failed to save image", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func listImageAssets(baseDir string, publicPrefix string) ([]map[string]string, error) {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))
		switch ext {
		case ".png", ".jpg", ".jpeg", ".webp", ".gif":
		default:
			continue
		}
		items = append(items, map[string]string{
			"name": name,
			"url":  publicPrefix + "/" + url.PathEscape(entry.Name()),
		})
	}
	return items, nil
}

func assetsListHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	category := strings.TrimPrefix(r.URL.Path, "/api/assets/")
	var baseDir string
	var publicPrefix string
	assetsDir := resolvePath("./assets")
	switch category {
	case "characters":
		baseDir = filepath.Join(assetsDir, "characters")
		publicPrefix = "/assets/characters"
	case "ui":
		baseDir = filepath.Join(assetsDir, "ui")
		publicPrefix = "/assets/ui"
	default:
		http.Error(w, "Invalid asset category", http.StatusBadRequest)
		return
	}
	items, err := listImageAssets(baseDir, publicPrefix)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]map[string]string{})
			return
		}
		http.Error(w, "Failed to read assets", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func listCardsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cardsDir := filepath.Join(resolvePath("./cards"), "hero")
	entries, err := os.ReadDir(cardsDir)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty list if directory doesn't exist yet
			json.NewEncoder(w).Encode([]string{})
			return
		}
		http.Error(w, "Failed to read cards directory", http.StatusInternalServerError)
		return
	}

	var cards []string
	for _, entry := range entries {
		if entry.IsDir() {
			cards = append(cards, entry.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cards)
}

func cardHandler(w http.ResponseWriter, r *http.Request) {
	// Extract slug from URL path: /api/card/{slug}
	slug := strings.TrimPrefix(r.URL.Path, "/api/card/")
	if slug == "" {
		http.Error(w, "Missing card slug", http.StatusBadRequest)
		return
	}

	// Sanitize slug to prevent directory traversal
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	cardPath := filepath.Join(resolvePath("./cards"), "hero", slug, "hero.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(cardPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Card not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to read card data", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		var config HeroConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		// Ensure directory exists (though it should for existing cards)
		dir := filepath.Dir(cardPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		// Write formatted JSON
		file, err := os.Create(cardPath)
		if err != nil {
			http.Error(w, "Failed to open file for writing", http.StatusInternalServerError)
			return
		}
		defer file.Close()

		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(config); err != nil {
			http.Error(w, "Failed to write JSON", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
