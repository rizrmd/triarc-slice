package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

func main() {
	sessionSlot := flag.Int("session-slot", 1, "Session slot number to pass to Godot")
	flag.Parse()

	gameDir := "game"
	if _, err := os.Stat(gameDir); os.IsNotExist(err) {
		// Try looking in parent directory if running from inside bin or similar
		if _, err := os.Stat("../" + gameDir); err == nil {
			gameDir = "../" + gameDir
		} else {
			fmt.Println("Error: 'game' directory not found.")
			fmt.Println("Please run this executable from the project root.")
			pressEnterToExit()
			os.Exit(1)
		}
	}

	godotExe := findGodot()
	if godotExe == "" {
		fmt.Println("Error: Godot executable not found.")
		fmt.Println("Please ensure Godot 4 is installed and added to your PATH,")
		fmt.Println("or placed in standard locations (/Applications on macOS, C:\\Program Files on Windows).")
		pressEnterToExit()
		os.Exit(1)
	}

	fmt.Printf("Found Godot: %s\n", godotExe)

	setupLinks(gameDir)

	// Ensure Effekseer plugin native binaries are present
	ensureEffekseerPlugin(gameDir)

	// Clean stale Android build artifacts that cause UID duplicate warnings
	cleanAndroidBuildArtifacts(gameDir)

	// Invalidate Godot import cache for changed assets only
	invalidateChangedAssets(gameDir)

	// Always ensure assets are up to date
	fmt.Println("Verifying project assets...")

	// Run headless import
	// Use --path explicitly instead of setting Dir for clarity, though both work
	cmd := exec.Command(godotExe, "--headless", "--path", gameDir, "--editor", "--quit")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		fmt.Printf("Warning: Asset verification exited with error: %v\n", err)
		// Don't exit, try running anyway
	} else {
		fmt.Println("Assets verification completed.")
	}

	fmt.Println("Launching Game...")
	if *sessionSlot < 1 {
		fmt.Printf("Invalid session slot %d, defaulting to 1.\n", *sessionSlot)
		*sessionSlot = 1
	}
	runArgs := []string{"--path", gameDir, "--", fmt.Sprintf("--session-slot=%d", *sessionSlot)}
	runCmd := exec.Command(godotExe, runArgs...)
	configureChildProcess(runCmd)
	
	// For GUI apps, we might want to detach or just wait
	// Forward output for debugging
	runCmd.Stdout = os.Stdout
	runCmd.Stderr = os.Stderr
	
	if err := runCmd.Start(); err != nil {
		fmt.Printf("Error starting game: %v\n", err)
		pressEnterToExit()
		os.Exit(1)
	}

	installShutdownHandler(runCmd)
	
	// Wait for it to finish? Or just exit launcher?
	// Usually launchers wait.
	if err := runCmd.Wait(); err != nil {
		fmt.Printf("Game process exited with error: %v\n", err)
	}
}

func findGodot() string {
	// 1. Check PATH
	path, err := exec.LookPath("godot")
	if err == nil {
		return path
	}
	
	// 2. Check common locations based on OS
	switch runtime.GOOS {
	case "darwin": // macOS
		candidates := []string{
			"/Applications/Godot.app/Contents/MacOS/Godot",
			"/Applications/Godot_mono.app/Contents/MacOS/Godot",
		}
		
		// Check user applications
		homeDir, err := os.UserHomeDir()
		if err == nil {
			candidates = append(candidates, 
				filepath.Join(homeDir, "Applications/Godot.app/Contents/MacOS/Godot"),
				filepath.Join(homeDir, "Applications/Godot_mono.app/Contents/MacOS/Godot"),
			)
		}

		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c
			}
		}
		
		// Try to find any Godot*.app in /Applications
		matches, _ := filepath.Glob("/Applications/Godot*.app/Contents/MacOS/Godot")
		if len(matches) > 0 {
			return matches[0]
		}
		
		// Try to find any Godot*.app in ~/Applications
		if homeDir != "" {
			matches, _ = filepath.Glob(filepath.Join(homeDir, "Applications/Godot*.app/Contents/MacOS/Godot"))
			if len(matches) > 0 {
				return matches[0]
			}
		}

	case "windows":
		// Common installation directories
		programFiles := os.Getenv("ProgramFiles")
		if programFiles == "" {
			programFiles = "C:\\Program Files"
		}
		programFilesX86 := os.Getenv("ProgramFiles(x86)")
		if programFilesX86 == "" {
			programFilesX86 = "C:\\Program Files (x86)"
		}
		
		searchPaths := []string{
			filepath.Join(programFiles, "Godot"),
			filepath.Join(programFilesX86, "Godot"),
			"C:\\Godot",
		}

		for _, dir := range searchPaths {
			// Check for exact "godot.exe"
			if _, err := os.Stat(filepath.Join(dir, "godot.exe")); err == nil {
				return filepath.Join(dir, "godot.exe")
			}
			// Check for versioned executables like "Godot_v4.2.1-stable_win64.exe"
			matches, _ := filepath.Glob(filepath.Join(dir, "Godot_v*.exe"))
			if len(matches) > 0 {
				// Return the first match, or maybe the latest version if we were fancy
				return matches[0]
			}
		}
	}
	
	return ""
}

