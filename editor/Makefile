.PHONY: all build-frontend build-backend

all: build-frontend build-backend

build-frontend:
	cd frontend && npm install && npm run build

build-backend:
	go build -o ../editor.exe .
	go build -o ../editor.macos .
