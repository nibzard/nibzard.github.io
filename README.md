# nibzard / scratch

A public home for quick notes and independent HTML pages at https://nibzard.github.io/.

## Use

Requires Node 22+, Git, and authenticated GitHub CLI (`gh`). Run `npm ci` once.

```sh
npm run scratch -- publish /path/note.md --title "An observation" --description "What I learned"
npm run scratch -- publish /path/report --title "My report" --tags research,agents
npm run scratch -- update my-report /path/revised-report
```

A directory must have exactly one `index.md` or `index.html`. Include all its assets; custom HTML is copied unchanged. A single file imports only that file. Markdown gets a shared template with title/date, so start the body without a duplicate H1.

Optional flags: `--slug`, `--description`, `--tags a,b`, `--unlisted`, `--listed` (updates), `--local`. A new entry requires `--title`; updates preserve unspecified metadata and the original date. Updates replace the whole entry directory, including assets. Dates use UTC.

`--local` stages content and builds `dist/` without committing or pushing. Run `npm run preview` and visit http://127.0.0.1:4173/. Preview binds to loopback only. Local staged content remains in this checkout; publish the staged folder explicitly when ready. Published content is public; unlisted means omitted from the homepage and manifest, not private.

## How publication works

The CLI fetches `origin/main` and creates a detached worktree under `~/dev/.worktrees/nibzard-gitpages/`. It imports one entry, builds and checks quoted HTML `src`/`href` local paths, commits that entry only, and pushes. Up to three push attempts handle unrelated concurrent changes; a changed target entry stops the operation. Successful pushes are durable remotely and clean worktrees are removed. Failed unpublished work is preserved with a recovery path. The main checkout is not automatically pulled or modified by publishing.

GitHub Actions builds and deploys Pages. The CLI waits up to ten minutes for the matching commit's workflow, then compares the live entry HTML SHA-256 with the build. Failure after pushing prints the commit/run context: inspect that deployment rather than publishing a duplicate. Concurrent same-entry updates and skipped/cancelled workflows can require manual inspection.

Link validation checks file existence, not external links, HTML anchors, CSS URLs, JS-generated URLs, or `srcset`. Use a browser to check custom pages. Notes permit raw HTML; publish content you intend to serve. Hidden files, `node_modules`, and supplied `entry.json` are excluded during import. Symlinks are rejected.

## Layout

- `content/<slug>/entry.json`: title, description, date, updated timestamp, tags, unlisted flag.
- `content/<slug>/index.md` or `index.html`, alongside assets.
- `templates/note.html`: shared responsive note/index styling.
- `scripts/build.mjs`: Markdown rendering, static copy, generated homepage and `manifest.json`.
- `scripts/publish.mjs`: import, validation, isolated Git publication, deployment verification.
- `site.json`: site identity, canonical URL, GitHub repository, branch.
- `.github/workflows/pages.yml`: test, build, and deploy.
- `skills/scratch-publish/SKILL.md`: thin agent skill; install under your agent's skills directory.

## Setup / development

```sh
npm ci
npm test
npm run build
npm run preview
```

Set `origin` to the repository in `site.json`. Configure GitHub Pages to use GitHub Actions. The workflow requires Pages write and OIDC permissions. Custom domains also require GitHub Pages settings and DNS configuration; update `site.json` to match.

To make `scratch` available on PATH, run `npm link` (optional). Without it, `node /absolute/path/scripts/publish.mjs` works from any directory. The canonical installed skill uses the absolute local repository path.