func pressEnterToExit() {
	fmt.Println("\nPress Enter to exit...")
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func setupLinks(gameDir string) {
	absGameDir, err := filepath.Abs(gameDir)
	if err != nil {
		fmt.Printf("Warning: Failed to resolve absolute path for game directory: %v\n", err)
		return
	}

	rootDir := filepath.Dir(absGameDir)
	dirsToLink := []string{"assets", "data"}

	for _, dirName := range dirsToLink {
		sourcePath := filepath.Join(rootDir, dirName)
		linkPath := filepath.Join(absGameDir, dirName)

		info, err := os.Lstat(linkPath)
		if err == nil {
			// Check if it's a git symlink placeholder (regular file) on Windows
			if runtime.GOOS == "windows" && info.Mode().IsRegular() {
				fmt.Printf("Replacing git symlink placeholder with junction: %s\n", linkPath)
				if err := os.Remove(linkPath); err != nil {
					fmt.Printf("Error removing placeholder: %v\n", err)
					continue
				}
			} else {
				// Already exists and is not a placeholder file, skip
				continue
			}
		}

		fmt.Printf("Creating link: %s -> %s\n", linkPath, sourcePath)
		createLink(sourcePath, linkPath)
	}
}

func createLink(source, target string) {
	if runtime.GOOS == "windows" {
		// Use mklink /J for directory junction
		// syntax: mklink /J <Link> <Target>
		cmd := exec.Command("cmd", "/c", "mklink", "/J", target, source)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Printf("Error creating junction: %v\n", err)
		}
	} else {
		// Use os.Symlink for Unix
		// os.Symlink(oldname, newname)
		if err := os.Symlink(source, target); err != nil {
			fmt.Printf("Error creating symlink: %v\n", err)
		}
	}
}

func cleanAndroidBuildArtifacts(gameDir string) {
	dirs := []string{
		filepath.Join(gameDir, "android", "build", "build"),
		filepath.Join(gameDir, "android", "build", "src"),
	}
	for _, dir := range dirs {
		if _, err := os.Stat(dir); err == nil {
			fmt.Println("Cleaning stale Android build artifacts:", dir)
			os.RemoveAll(dir)
		}
	}
}

// assetManifest maps relative file paths to their last-seen mod time (UnixNano).
type assetManifest map[string]int64

func manifestPath(gameDir string) string {
	return filepath.Join(gameDir, ".godot", "asset_manifest.json")
}

func loadManifest(gameDir string) assetManifest {
	data, err := os.ReadFile(manifestPath(gameDir))
	if err != nil {
		return nil
	}
	var m assetManifest
	if json.Unmarshal(data, &m) != nil {
		return nil
	}
	return m
}

func saveManifest(gameDir string, m assetManifest) {
	data, err := json.Marshal(m)
	if err != nil {
		return
	}
	os.MkdirAll(filepath.Dir(manifestPath(gameDir)), 0755)
	os.WriteFile(manifestPath(gameDir), data, 0644)
}

// invalidateChangedAssets compares current asset mod times against a stored
// manifest and removes the Godot .import sidecar + cached .ctex/.sample files
// only for assets that changed, were added, or were deleted.
func invalidateChangedAssets(gameDir string) {
	old := loadManifest(gameDir)
	current := make(assetManifest)
	importedDir := filepath.Join(gameDir, ".godot", "imported")

	// Asset directories to track (resolved through symlinks via gameDir)
	assetRoots := []string{
		filepath.Join(gameDir, "data"),
		filepath.Join(gameDir, "assets"),
	}

	// Build current manifest
	for _, root := range assetRoots {
		filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}
			ext := strings.ToLower(filepath.Ext(path))
			// Skip Godot-generated sidecar files
			if ext == ".import" || ext == ".uid" {
				return nil
			}
			rel, _ := filepath.Rel(gameDir, path)
			current[rel] = info.ModTime().UnixNano()
			return nil
		})
	}

	// First launch — no manifest yet, let Godot handle everything normally
	if old == nil {
		saveManifest(gameDir, current)
		return
	}

	var changed []string

	// Detect changed or new files
	for path, modTime := range current {
		if oldTime, exists := old[path]; !exists || oldTime != modTime {
			changed = append(changed, path)
		}
	}
	// Detect deleted files
	for path := range old {
		if _, exists := current[path]; !exists {
			changed = append(changed, path)
		}
	}

	if len(changed) == 0 {
		return
	}

	fmt.Printf("Invalidating %d changed asset(s)...\n", len(changed))
	for _, rel := range changed {
		abs := filepath.Join(gameDir, rel)
		importFile := abs + ".import"

		// Parse the .import file to find the cached imported file path
		removeImportedFiles(importFile, importedDir)

		// Remove the .import sidecar so Godot reimports this asset
		os.Remove(importFile)
	}

	saveManifest(gameDir, current)
}

