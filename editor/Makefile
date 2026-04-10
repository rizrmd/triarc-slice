.PHONY: all build-frontend build-backend build-editor build-game

all: build-frontend build-editor build-game

build-frontend:
	cd frontend && npm install && npm run build

build-backend: build-editor build-game

build-editor:
	# Editor uses CGO (webp), cross-compilation might fail without proper toolchain
	-GOOS=windows GOARCH=amd64 CGO_ENABLED=1 CC=x86_64-w64-mingw32-gcc go build -o ../editor.exe .
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -o ../editor.macos .

build-game:
	# Game launcher is pure Go, so CGO_ENABLED=0 is safe and allows easy cross-compilation
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o ../game.exe ./cmd/game
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o ../game.macos ./cmd/game
