# Requires GNU Make (e.g. Git Bash on Windows) and pnpm on PATH.
PNPM ?= pnpm

.PHONY: install dev build preview typecheck clean help tauri-dev tauri-build

help:
	@echo Targets: install dev build preview typecheck clean tauri-dev tauri-build

install:
	$(PNPM) install

dev:
	$(PNPM) dev

build:
	$(PNPM) build

preview:
	$(PNPM) preview

typecheck:
	$(PNPM) typecheck

clean:
	-$(RM) -rf node_modules dist

# Desktop (Tauri). Cargo must be on PATH (usually %USERPROFILE%\.cargo\bin after rustup).

tauri-dev:
	$(PNPM) run tauri:dev

tauri-build:
	$(PNPM) run tauri:build
