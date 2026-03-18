package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/chai2010/webp"
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
	NamePos     struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"name_pos"`
	NameScale       float64 `json:"name_scale"`
	TextShadowColor string  `json:"text_shadow_color"`
	TextShadowSize  float64 `json:"text_shadow_size,omitempty"`
	Tint            string  `json:"tint"`
	HpBarPos        struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"hp_bar_pos"`
	HpBarScale    float64                `json:"hp_bar_scale"`
	HpBarCurrent  int                    `json:"hp_bar_current"`
	HpBarMax      int                    `json:"hp_bar_max"`
	HpBarHue      float64                `json:"hp_bar_hue"`
	HpBarFontSize float64                `json:"hp_bar_font_size,omitempty"`
	Lore          string                 `json:"lore"`
	Stats         map[string]interface{} `json:"stats"`
	Audio         map[string]string      `json:"audio"`
	Pose          map[string]interface{} `json:"pose"`
	ActionOverrides map[string]HeroActionOverride `json:"action_overrides,omitempty"`
}

type ElementList []string

func (e *ElementList) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		*e = nil
		return nil
	}

	var list []string
	if err := json.Unmarshal(data, &list); err == nil {
		*e = list
		return nil
	}

	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		if single == "" {
			*e = []string{}
		} else {
			*e = []string{single}
		}
		return nil
	}

	return fmt.Errorf("element must be a string or array of strings")
}

func (e ElementList) MarshalJSON() ([]byte, error) {
	if e == nil {
		return json.Marshal([]string{})
	}
	return json.Marshal([]string(e))
}

type ActionConfig struct {
	FullName   string `json:"full_name"`
	FrameImage string `json:"frame_image,omitempty"`
	CharBgPos  struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"char_bg_pos"`
	CharBgScale float64 `json:"char_bg_scale"`
	NamePos     struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"name_pos"`
	NameScale       float64         `json:"name_scale"`
	TextShadowColor string          `json:"text_shadow_color"`
	TextShadowSize  float64         `json:"text_shadow_size,omitempty"`
	Tint            string          `json:"tint"`
	Description     string          `json:"description"`
	Cost            int             `json:"cost"`
	Element         ElementList     `json:"element"`
	TargetRule      string          `json:"target_rule"`
	Targeting       *ActionTargeting `json:"targeting,omitempty"`
	VisibleLayers   map[string]bool `json:"visible_layers,omitempty"`
}

type ActionTargeting struct {
	Side       string `json:"side"`
	Scope      string `json:"scope"`
	Selection  string `json:"selection"`
	AllowSelf  bool   `json:"allow_self,omitempty"`
	AllowDead  bool   `json:"allow_dead,omitempty"`
}

type HeroActionOverride struct {
	TargetRule string           `json:"target_rule,omitempty"`
	Targeting  *ActionTargeting `json:"targeting,omitempty"`
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
	// Since the binary is in root, we can serve directly from data/
	cardsDir := resolvePath("./data")
	http.Handle("/data/", http.StripPrefix("/data/", http.FileServer(http.Dir(cardsDir))))

	// API endpoints
	http.HandleFunc("/api/cards", listCardsHandler)
	http.HandleFunc("/api/card/", cardHandler) // Handles both GET and POST for specific card
	http.HandleFunc("/api/actions", listActionsHandler)
	http.HandleFunc("/api/action/", actionHandler)
	http.HandleFunc("/api/card-mask/", cardMaskHandler)
	http.HandleFunc("/api/action-mask/", actionMaskHandler)
	http.HandleFunc("/api/card-char/", cardCharHandler)
	http.HandleFunc("/api/action-bg/", actionBgHandler)
	http.HandleFunc("/api/card-audio/", heroAudioHandler)
	http.HandleFunc("/api/card-char-select/", cardCharSelectHandler)
	http.HandleFunc("/api/action-bg-select/", actionBgSelectHandler)
	http.HandleFunc("/api/rename-card", renameCardHandler)
	http.HandleFunc("/api/game-layout", gameLayoutHandler)
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
	MaskBg     string `json:"mask_bg"`
	MaskFg     string `json:"mask_fg"`
	PoseMaskBg string `json:"pose_mask_bg"`
	PoseMaskFg string `json:"pose_mask_fg"`
}

