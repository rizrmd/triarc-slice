package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func main() {
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

	// Check if .godot folder exists (imports done?)
	dotGodotPath := filepath.Join(gameDir, ".godot")
	if _, err := os.Stat(dotGodotPath); os.IsNotExist(err) {
		fmt.Println("First time setup: Importing assets (this may take a moment)...")
		
		// Run headless import
		cmd := exec.Command(godotExe, "--headless", "--editor", "--quit")
		cmd.Dir = gameDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		
		if err := cmd.Run(); err != nil {
			fmt.Printf("Warning: Import process exited with error: %v\n", err)
			// Don't exit, try running anyway
		} else {
			fmt.Println("Assets imported successfully.")
		}
	} else {
		fmt.Println("Assets seem initialized.")
	}

	fmt.Println("Launching Game...")
	runCmd := exec.Command(godotExe)
	// No arguments needed if project.godot is in the folder and we set Dir?
	// Actually `godot --path game` is safer if running from root
	// But let's try setting Dir to gameDir
	runCmd.Dir = gameDir
	
	// For GUI apps, we might want to detach or just wait
	// Forward output for debugging
	runCmd.Stdout = os.Stdout
	runCmd.Stderr = os.Stderr
	
	if err := runCmd.Start(); err != nil {
		fmt.Printf("Error starting game: %v\n", err)
		pressEnterToExit()
		os.Exit(1)
	}
	
	// Wait for it to finish? Or just exit launcher?
	// Usually launchers wait.
	runCmd.Wait()
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
			// Add common versioned names if needed
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

	case "windows":
		// TODO: Add Windows registry check or Program Files search if needed
		// For now just check standard install paths
		candidates := []string{
			"C:\\Program Files\\Godot\\Godot_v4.2.1-stable_win64.exe", // Example
			// It's hard to guess exact version on Windows without PATH
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c
			}
		}
	}
	
	return ""
}

func pressEnterToExit() {
	fmt.Println("\nPress Enter to exit...")
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}
