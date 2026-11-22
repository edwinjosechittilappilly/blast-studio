MKDOCS := uvx --with mkdocs-material mkdocs

.PHONY: help install test typecheck docs docs-serve check goldens

help:
	@printf '%s\n' 'install      Install dependencies and link bstudio' 'test         Run tests' 'goldens      Update perceptual goldens for this OS' 'typecheck    Check TypeScript types' 'docs         Build documentation in strict mode' 'docs-serve   Serve documentation locally' 'check        Run tests, typecheck and docs'

install:
	npm ci && npm link

test:
	npm test

goldens:
	UPDATE_GOLDENS=1 node --test test/goldens.test.ts

typecheck:
	npm run typecheck

docs:
	$(MKDOCS) build --strict

docs-serve:
	$(MKDOCS) serve

check: test typecheck docs
