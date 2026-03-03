# Repository Guidelines

## Project Structure & Module Organization
- `actions/`: action art PNG assets.
- `characters/`: character art assets used in card layouts.
- `frame.webp`: base card frame image.
- `SPEC.md`: product/UX requirements for the editor.
- `card-frame-editor/`: Node package where editor code lives.

Keep all app code inside `card-frame-editor/` (for example `components/`, `pages/`, `composables/`). Keep generated JSON exports out of source folders.

## Build, Test, and Development Commands
Current commands:
- `cd card-frame-editor && npm install` - install dependencies.
- `cd card-frame-editor && npm test` - placeholder script (currently fails).

When Nuxt setup is added, define and use:
- `npm run dev` - local development server.
- `npm run build` - production build.
- `npm run lint` and `npm run test` - pre-PR quality checks.

## Coding Style & Naming Conventions
- Use 2-space indentation in JS/TS/Vue files.
- Use `camelCase` for variables/functions.
- Use `PascalCase` for Vue component names.
- Use kebab-case for non-component filenames.
- Keep shared UI constants aligned with `SPEC.md`.
- Use predictable export names, e.g. `character-name.layout.json`.

## Testing Guidelines
No test framework is configured yet.
- Add unit tests under `card-frame-editor/tests/` (or `*.spec.ts` near modules).
- Cover position/scale math, JSON schema output, and missing-asset behavior.
- Run lint and tests locally before opening a PR.

## Commit & Pull Request Guidelines
Use Conventional Commits.
- Format: `type(scope): summary`.
- Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
- Example: `feat(editor): add drag positioning`.

PRs must include purpose, key changes, manual test steps, and UI screenshots/videos when visuals change. Link related issues or `SPEC.md` checklist items.

## Security & Configuration Tips
- Never commit secrets or API keys.
- Do not destructively overwrite source art; add clear revision filenames.
- Validate required assets (`characters/`, `frame.webp`) and show clear UI errors.
