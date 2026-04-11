package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
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
	HpBarScale      float64                       `json:"hp_bar_scale"`
	HpBarCurrent    int                           `json:"hp_bar_current"`
	HpBarMax        int                           `json:"hp_bar_max"`
	HpBarHue        float64                       `json:"hp_bar_hue"`
	HpBarFontSize   float64                       `json:"hp_bar_font_size,omitempty"`
	Lore            string                        `json:"lore"`
	Stats           map[string]interface{}        `json:"stats"`
	Audio           map[string]string             `json:"audio"`
	Pose            map[string]interface{}        `json:"pose"`
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
	NameScale       float64          `json:"name_scale"`
	TextShadowColor string           `json:"text_shadow_color"`
	TextShadowSize  float64          `json:"text_shadow_size,omitempty"`
	Tint            string           `json:"tint"`
	Description     string           `json:"description"`
	Cost            int              `json:"cost"`
	Element         ElementList      `json:"element"`
	TargetRule      string           `json:"target_rule"`
	Targeting       *ActionTargeting `json:"targeting,omitempty"`
	VisibleLayers   map[string]bool  `json:"visible_layers,omitempty"`
	Gameplay        *ActionGameplay   `json:"gameplay,omitempty"`
}

type ActionGameplay struct {
	CastingTimeMs  int     `json:"casting_time_ms"`
	EffectKind     string  `json:"effect_kind"`
	BasePower      int     `json:"base_power"`
	StatusKind     *string `json:"status_kind,omitempty"`
	StatusDurationMs int   `json:"status_duration_ms,omitempty"`
	StatusValue    int     `json:"status_value,omitempty"`
}

type ActionTargeting struct {
	Side      string `json:"side"`
	Scope     string `json:"scope"`
	Selection string `json:"selection"`
	AllowSelf bool   `json:"allow_self,omitempty"`
	AllowDead bool   `json:"allow_dead,omitempty"`
}

type HeroActionOverride struct {
	TargetRule string           `json:"target_rule,omitempty"`
	Targeting  *ActionTargeting `json:"targeting,omitempty"`
}

// getFFmpegPath returns the path to ffmpeg, downloading it if necessary.
// If requiredCodec is non-empty, the returned ffmpeg must support that encoder.
var cachedFFmpegPaths sync.Map // codec -> path

func ffmpegHasCodec(ffmpegPath, codec string) bool {
	out, err := exec.Command(ffmpegPath, "-encoders").Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), codec)
}

func getFFmpegPath(requiredCodecs ...string) (string, error) {
	cacheKey := strings.Join(requiredCodecs, ",")
	if v, ok := cachedFFmpegPaths.Load(cacheKey); ok {
		return v.(string), nil
	}

	checkCodecs := func(p string) bool {
		for _, codec := range requiredCodecs {
			if !ffmpegHasCodec(p, codec) {
				return false
			}
		}
		return true
	}

	// Check local bin directory first (downloaded binary with full codec support)
	binName := "ffmpeg"
	if runtime.GOOS == "windows" {
		binName = "ffmpeg.exe"
	}
	localPath := filepath.Join("bin", binName)
	if _, err := os.Stat(localPath); err == nil {
		if checkCodecs(localPath) {
			cachedFFmpegPaths.Store(cacheKey, localPath)
			return localPath, nil
		}
	}
	// Fall back to system PATH
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		if checkCodecs(p) {
			cachedFFmpegPaths.Store(cacheKey, p)
			return p, nil
		}
	}
	// Download
	log.Println("ffmpeg not found or missing required codecs, downloading...")
	if err := downloadFFmpeg(localPath); err != nil {
		if len(requiredCodecs) > 0 {
			return "", fmt.Errorf("ffmpeg with codecs %v not available (system ffmpeg lacks them and download failed: %w)", requiredCodecs, err)
		}
		return "", fmt.Errorf("ffmpeg not found and download failed: %w", err)
	}
	if !checkCodecs(localPath) {
		return "", fmt.Errorf("ffmpeg does not support required codecs %v; try: brew reinstall ffmpeg", requiredCodecs)
	}
	cachedFFmpegPaths.Store(cacheKey, localPath)
	return localPath, nil
}

