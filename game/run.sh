#!/bin/bash

# Ensure we are in the game directory or adjust paths
cd "$(dirname "$0")"

echo "Checking for Godot imports..."

# Check if .godot folder exists, if not, or if imports are missing, force import
if [ ! -d ".godot" ] || [ ! -f "project.godot" ]; then
    echo "First time setup: Importing assets..."
    # Run editor in headless mode to import assets and then quit
    godot --headless --editor --quit
else
    echo "Assets seem initialized."
fi

echo "Running Game..."
godot --path .
