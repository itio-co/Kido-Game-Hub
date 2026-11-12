# Local build/check commands only. This file never uploads or deploys.
SHELL := /bin/sh
.DEFAULT_GOAL := help
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
GAME := games/never-ending-story
NPM ?= npm

.PHONY: help install dev preview check check-modules test test-game test-shared build build-packages build-web build-worker verify
help:
	@printf '%s\n' \
	  'make install        Install locked npm workspace dependencies (npm ci)' \
	  'make dev            Run Never Ending Story development server' \
	  'make check          Typecheck, validate content, check module boundaries' \
	  'make test           Run shared package and game tests' \
	  'make build          Build packages, game/God assets, and Worker locally' \
	  'make build-web      Build game + God together (not independent modules)' \
	  'make build-worker   Bundle the Worker without deploying it' \
	  'make verify         Run checks, tests and complete local build in order' \
	  'make preview        Preview the previously built static site' \
	  'Independent module release is a future design; see game docs/build.md.'

install:
	cd "$(ROOT)" && $(NPM) ci

dev:
	cd "$(ROOT)" && $(NPM) run dev

preview:
	cd "$(ROOT)" && $(NPM) -w never-ending-story-game run preview

check:
	cd "$(ROOT)" && $(NPM) run check
	$(MAKE) -C "$(ROOT)" check-modules

check-modules:
	cd "$(ROOT)" && $(NPM) -w never-ending-story-game run check:modules

test:
	$(MAKE) -C "$(ROOT)" test-shared
	$(MAKE) -C "$(ROOT)" test-game

test-shared:
	cd "$(ROOT)" && $(NPM) test

test-game:
	cd "$(ROOT)" && $(NPM) -w never-ending-story-game test

# Sequence explicitly, including under make -j; shared packages precede the app.
build:
	$(MAKE) -C "$(ROOT)" build-packages
	$(MAKE) -C "$(ROOT)" build-web
	$(MAKE) -C "$(ROOT)" build-worker

build-packages:
	cd "$(ROOT)" && $(NPM) run build:packages

build-web:
	cd "$(ROOT)" && $(NPM) run build

# Keep server output outside dist so it is never uploaded as a public KV asset.
build-worker:
	cd "$(ROOT)" && ./node_modules/.bin/rolldown $(GAME)/worker/index.ts --format esm --platform neutral --file $(GAME)/.worker-build/worker.js

verify:
	$(MAKE) -C "$(ROOT)" check
	$(MAKE) -C "$(ROOT)" test
	$(MAKE) -C "$(ROOT)" build