// removeImportedFiles reads a .import sidecar and deletes the corresponding
// files from .godot/imported/ (the .ctex/.sample and its .md5 companion).
func removeImportedFiles(importFile string, importedDir string) {
	data, err := os.ReadFile(importFile)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "path=") && !strings.HasPrefix(line, "dest_files=") {
			continue
		}
		// Extract filenames like "res://.godot/imported/foo.webp-abc123.ctex"
		for _, part := range strings.Split(line, "\"") {
			if !strings.Contains(part, ".godot/imported/") {
				continue
			}
			// Get just the filename after the last /
			base := filepath.Base(part)
			cached := filepath.Join(importedDir, base)
			os.Remove(cached)
			// Also remove the companion .md5 file
			md5File := filepath.Join(importedDir, strings.TrimSuffix(base, filepath.Ext(base))+".md5")
			os.Remove(md5File)
		}
	}
}

const effekseerVersion = "1.70e.10"

// effekseerBinaryPath returns the expected native library path for the current platform.
func effekseerBinaryPath(gameDir string) string {
	base := filepath.Join(gameDir, "addons", "effekseer", "bin")
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(base, "macos", "libeffekseer.framework")
	case "windows":
		switch runtime.GOARCH {
		case "arm64":
			return filepath.Join(base, "windows", "libeffekseer.arm64.dll")
		case "386":
			return filepath.Join(base, "windows", "libeffekseer.x86_32.dll")
		default:
			return filepath.Join(base, "windows", "libeffekseer.x86_64.dll")
		}
	case "linux":
		if runtime.GOARCH == "386" {
			return filepath.Join(base, "linux", "libeffekseer.x86_32.so")
		}
		return filepath.Join(base, "linux", "libeffekseer.x86_64.so")
	}
	return filepath.Join(base, "unknown")
}

func ensureEffekseerPlugin(gameDir string) {
	binPath := effekseerBinaryPath(gameDir)
	if _, err := os.Stat(binPath); err == nil {
		return // already installed
	}

	fmt.Println("Effekseer plugin binaries not found, downloading...")

	// Version "1.70e.10" -> zip slug "170e_10" (drop first dot, replace rest with _)
	slug := strings.Replace(effekseerVersion, ".", "", 1) // "170e.10"
	slug = strings.ReplaceAll(slug, ".", "_")              // "170e_10"
	zipName := "EffekseerForGodot4-" + slug + ".zip"
	url := "https://github.com/effekseer/EffekseerForGodot4/releases/download/" + effekseerVersion + "/" + zipName

	fmt.Printf("Downloading from %s\n", url)
	resp, err := http.Get(url)
	if err != nil {
		fmt.Printf("Error downloading Effekseer plugin: %v\n", err)
		fmt.Println("The game may not render particle effects correctly.")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fmt.Printf("Error downloading Effekseer plugin: HTTP %d\n", resp.StatusCode)
		fmt.Println("The game may not render particle effects correctly.")
		return
	}

	zipData, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("Error reading Effekseer download: %v\n", err)
		return
	}

	zipReader, err := zip.NewReader(bytes.NewReader(zipData), int64(len(zipData)))
	if err != nil {
		fmt.Printf("Error opening Effekseer zip: %v\n", err)
		return
	}

	// Extract files under addons/effekseer/bin/ into gameDir/addons/effekseer/bin/
	extracted := 0
	for _, f := range zipReader.File {
		// Zip entries look like "addons/effekseer/bin/macos/..." or similar
		idx := strings.Index(f.Name, "addons/effekseer/bin/")
		if idx < 0 {
			continue
		}
		relPath := f.Name[idx:] // "addons/effekseer/bin/..."
		targetPath := filepath.Join(gameDir, relPath)

		if f.FileInfo().IsDir() {
			os.MkdirAll(targetPath, 0755)
			continue
		}

		os.MkdirAll(filepath.Dir(targetPath), 0755)
		rc, err := f.Open()
		if err != nil {
			fmt.Printf("Error extracting %s: %v\n", relPath, err)
			continue
		}

		out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			fmt.Printf("Error creating %s: %v\n", targetPath, err)
			continue
		}

		io.Copy(out, rc)
		out.Close()
		rc.Close()
		extracted++
	}

	if extracted > 0 {
		fmt.Printf("Effekseer plugin installed (%d files extracted).\n", extracted)
	} else {
		fmt.Println("Warning: No Effekseer binary files found in the downloaded archive.")
	}
}

func installShutdownHandler(cmd *exec.Cmd) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)

	go func() {
		<-signals
		terminateChildProcess(cmd)
		os.Exit(0)
	}()
}
