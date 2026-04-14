package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var cachedFFmpegPaths sync.Map // codec -> path
var repoRoot string
var dataRoot string
var distRoot string
var cacheRoot string

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
	localPath := filepath.Join(repoRoot, "bin", binName)
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

var conversionLocks sync.Map // path -> *sync.Mutex

func getConvertedAsset(originalPath string) (string, string, error) {
	ext := strings.ToLower(filepath.Ext(originalPath))

	if ext == ".wav" {
		rel, err := filepath.Rel(dataRoot, originalPath)
		if err != nil || strings.HasPrefix(rel, "..") {
			return "", "", fmt.Errorf("invalid data path")
		}
		target := filepath.Join(cacheRoot, strings.TrimSuffix(rel, ".wav")+".mp3")

		lockObj, _ := conversionLocks.LoadOrStore(target, &sync.Mutex{})
		lock := lockObj.(*sync.Mutex)
		lock.Lock()
		defer lock.Unlock()

		if _, err := os.Stat(target); err == nil {
			return target, "audio/mpeg", nil
		}

		log.Printf("Converting %s to mp3...", originalPath)
		ffmpeg, err := getFFmpegPath("libmp3lame")
		if err != nil {
			return "", "", err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", "", err
		}
		cmd := exec.Command(ffmpeg, "-y", "-i", originalPath, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "128k", target)
		if output, err := cmd.CombinedOutput(); err != nil {
			return "", "", fmt.Errorf("ffmpeg error: %v\n%s", err, output)
		}
		return target, "audio/mpeg", nil

	} else if ext == ".ogv" {
		rel, err := filepath.Rel(dataRoot, originalPath)
		if err != nil || strings.HasPrefix(rel, "..") {
			return "", "", fmt.Errorf("invalid data path")
		}
		target := filepath.Join(cacheRoot, strings.TrimSuffix(rel, ".ogv")+".webm")

		lockObj, _ := conversionLocks.LoadOrStore(target, &sync.Mutex{})
		lock := lockObj.(*sync.Mutex)
		lock.Lock()
		defer lock.Unlock()

		if _, err := os.Stat(target); err == nil {
			return target, "video/webm", nil
		}

		log.Printf("Converting %s to webm...", originalPath)
		ffmpeg, err := getFFmpegPath("libvpx")
		if err != nil {
			return "", "", err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", "", err
		}

		// -crf 10 -b:v 2M matches editor preview generation
		cmd := exec.Command(ffmpeg, "-y", "-i", originalPath, "-c:v", "libvpx", "-crf", "10", "-b:v", "2M", "-an", target)
		if output, err := cmd.CombinedOutput(); err != nil {
			return "", "", fmt.Errorf("ffmpeg error: %v\n%s", err, output)
		}
		return target, "video/webm", nil
	}

	// return original
	return originalPath, "", nil
}

func dataHandler(w http.ResponseWriter, r *http.Request) {
	// Support CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")

	relPath := strings.TrimPrefix(r.URL.Path, "/data/")

	// Prevent directory traversal
	cleanedPath := filepath.Clean(relPath)
	if strings.HasPrefix(cleanedPath, "..") || strings.HasPrefix(cleanedPath, "/") {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	fullPath := filepath.Join(dataRoot, cleanedPath)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		http.NotFound(w, r)
		return
	}

	convertedPath, mimeType, err := getConvertedAsset(fullPath)
	if err != nil {
		log.Printf("Error converting asset %s: %v", fullPath, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}

	http.ServeFile(w, r, convertedPath)
}

func spaHandler(w http.ResponseWriter, r *http.Request) {
	// Support CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")

	cleanedPath := filepath.Clean(r.URL.Path)
	if cleanedPath == "/" {
		cleanedPath = "/index.html"
	}

	// Prevent directory traversal
	if strings.Contains(cleanedPath, "..") {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	// Remove leading slash for joining with relative dist path
	cleanedPath = strings.TrimPrefix(cleanedPath, "/")
	path := filepath.Join(distRoot, cleanedPath)

	info, err := os.Stat(path)
	if os.IsNotExist(err) || info.IsDir() {
		http.ServeFile(w, r, filepath.Join(distRoot, "index.html"))
		return
	}
	http.ServeFile(w, r, path)
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	repoRoot = filepath.Dir(exe)
	dataRoot = filepath.Join(repoRoot, "data")
	distRoot = filepath.Join(repoRoot, "game-web", "dist")
	cacheRoot = filepath.Join(repoRoot, ".cache", "game-web")

	http.HandleFunc("/data/", dataHandler)
	http.HandleFunc("/", spaHandler)

	// Pre-check ffmpeg availability at startup (downloads if needed)
	go func() {
		if p, err := getFFmpegPath(); err != nil {
			log.Printf("WARNING: ffmpeg not available: %v", err)
		} else {
			log.Printf("FFmpeg ready at %s", p)
		}
	}()

	ports := []string{"5460", "5461", "5462"}
	if p := os.Getenv("PORT"); p != "" {
		ports = []string{p}
	}

	var lastErr error
	for _, port := range ports {
		ln, err := net.Listen("tcp", ":"+port)
		if err != nil {
			lastErr = err
			continue
		}
		log.Printf("Server starting on http://localhost:%s\n", port)
		if err := http.Serve(ln, nil); err != nil {
			log.Fatal(err)
		}
		return
	}

	if lastErr != nil {
		log.Fatal(lastErr)
	}
}