func decodeMaskDataURL(value string) ([]byte, error) {
	// Support both WebP (preferred) and PNG (fallback)
	if strings.HasPrefix(value, "data:image/webp;base64,") {
		raw := strings.TrimPrefix(value, "data:image/webp;base64,")
		return base64.StdEncoding.DecodeString(raw)
	}
	if strings.HasPrefix(value, "data:image/png;base64,") {
		raw := strings.TrimPrefix(value, "data:image/png;base64,")
		return base64.StdEncoding.DecodeString(raw)
	}
	// Generic fallback
	if idx := strings.Index(value, ";base64,"); idx != -1 {
		raw := value[idx+8:]
		return base64.StdEncoding.DecodeString(raw)
	}
	return nil, fmt.Errorf("invalid mask format")
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

	// Limit body size to 20MB to prevent DoS (increased for more masks)
	r.Body = http.MaxBytesReader(w, r.Body, 20<<20)

	var payload CardMaskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("Mask decode error: %v", err)
		http.Error(w, "Invalid JSON body or payload too large", http.StatusBadRequest)
		return
	}

	imgDir := filepath.Join(resolvePath("./data"), "hero", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}

	saveMask := func(dataUrl string, filename string) error {
		if dataUrl == "" {
			return nil
		}
		bytes, err := decodeMaskDataURL(dataUrl)
		if err != nil {
			return err
		}

		temp := filepath.Join(imgDir, filename+".tmp")
		if err := saveAsWebP(bytes, temp); err != nil {
			return err
		}
		if err := os.Rename(temp, filepath.Join(imgDir, filename)); err != nil {
			os.Remove(temp) // Clean up
			return err
		}
		return nil
	}

	if err := saveMask(payload.MaskBg, "mask-bg.webp"); err != nil {
		http.Error(w, "BG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.MaskFg, "mask-fg.webp"); err != nil {
		http.Error(w, "FG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.PoseMaskBg, "pose-mask-bg.webp"); err != nil {
		http.Error(w, "Pose BG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.PoseMaskFg, "pose-mask-fg.webp"); err != nil {
		http.Error(w, "Pose FG: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func actionMaskHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	slug := strings.TrimPrefix(r.URL.Path, "/api/action-mask/")
	if slug == "" {
		http.Error(w, "Missing action slug", http.StatusBadRequest)
		return
	}
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	// Limit body size to 20MB to prevent DoS (increased for more masks)
	r.Body = http.MaxBytesReader(w, r.Body, 20<<20)

	var payload CardMaskPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("Mask decode error: %v", err)
		http.Error(w, "Invalid JSON body or payload too large", http.StatusBadRequest)
		return
	}

	imgDir := filepath.Join(resolvePath("./data"), "action", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}

	saveMask := func(dataUrl string, filename string) error {
		if dataUrl == "" {
			return nil
		}
		bytes, err := decodeMaskDataURL(dataUrl)
		if err != nil {
			return err
		}

		temp := filepath.Join(imgDir, filename+".tmp")
		if err := saveAsWebP(bytes, temp); err != nil {
			return err
		}
		if err := os.Rename(temp, filepath.Join(imgDir, filename)); err != nil {
			os.Remove(temp) // Clean up
			return err
		}
		return nil
	}

	if err := saveMask(payload.MaskBg, "mask-bg.webp"); err != nil {
		http.Error(w, "BG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.MaskFg, "mask-fg.webp"); err != nil {
		http.Error(w, "FG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.PoseMaskBg, "pose-mask-bg.webp"); err != nil {
		http.Error(w, "Pose BG: "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := saveMask(payload.PoseMaskFg, "pose-mask-fg.webp"); err != nil {
		http.Error(w, "Pose FG: "+err.Error(), http.StatusBadRequest)
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
	if layer != "char-bg" && layer != "char-fg" && layer != "card" && layer != "pose-char-fg" && layer != "pose-shadow" {
		return "", "", false
	}
	return slug, layer, true
}

func parseActionBgPath(path string) (string, bool) {
	slug := strings.TrimPrefix(path, "/api/action-bg/")
	if slug == "" || strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		return "", false
	}
	return slug, true
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
	if layer != "char-bg" && layer != "char-fg" && layer != "card" && layer != "pose-char-fg" && layer != "pose-shadow" {
		return "", "", false
	}
	return slug, layer, true
}

func parseActionBgSelectPath(path string) (string, bool) {
	slug := strings.TrimPrefix(path, "/api/action-bg-select/")
	if slug == "" || strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		return "", false
	}
	return slug, true
}

func readPreferredCharImage(baseDirName, slug, layer string) ([]byte, error) {
	heroDir := filepath.Join(resolvePath("./data"), baseDirName)
	imgDir := filepath.Join(heroDir, slug, "img")

	// Priority order: webp (standard), then legacy overrides
	// Since we now convert everything to webp, checking webp first is most efficient.
	// But to support legacy/manual files, we can check others too.
	exts := []string{".webp", ".upload", ".gif", ".png", ".jpg", ".jpeg"}

	for _, ext := range exts {
		path := filepath.Join(imgDir, layer+ext)
		if data, err := os.ReadFile(path); err == nil {
			return data, nil
		}
	}

	return nil, os.ErrNotExist
}

func saveAsWebP(data []byte, targetPath string) error {
	contentType := http.DetectContentType(data)

	// If it's already WebP, just save it
	if contentType == "image/webp" {
		return os.WriteFile(targetPath, data, 0644)
	}

	// Decode the image
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to decode image: %v", err)
	}

	// Create output file
	out, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %v", err)
	}
	defer out.Close()

	// Encode as WebP
	// Lossless: false, Quality: 90 is a good default
	if err := webp.Encode(out, img, &webp.Options{Lossless: false, Quality: 90}); err != nil {
		return fmt.Errorf("failed to encode webp: %v", err)
	}

	return nil
}

func cardCharHandler(w http.ResponseWriter, r *http.Request) {
	slug, layer, ok := parseCharRequestPath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid card char path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		data, err := readPreferredCharImage("hero", slug, layer)
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

		imgDir := filepath.Join(resolvePath("./data"), "hero", slug, "img")
		if err := os.MkdirAll(imgDir, 0755); err != nil {
			http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
			return
		}

		// Always save as .webp
		target := filepath.Join(imgDir, layer+".webp")
		if err := saveAsWebP(data, target); err != nil {
			log.Printf("Save WebP error: %v", err)
			http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Cleanup conflicting overrides
		cleanupExts := []string{".upload", ".gif", ".png", ".jpg", ".jpeg"}
		for _, e := range cleanupExts {
			_ = os.Remove(filepath.Join(imgDir, layer+e))
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func actionBgHandler(w http.ResponseWriter, r *http.Request) {
	slug, ok := parseActionBgPath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid action bg path", http.StatusBadRequest)
		return
	}

	const layer = "char-bg"

	switch r.Method {
	case http.MethodGet:
		data, err := readPreferredCharImage("action", slug, layer)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Action background not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to read action background", http.StatusInternalServerError)
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

		imgDir := filepath.Join(resolvePath("./data"), "action", slug, "img")
		if err := os.MkdirAll(imgDir, 0755); err != nil {
			http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
			return
		}

		target := filepath.Join(imgDir, layer+".webp")
		if err := saveAsWebP(data, target); err != nil {
			log.Printf("Save WebP error: %v", err)
			http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
			return
		}

		cleanupExts := []string{".upload", ".gif", ".png", ".jpg", ".jpeg"}
		for _, e := range cleanupExts {
			_ = os.Remove(filepath.Join(imgDir, layer+e))
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func actionHandler(w http.ResponseWriter, r *http.Request) {
	// Extract slug from URL path: /api/action/{slug}
	slug := strings.TrimPrefix(r.URL.Path, "/api/action/")
	if slug == "" {
		http.Error(w, "Missing action slug", http.StatusBadRequest)
		return
	}

	// Sanitize slug to prevent directory traversal
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	actionPath := filepath.Join(resolvePath("./data"), "action", slug, "action.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(actionPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Action not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to read action data", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		var config ActionConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			log.Printf("[actionHandler] Failed to decode JSON: %v", err)
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}
		log.Printf("[actionHandler] Received config for %s: full_name=%s, char_bg_scale=%.0f", slug, config.FullName, config.CharBgScale)

		// Ensure directory exists
		dir := filepath.Dir(actionPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			log.Printf("[actionHandler] Failed to create directory: %v", err)
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		// Write formatted JSON
		file, err := os.Create(actionPath)
		if err != nil {
			log.Printf("[actionHandler] Failed to create file: %v", err)
			http.Error(w, "Failed to open file for writing", http.StatusInternalServerError)
			return
		}
		defer file.Close()

		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(config); err != nil {
			log.Printf("[actionHandler] Failed to encode JSON: %v", err)
			http.Error(w, "Failed to write JSON", http.StatusInternalServerError)
			return
		}

		log.Printf("[actionHandler] Successfully saved config to %s", actionPath)

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})

	case http.MethodDelete:
		actionDir := filepath.Join(resolvePath("./data"), "action", slug)
		if _, err := os.Stat(actionDir); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Action not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to access action", http.StatusInternalServerError)
			return
		}
		if err := os.RemoveAll(actionDir); err != nil {
			log.Printf("[actionHandler] Failed to delete action dir %s: %v", actionDir, err)
			http.Error(w, "Failed to delete action", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func heroAudioHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// URL path: /api/card-audio/{slug}
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/card-audio/")
	slug := trimmed
	if slug == "" || strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	// 50MB limit
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		http.Error(w, "Invalid multipart form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Ensure filename is safe
	filename := filepath.Base(header.Filename)
	filename = strings.ReplaceAll(filename, " ", "_")
	// Basic extension check
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".wav" && ext != ".mp3" && ext != ".ogg" {
		http.Error(w, "Only .wav, .mp3, .ogg allowed", http.StatusBadRequest)
		return
	}

	heroDir := filepath.Join(resolvePath("./data"), "hero", slug)
	audioDir := filepath.Join(heroDir, "audio")
	if err := os.MkdirAll(audioDir, 0755); err != nil {
		http.Error(w, "Failed to create audio directory", http.StatusInternalServerError)
		return
	}

	targetPath := filepath.Join(audioDir, filename)
	dst, err := os.Create(targetPath)
	if err != nil {
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	// Public URL path
	// The server maps /data/ to ./data/
	// So data/hero/{slug}/audio/{filename} becomes /data/hero/{slug}/audio/{filename}
	publicPath := fmt.Sprintf("/data/hero/%s/audio/%s", slug, filename)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"path": publicPath,
	})
}

func gameLayoutHandler(w http.ResponseWriter, r *http.Request) {
	layoutPath := filepath.Join(resolvePath("./data"), "game-layout.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(layoutPath)
		if err != nil {
			if os.IsNotExist(err) {
				// Return default layout if not found
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte("{}"))
				return
			}
			http.Error(w, "Failed to read layout data", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		var layout interface{}
		if err := json.NewDecoder(r.Body).Decode(&layout); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		// Ensure directory exists
		if err := os.MkdirAll(filepath.Dir(layoutPath), 0755); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		file, err := os.Create(layoutPath)
		if err != nil {
			http.Error(w, "Failed to open file for writing", http.StatusInternalServerError)
			return
		}
		defer file.Close()

		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(layout); err != nil {
			http.Error(w, "Failed to write JSON", http.StatusInternalServerError)
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
		Type    string `json:"type"`
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

	baseType := payload.Type
	if baseType == "" {
		baseType = "hero"
	}

	var baseDir string
	var jsonFilename string
	var notFoundMsg string
	var existsMsg string

	switch baseType {
	case "hero":
		baseDir = filepath.Join(resolvePath("./data"), "hero")
		jsonFilename = "hero.json"
		notFoundMsg = "Card not found"
		existsMsg = "Card with this name already exists"
	case "action":
		baseDir = filepath.Join(resolvePath("./data"), "action")
		jsonFilename = "action.json"
		notFoundMsg = "Action not found"
		existsMsg = "Action with this name already exists"
	default:
		http.Error(w, "Invalid type", http.StatusBadRequest)
		return
	}

	oldPath := filepath.Join(baseDir, payload.OldSlug)
	newPath := filepath.Join(baseDir, newSlug)

	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		http.Error(w, notFoundMsg, http.StatusNotFound)
		return
	}

	if newSlug != payload.OldSlug {
		if _, err := os.Stat(newPath); err == nil {
			http.Error(w, existsMsg, http.StatusConflict)
			return
		}

		if err := os.Rename(oldPath, newPath); err != nil {
			http.Error(w, "Failed to rename directory", http.StatusInternalServerError)
			return
		}
	}

	jsonPath := filepath.Join(newPath, jsonFilename)
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		http.Error(w, "Failed to read config file", http.StatusInternalServerError)
		return
	}

	file, err := os.Create(jsonPath)
	if err != nil {
		http.Error(w, "Failed to open config file for writing", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")

	if baseType == "action" {
		var config ActionConfig
		if err := json.Unmarshal(data, &config); err != nil {
			http.Error(w, "Failed to parse action.json", http.StatusInternalServerError)
			return
		}
		config.FullName = payload.NewName
		if err := encoder.Encode(config); err != nil {
			http.Error(w, "Failed to update action.json", http.StatusInternalServerError)
			return
		}
	} else {
		var config HeroConfig
		if err := json.Unmarshal(data, &config); err != nil {
			http.Error(w, "Failed to parse hero.json", http.StatusInternalServerError)
			return
		}
		config.FullName = payload.NewName
		if err := encoder.Encode(config); err != nil {
			http.Error(w, "Failed to update hero.json", http.StatusInternalServerError)
			return
		}
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
	imgDir := filepath.Join(resolvePath("./data"), "hero", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}

	// Always save as .webp
	target := filepath.Join(imgDir, layer+".webp")
	if err := saveAsWebP(data, target); err != nil {
		log.Printf("Save WebP error: %v", err)
		http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Cleanup conflicting overrides
	cleanupExts := []string{".upload", ".gif", ".png", ".jpg", ".jpeg"}
	for _, e := range cleanupExts {
		_ = os.Remove(filepath.Join(imgDir, layer+e))
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

func actionBgSelectHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	slug, ok := parseActionBgSelectPath(r.URL.Path)
	if !ok {
		http.Error(w, "Invalid action bg select path", http.StatusBadRequest)
		return
	}

	const layer = "char-bg"

	var payload AssetPickPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}
	actionAssetsDir := filepath.Join(resolvePath("./assets"), "actions")
	sourcePath, err := resolveImageAssetPath(actionAssetsDir, payload.Filename)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		http.Error(w, "Failed to read source image", http.StatusInternalServerError)
		return
	}
	imgDir := filepath.Join(resolvePath("./data"), "action", slug, "img")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		http.Error(w, "Failed to create image directory", http.StatusInternalServerError)
		return
	}

	target := filepath.Join(imgDir, layer+".webp")
	if err := saveAsWebP(data, target); err != nil {
		log.Printf("Save WebP error: %v", err)
		http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	cleanupExts := []string{".upload", ".gif", ".png", ".jpg", ".jpeg"}
	for _, e := range cleanupExts {
		_ = os.Remove(filepath.Join(imgDir, layer+e))
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// deduplicatePlaces strips -wide/-narrow suffixes and extensions, deduplicating
// so cave-wide.webp and cave-narrow.webp both collapse into a single "cave" entry.
func deduplicatePlaces(items []map[string]string) []map[string]string {
	seen := make(map[string]bool)
	result := make([]map[string]string, 0, len(items))
	prefix := ""
	for _, item := range items {
		name := item["name"]
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name[:len(name)-len(ext)], "-wide")
		base = strings.TrimSuffix(base, "-narrow")
		// canonical is just the base name without extension
		if seen[base] {
			continue
		}
		seen[base] = true
		if prefix == "" && strings.LastIndex(item["url"], "/") >= 0 {
			prefix = item["url"][:strings.LastIndex(item["url"], "/")+1]
		}
		result = append(result, map[string]string{
			"name": base,
			"url":  prefix + url.PathEscape(base),
		})
	}
	return result
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
	case "action", "actions":
		baseDir = filepath.Join(assetsDir, "actions")
		publicPrefix = "/assets/actions"
	case "ui":
		baseDir = filepath.Join(assetsDir, "ui")
		publicPrefix = "/assets/ui"
	case "places":
		baseDir = filepath.Join(assetsDir, "places")
		publicPrefix = "/assets/places"
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
	if category == "places" {
		items = deduplicatePlaces(items)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func listCardsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cardsDir := filepath.Join(resolvePath("./data"), "hero")
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

func listActionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	actionsDir := filepath.Join(resolvePath("./data"), "action")
	entries, err := os.ReadDir(actionsDir)
	if err != nil {
		if os.IsNotExist(err) {
			// Return empty list if directory doesn't exist yet
			json.NewEncoder(w).Encode([]string{})
			return
		}
		http.Error(w, "Failed to read actions directory", http.StatusInternalServerError)
		return
	}

	actions := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			actions = append(actions, entry.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(actions)
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

	cardPath := filepath.Join(resolvePath("./data"), "hero", slug, "hero.json")

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

	case http.MethodDelete:
		cardDir := filepath.Join(resolvePath("./data"), "hero", slug)
		if _, err := os.Stat(cardDir); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Card not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to access card", http.StatusInternalServerError)
			return
		}
		if err := os.RemoveAll(cardDir); err != nil {
			http.Error(w, "Failed to delete card", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
