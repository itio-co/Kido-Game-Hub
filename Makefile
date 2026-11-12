# Local build/check commands only. This file never uploads or deploys.
SHELL := /bin/sh
.DEFAULT_GOAL := help
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
GAME := games/never-ending-story
NPM ?= npm

.PHONY: help install dev preview check check-modules test test-game test-shared build build-packages build-web build-worker verify deploy-modules rollback-module
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
	  'make deploy-modules Dry-run rhythm/stirfry chunk upload (APPLY=1 sends it; SPACE=dev|prod)' \
	  'make rollback-module Dry-run pointing one module at MODULE= and VERSION= (APPLY=1 sends it)' \
	  'Pilot chunks: rhythm and stirfry only. See games/never-ending-story/docs/build.md.'

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

# Prints the plan unless APPLY=1. Never deletes KV keys. Does not deploy the Worker.
deploy-modules:
	cd "$(ROOT)/$(GAME)" && node --experimental-strip-types scripts/module-deploy.ts upload --space $(or $(SPACE),dev) $(if $(APPLY),--apply,)

rollback-module:
	cd "$(ROOT)/$(GAME)" && node --experimental-strip-types scripts/module-deploy.ts rollback --space $(or $(SPACE),dev) --module $(MODULE) --version $(VERSION) $(if $(APPLY),--apply,)