func downloadFFmpeg(targetPath string) error {
	var platform string
	switch runtime.GOOS {
	case "darwin":
		platform = "osx-64"
	case "linux":
		platform = "linux-64"
	case "windows":
		platform = "windows-64"
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	resp, err := http.Get("https://ffbinaries.com/api/v1/version/latest")
	if err != nil {
		return fmt.Errorf("failed to fetch ffmpeg info: %w", err)
	}
	defer resp.Body.Close()

	var versionInfo struct {
		Bin map[string]struct {
			FFmpeg string `json:"ffmpeg"`
		} `json:"bin"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&versionInfo); err != nil {
		return fmt.Errorf("failed to parse ffmpeg info: %w", err)
	}

	binInfo, ok := versionInfo.Bin[platform]
	if !ok || binInfo.FFmpeg == "" {
		return fmt.Errorf("no ffmpeg download for platform: %s", platform)
	}

	log.Printf("Downloading ffmpeg from %s...", binInfo.FFmpeg)
	dlResp, err := http.Get(binInfo.FFmpeg)
	if err != nil {
		return fmt.Errorf("failed to download ffmpeg: %w", err)
	}
	defer dlResp.Body.Close()

	zipData, err := io.ReadAll(dlResp.Body)
	if err != nil {
		return fmt.Errorf("failed to read ffmpeg download: %w", err)
	}

	zipReader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		return fmt.Errorf("failed to open zip: %w", err)
	}

	binName := "ffmpeg"
	if runtime.GOOS == "windows" {
		binName = "ffmpeg.exe"
	}

	for _, f := range zipReader.File {
		if filepath.Base(f.Name) == binName {
			rc, err := f.Open()
			if err != nil {
				return fmt.Errorf("failed to extract ffmpeg: %w", err)
			}
			defer rc.Close()

			os.MkdirAll(filepath.Dir(targetPath), 0755)
			out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
			if err != nil {
				return fmt.Errorf("failed to create ffmpeg binary: %w", err)
			}
			defer out.Close()

			if _, err := io.Copy(out, rc); err != nil {
				return fmt.Errorf("failed to write ffmpeg binary: %w", err)
			}

			log.Printf("ffmpeg downloaded to %s", targetPath)
			return nil
		}
	}

	return fmt.Errorf("ffmpeg binary not found in zip")
}

// Video conversion progress tracking
type convertTask struct {
	Progress int    `json:"progress"`
	Done     bool   `json:"done"`
	Error    string `json:"error,omitempty"`
	File     string `json:"file,omitempty"`
}

var convertTasks sync.Map
var previewInFlight sync.Map // tracks WebM preview generation in progress (key = webmPath)

func getVideoDuration(ffmpegBin, filePath string) float64 {
	cmd := exec.Command(ffmpegBin, "-i", filePath)
	output, _ := cmd.CombinedOutput()
	lines := string(output)
	idx := strings.Index(lines, "Duration: ")
	if idx < 0 {
		return 0
	}
	durStr := lines[idx+10:]
	if ci := strings.Index(durStr, ","); ci > 0 {
		durStr = durStr[:ci]
	}
	parts := strings.Split(strings.TrimSpace(durStr), ":")
	if len(parts) != 3 {
		return 0
	}
	hours, _ := strconv.ParseFloat(parts[0], 64)
	mins, _ := strconv.ParseFloat(parts[1], 64)
	secs, _ := strconv.ParseFloat(parts[2], 64)
	return hours*3600 + mins*60 + secs
}

func convertVideoToOGV(taskID, ffmpegBin, srcPath, dstPath string) {
	defer os.Remove(srcPath)

	duration := getVideoDuration(ffmpegBin, srcPath)

	cmd := exec.Command(ffmpegBin, "-y", "-i", srcPath,
		"-c:v", "libtheora", "-q:v", "7",
		"-c:a", "libvorbis", "-q:a", "4",
		"-progress", "pipe:1",
		dstPath)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		convertTasks.Store(taskID, &convertTask{Done: true, Error: "Failed to start conversion"})
		return
	}

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		convertTasks.Store(taskID, &convertTask{Done: true, Error: "Failed to start ffmpeg"})
		return
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "out_time_us=") {
			timeUs, _ := strconv.ParseFloat(strings.TrimPrefix(line, "out_time_us="), 64)
			if duration > 0 {
				pct := int(timeUs / (duration * 1_000_000) * 100)
				if pct > 99 {
					pct = 99
				}
				if pct < 0 {
					pct = 0
				}
				convertTasks.Store(taskID, &convertTask{Progress: pct})
			}
		}
	}

	if err := cmd.Wait(); err != nil {
		log.Printf("ffmpeg conversion failed: %s\nstderr: %s", err, stderrBuf.String())
		convertTasks.Store(taskID, &convertTask{Done: true, Error: fmt.Sprintf("Video conversion failed: %s", stderrBuf.String())})
		return
	}

	// Mark conversion done immediately; preview WebM will be generated on first request
	file := filepath.Base(dstPath)
	convertTasks.Store(taskID, &convertTask{Progress: 100, Done: true, File: file})

	// Generate preview .webm in background so it's cached for future requests
	go func() {
		generateWebMPreview("", dstPath)
	}()
}

// generateWebMPreview generates a .preview.webm file from an .ogv file.
// If taskID is non-empty, progress is tracked via convertTasks.
func generateWebMPreview(taskID, ogvPath string) {
	webmPath := ogvPath[:len(ogvPath)-4] + ".preview.webm"
	if _, alreadyRunning := previewInFlight.LoadOrStore(webmPath, true); alreadyRunning {
		if taskID != "" {
			convertTasks.Store(taskID, &convertTask{Done: true, File: filepath.Base(ogvPath)})
		}
		return
	}
	defer previewInFlight.Delete(webmPath)

	ffmpegBin, err := getFFmpegPath()
	if err != nil {
		if taskID != "" {
			convertTasks.Store(taskID, &convertTask{Done: true, Error: "ffmpeg not available"})
		}
		return
	}

	if taskID == "" {
		// Fire-and-forget mode (no progress tracking)
		cmd := exec.Command(ffmpegBin, "-y", "-i", ogvPath,
			"-c:v", "libvpx", "-crf", "10", "-b:v", "2M",
			"-an",
			webmPath)
		if output, err := cmd.CombinedOutput(); err != nil {
			log.Printf("Preview generation failed: %v\n%s", err, output)
		} else {
			log.Printf("Preview generated: %s", webmPath)
		}
		return
	}

	// Tracked mode with progress
	duration := getVideoDuration(ffmpegBin, ogvPath)

	cmd := exec.Command(ffmpegBin, "-y", "-i", ogvPath,
		"-c:v", "libvpx", "-crf", "10", "-b:v", "2M",
		"-an",
		"-progress", "pipe:1",
		webmPath)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		convertTasks.Store(taskID, &convertTask{Done: true, Error: "Failed to start preview generation"})
		return
	}

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		convertTasks.Store(taskID, &convertTask{Done: true, Error: "Failed to start ffmpeg"})
		return
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "out_time_us=") {
			timeUs, _ := strconv.ParseFloat(strings.TrimPrefix(line, "out_time_us="), 64)
			if duration > 0 {
				pct := int(timeUs / (duration * 1_000_000) * 100)
				if pct > 99 {
					pct = 99
				}
				if pct < 0 {
					pct = 0
				}
				convertTasks.Store(taskID, &convertTask{Progress: pct})
			}
		}
	}

	if err := cmd.Wait(); err != nil {
		log.Printf("WebM preview generation failed: %s\nstderr: %s", err, stderrBuf.String())
		convertTasks.Store(taskID, &convertTask{Done: true, Error: fmt.Sprintf("Preview generation failed: %s", stderrBuf.String())})
		return
	}

	log.Printf("Preview generated: %s", webmPath)
	convertTasks.Store(taskID, &convertTask{Progress: 100, Done: true, File: filepath.Base(ogvPath)})
}

func convertStatusHandler(w http.ResponseWriter, r *http.Request) {
	taskID := strings.TrimPrefix(r.URL.Path, "/api/animap-convert-status/")
	if taskID == "" {
		http.Error(w, "Missing task ID", http.StatusBadRequest)
		return
	}

	val, ok := convertTasks.Load(taskID)
	if !ok {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}

	task := val.(*convertTask)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)

	if task.Done {
		convertTasks.Delete(taskID)
	}
}

// animapPreviewHandler serves .ogv video files transcoded to .webm for browser preview.
// Path: /api/animap-preview/{slug}/{file}
// Caches the .webm alongside the .ogv on disk.
func animapPreviewHandler(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/animap-preview/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[1] == "" {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}
	slug := filepath.Base(parts[0])
	file := filepath.Base(parts[1])

	animapDir := filepath.Join(resolvePath("./data"), "animap", slug)
	srcPath := filepath.Join(animapDir, file)

	// Only transcode .ogv files
	if !strings.HasSuffix(strings.ToLower(file), ".ogv") {
		http.ServeFile(w, r, srcPath)
		return
	}

	// Check if source exists
	srcInfo, err := os.Stat(srcPath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	// Cached .webm path
	webmPath := srcPath[:len(srcPath)-4] + ".preview.webm"

	// Serve cached version if it exists and is newer than source
	if webmInfo, err := os.Stat(webmPath); err == nil && webmInfo.ModTime().After(srcInfo.ModTime()) {
		http.ServeFile(w, r, webmPath)
		return
	}

	// Start background WebM generation if not already in progress
	if _, alreadyRunning := previewInFlight.LoadOrStore(webmPath, true); !alreadyRunning {
		go func() {
			defer previewInFlight.Delete(webmPath)
			ffmpegBin, err := getFFmpegPath()
			if err != nil {
				log.Printf("Preview generation skipped (no ffmpeg): %v", err)
				return
			}
			cmd := exec.Command(ffmpegBin, "-y", "-i", srcPath,
				"-c:v", "libvpx", "-crf", "10", "-b:v", "2M",
				"-an",
				webmPath)
			if output, err := cmd.CombinedOutput(); err != nil {
				log.Printf("Preview transcode failed: %v\n%s", err, output)
			} else {
				log.Printf("Preview generated: %s", webmPath)
			}
		}()
	}

	// Serve OGV directly while WebM is being generated
	http.ServeFile(w, r, srcPath)
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
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Prevent caching index.html so rebuilds are picked up without hard refresh
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fs.ServeHTTP(w, r)
	}))

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
	http.HandleFunc("/api/animaps", listAnimapsHandler)
	http.HandleFunc("/api/animap-categories", animapCategoriesHandler)
	http.HandleFunc("/api/animap/", animapHandler)
	http.HandleFunc("/api/animap-layer/", animapLayerHandler)
	http.HandleFunc("/api/animap-convert-status/", convertStatusHandler)
	http.HandleFunc("/api/animap-preview/", animapPreviewHandler)
	http.HandleFunc("/api/scene/", sceneLayoutHandler)
	http.HandleFunc("/api/assets/", assetsListHandler)
	assetsDir := resolvePath("./assets")
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(assetsDir))))

	// Pre-check ffmpeg availability at startup (downloads if needed)
	go func() {
		if p, err := getFFmpegPath(); err != nil {
			log.Printf("WARNING: ffmpeg not available: %v", err)
		} else {
			_ = p
		}
	}()

	port := "8080"
	fmt.Printf("Server starting on http://localhost:%s\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

type AnimapLayer struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Type       string   `json:"type"`
	File       string   `json:"file"`
	Visible    bool     `json:"visible"`
	Locked     *bool    `json:"locked,omitempty"`
	Opacity    *float64 `json:"opacity,omitempty"`
	X          *float64 `json:"x,omitempty"`
	Y          *float64 `json:"y,omitempty"`
	Width      *float64 `json:"width,omitempty"`
	Height     *float64 `json:"height,omitempty"`
	Scale      *float64 `json:"scale,omitempty"`
	Text       string   `json:"text,omitempty"`
	FontSize   *float64 `json:"font_size,omitempty"`
	Color      string   `json:"color,omitempty"`
	TextAlign  string   `json:"text_align,omitempty"`
	Loop       *bool    `json:"loop,omitempty"`
	LoopStart  *float64 `json:"loop_start,omitempty"`
	LoopEnd    *float64 `json:"loop_end,omitempty"`
	Targets    []string `json:"targets,omitempty"`
	Hue        *float64 `json:"hue,omitempty"`
	Saturation *float64 `json:"saturation,omitempty"`
	Lightness  *float64 `json:"lightness,omitempty"`
	Brightness *float64 `json:"brightness,omitempty"`
	Contrast   *float64 `json:"contrast,omitempty"`
}

type AnimapTransition struct {
	Mode       string `json:"mode"`
	DurationMs int    `json:"duration_ms,omitempty"`
}

type AnimapState struct {
	ID              string                            `json:"id"`
	Name            string                            `json:"name"`
	LayerOverrides  map[string]map[string]interface{} `json:"layer_overrides,omitempty"`
	TransitionsTo   map[string]AnimapTransition       `json:"transitions_to,omitempty"`
	TransitionsFrom map[string]AnimapTransition       `json:"transitions_from,omitempty"`
}

type AnimapConfig struct {
	Name   string        `json:"name"`
	Width  int           `json:"width"`
	Height int           `json:"height"`
	Layers []AnimapLayer `json:"layers"`
	States []AnimapState `json:"states,omitempty"`
}

func normalizeAnimapConfig(config AnimapConfig) AnimapConfig {
	config.Layers = normalizeAnimapLayers(config.Layers)
	return config
}

func normalizeAnimapLayers(layers []AnimapLayer) []AnimapLayer {
	normalized := make([]AnimapLayer, len(layers))
	for i, layer := range layers {
		if layer.Type == "text" {
			if layer.Text == "" {
				layer.Text = layer.Name
			}
			if layer.FontSize == nil {
				v := 96.0
				layer.FontSize = &v
			}
			if layer.Color == "" {
				layer.Color = "#ffffff"
			}
			if layer.TextAlign == "" {
				layer.TextAlign = "left"
			}
			if layer.Width == nil {
				v := 480.0
				layer.Width = &v
			}
			if layer.Height == nil {
				v := 160.0
				layer.Height = &v
			}
		}
		normalized[i] = layer
	}
	return normalized
}

func listAnimapsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	animapDir := filepath.Join(resolvePath("./data"), "animap")
	entries, err := os.ReadDir(animapDir)
	if err != nil {
		if os.IsNotExist(err) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode([]string{})
			return
		}
		http.Error(w, "Failed to read animaps directory", http.StatusInternalServerError)
		return
	}

	animaps := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			animaps = append(animaps, entry.Name())
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(animaps)
}

func animapCategoriesHandler(w http.ResponseWriter, r *http.Request) {
	categoriesPath := filepath.Join(resolvePath("./data"), "animap", "categories.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(categoriesPath)
		if err != nil {
			if os.IsNotExist(err) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte("{}"))
				return
			}
			http.Error(w, "Failed to read categories", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		var categories map[string][]string
		if err := json.NewDecoder(r.Body).Decode(&categories); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		dir := filepath.Dir(categoriesPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		file, err := os.Create(categoriesPath)
		if err != nil {
			http.Error(w, "Failed to open file for writing", http.StatusInternalServerError)
			return
		}
		defer file.Close()

		encoder := json.NewEncoder(file)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(categories); err != nil {
			http.Error(w, "Failed to write JSON", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func animapHandler(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimPrefix(r.URL.Path, "/api/animap/")
	if slug == "" {
		http.Error(w, "Missing animap slug", http.StatusBadRequest)
		return
	}
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}

	animapPath := filepath.Join(resolvePath("./data"), "animap", slug, "animap.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(animapPath)
		if err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Animap not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to read animap data", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)

	case http.MethodPost:
		var config AnimapConfig
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}
		config = normalizeAnimapConfig(config)

		dir := filepath.Dir(animapPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		file, err := os.Create(animapPath)
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

		// Sync to game/data/ for game.exe
		syncAnimapToGame(slug)

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "saved"})

	case http.MethodDelete:
		animapDir := filepath.Join(resolvePath("./data"), "animap", slug)
		if _, err := os.Stat(animapDir); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "Animap not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to access animap", http.StatusInternalServerError)
			return
		}
		if err := os.RemoveAll(animapDir); err != nil {
			http.Error(w, "Failed to delete animap", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func animapLayerHandler(w http.ResponseWriter, r *http.Request) {
	// Path: /api/animap-layer/{slug}/{layerId}
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/animap-layer/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		http.Error(w, "Invalid animap layer path", http.StatusBadRequest)
		return
	}
	slug := parts[0]
	layerId := parts[1]
	if strings.Contains(slug, "..") || strings.Contains(slug, "/") || strings.Contains(slug, "\\") {
		http.Error(w, "Invalid slug", http.StatusBadRequest)
		return
	}
	if strings.Contains(layerId, "..") || strings.Contains(layerId, "/") || strings.Contains(layerId, "\\") {
		http.Error(w, "Invalid layer ID", http.StatusBadRequest)
		return
	}

	animapDir := filepath.Join(resolvePath("./data"), "animap", slug)

	switch r.Method {
	case http.MethodGet:
		// Find file matching layerId with any extension
		matches, _ := filepath.Glob(filepath.Join(animapDir, layerId+".*"))
		if len(matches) == 0 {
			http.Error(w, "Layer file not found", http.StatusNotFound)
			return
		}
		data, err := os.ReadFile(matches[0])
		if err != nil {
			http.Error(w, "Failed to read layer file", http.StatusInternalServerError)
			return
		}
		contentType := http.DetectContentType(data)
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "no-store")
		w.Write(data)

	case http.MethodPost:
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
		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read upload", http.StatusBadRequest)
			return
		}
		if len(data) == 0 {
			http.Error(w, "Empty file", http.StatusBadRequest)
			return
		}

		if err := os.MkdirAll(animapDir, 0755); err != nil {
			http.Error(w, "Failed to create directory", http.StatusInternalServerError)
			return
		}

		// Use layer name as filename base if provided, otherwise fall back to layerId
		baseName := layerId
		if name := r.FormValue("name"); name != "" {
			baseName = name
		}

		// Detect if video by content type or file extension
		ext := strings.ToLower(filepath.Ext(header.Filename))
		isVideo := ext == ".ogv" || ext == ".mp4" || ext == ".webm" || ext == ".mov" || ext == ".avi" || ext == ".mkv"
		contentType := http.DetectContentType(data)
		if strings.HasPrefix(contentType, "video/") {
			isVideo = true
		}

		// Remove old file if specified
		if oldFile := r.FormValue("old_file"); oldFile != "" {
			oldFile = filepath.Base(oldFile)
			os.Remove(filepath.Join(animapDir, oldFile))
		}
		// Remove old files with this baseName
		oldFiles, _ := filepath.Glob(filepath.Join(animapDir, baseName+".*"))
		for _, f := range oldFiles {
			os.Remove(f)
		}

		if isVideo {
			if ext == "" {
				ext = ".ogv"
			}
			if ext != ".ogv" {
				// Convert non-OGV videos to OGV via ffmpeg (async with progress)
				ffmpegBin, err := getFFmpegPath("libtheora", "libvorbis")
				if err != nil {
					http.Error(w, "ffmpeg not available: "+err.Error(), http.StatusInternalServerError)
					return
				}
				tmpSrc := filepath.Join(animapDir, baseName+"_tmp"+ext)
				if err := os.WriteFile(tmpSrc, data, 0644); err != nil {
					http.Error(w, "Failed to save temp video", http.StatusInternalServerError)
					return
				}
				target := filepath.Join(animapDir, baseName+".ogv")
				taskID := fmt.Sprintf("%d", time.Now().UnixNano())
				convertTasks.Store(taskID, &convertTask{Progress: 0})
				go convertVideoToOGV(taskID, ffmpegBin, tmpSrc, target)
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"status": "converting", "task": taskID})
			} else {
				target := filepath.Join(animapDir, baseName+".ogv")
				if err := os.WriteFile(target, data, 0644); err != nil {
					http.Error(w, "Failed to save video", http.StatusInternalServerError)
					return
				}
				// Sync to game/data/ for game.exe
				syncAnimapToGame(slug)
				// Generate WebM preview with progress tracking
				taskID := fmt.Sprintf("%d", time.Now().UnixNano())
				convertTasks.Store(taskID, &convertTask{Progress: 0})
				go generateWebMPreview(taskID, target)
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"status": "converting", "task": taskID})
			}
		} else {
			// Image/mask — convert to webp
			target := filepath.Join(animapDir, baseName+".webp")
			if err := saveAsWebP(data, target); err != nil {
				http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
				return
			}
			// Sync to game/data/ for game.exe
			syncAnimapToGame(slug)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "saved", "file": baseName + ".webp"})
		}

	case http.MethodDelete:
		oldFiles, _ := filepath.Glob(filepath.Join(animapDir, layerId+".*"))
		for _, f := range oldFiles {
			os.Remove(f)
		}
		// Also remove preview files (e.g. name.preview.webm)
		previewFiles, _ := filepath.Glob(filepath.Join(animapDir, layerId+".preview.*"))
		for _, f := range previewFiles {
			os.Remove(f)
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

type CardMaskPayload struct {
	MaskBg string `json:"mask_bg"`
	MaskFg string `json:"mask_fg"`
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
	if layer != "char-bg" && layer != "char-fg" && layer != "card" {
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

	ffmpegBin, err := getFFmpegPath("libwebp")
	if err != nil {
		return fmt.Errorf("ffmpeg not available: %v", err)
	}

	// Write input to temp file
	tmpFile := targetPath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %v", err)
	}
	defer os.Remove(tmpFile)

	cmd := exec.Command(ffmpegBin, "-y", "-i", tmpFile, "-c:v", "libwebp", "-quality", "90", "-f", "webp", targetPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg webp conversion failed: %v\n%s", err, output)
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

		// Merge with existing config to preserve gameplay data
		existingData, err := os.ReadFile(actionPath)
		if err == nil && len(existingData) > 0 {
			var existing ActionConfig
			if json.Unmarshal(existingData, &existing) == nil {
				// Preserve existing gameplay if new config doesn't have valid gameplay data
				if config.Gameplay == nil || config.Gameplay.CastingTimeMs == 0 {
					config.Gameplay = existing.Gameplay
				}
			}
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

// syncAnimapToGame copies an animap folder from data/animap/{slug} to game/data/animap/{slug}
// This ensures game.exe can access the animap assets after editing in editor.exe
func syncAnimapToGame(slug string) {
	srcDir := filepath.Join(resolvePath("./data"), "animap", slug)
	dstDir := filepath.Join(resolvePath("./game/data"), "animap", slug)

	// Check if source exists
	if _, err := os.Stat(srcDir); err != nil {
		return
	}

	// Create destination directory
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		return
	}

	// Copy all files from source to destination
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue // Skip subdirectories
		}
		srcFile := filepath.Join(srcDir, entry.Name())
		dstFile := filepath.Join(dstDir, entry.Name())
		data, err := os.ReadFile(srcFile)
		if err != nil {
			continue
		}
		os.WriteFile(dstFile, data, 0644)
	}
}

// syncAnimapsInLayout syncs all animap folders referenced in a scene layout to game/data/
func syncAnimapsInLayout(layout map[string]interface{}) {
	boxes, ok := layout["boxes"].(map[string]interface{})
	if !ok {
		return
	}

	var syncBoxMap func(map[string]interface{})
	syncBoxMap = func(boxMap map[string]interface{}) {
		if animapSlug, ok := boxMap["animapSlug"].(string); ok && animapSlug != "" {
			syncAnimapToGame(animapSlug)
		}
	}

	for _, box := range boxes {
		boxMap, ok := box.(map[string]interface{})
		if !ok {
			continue
		}

		if _, hasAnimap := boxMap["animapSlug"]; hasAnimap {
			syncBoxMap(boxMap)
			continue
		}

		for _, nested := range boxMap {
			nestedMap, ok := nested.(map[string]interface{})
			if !ok {
				continue
			}
			syncBoxMap(nestedMap)
		}
	}
}

// sceneLayoutHandler handles /api/scene/{slug}/layout — per-scene layout files.
func sceneLayoutHandler(w http.ResponseWriter, r *http.Request) {
	// Parse: /api/scene/{slug}/layout
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/scene/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[1] != "layout" || parts[0] == "" {
		http.Error(w, "Expected /api/scene/{slug}/layout", http.StatusBadRequest)
		return
	}
	slug := parts[0]
	layoutPath := filepath.Join(resolvePath("./data"), "scene", slug, "layout.json")

	switch r.Method {
	case http.MethodGet:
		data, err := os.ReadFile(layoutPath)
		if err != nil {
			if os.IsNotExist(err) {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"background":"","boxes":{}}`))
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

		// Also sync to game/data/ for game.exe
		gameLayoutPath := filepath.Join(resolvePath("./game/data"), "scene", slug, "layout.json")
		if err := os.MkdirAll(filepath.Dir(gameLayoutPath), 0755); err == nil {
			if gameFile, gameErr := os.Create(gameLayoutPath); gameErr == nil {
				gameEncoder := json.NewEncoder(gameFile)
				gameEncoder.SetIndent("", "  ")
				gameEncoder.Encode(layout)
				gameFile.Close()
			}
		}

		// Sync referenced animaps to game/data/
		if layoutMap, ok := layout.(map[string]interface{}); ok {
			syncAnimapsInLayout(layoutMap)
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
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ogv":
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
		case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ogv":
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
