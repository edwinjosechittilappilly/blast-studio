MKDOCS := uvx --with mkdocs-material mkdocs

.PHONY: help install test typecheck docs docs-serve check

help:
	@printf '%s\n' 'install      Install dependencies and link bstudio' 'test         Run tests' 'typecheck    Check TypeScript types' 'docs         Build documentation in strict mode' 'docs-serve   Serve documentation locally' 'check        Run tests, typecheck and docs'

install:
	npm ci && npm link

test:
	npm test

typecheck:
	npm run typecheck

docs:
	$(MKDOCS) build --strict

docs-serve:
	$(MKDOCS) serve

check: test typecheck docs
