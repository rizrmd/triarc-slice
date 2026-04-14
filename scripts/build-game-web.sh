set -euo pipefail

npm --prefix game-web run build

env CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -C game-web -o ../game.web.macos ./cmd/server
env CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -C game-web -o ../game.web.exe ./cmd/server
