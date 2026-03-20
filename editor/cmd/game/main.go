package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
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

	// Clean stale Android build artifacts that cause UID duplicate warnings
	cleanAndroidBuildArtifacts(gameDir)

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

func installShutdownHandler(cmd *exec.Cmd) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)

	go func() {
		<-signals
		terminateChildProcess(cmd)
		os.Exit(0)
	}()
}
