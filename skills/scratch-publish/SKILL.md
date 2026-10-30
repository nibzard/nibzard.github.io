---
name: scratch-publish
description: Publish or update notes, reports, and standalone HTML pages on Nikola's public scratch site at nibzard.github.io when the user requests that destination. Use for a scratch-site publishing request, not ordinary drafts or local previews.
---

Use the CLI at `/Users/nikola/dev/nibzard-gitpages/scripts/publish.mjs`. It imports content, validates, commits in an isolated worktree, pushes, waits for deployment, and verifies the live HTML.

- Plain notes: pass a Markdown file. The site supplies the title and date header; avoid duplicating the title as an H1 in the body.
- Existing custom pages: pass a folder containing `index.html` and its assets. Preserve its design. Markdown with assets can use a folder containing `index.md` instead. Use relative asset URLs.
- Set a concise title and description. Tags are optional comma-separated values.

```sh
node /Users/nikola/dev/nibzard-gitpages/scripts/publish.mjs publish /absolute/path/note.md --title "Agent memory" --description "Notes from an experiment"
node /Users/nikola/dev/nibzard-gitpages/scripts/publish.mjs publish /absolute/path/report --title "Infrastructure map" --slug infra-map
node /Users/nikola/dev/nibzard-gitpages/scripts/publish.mjs update infra-map /absolute/path/revised-report
```

An explicit request to publish to this site authorizes the publish command; do not introduce a second approval step. For a preview request, add `--local` and use `npm run preview` in the repository; this does not publish. Everything published is public. `--unlisted` hides only the homepage and manifest listing, not access to the URL or GitHub source.

Updates replace the whole entry folder: include every needed asset. They keep the slug, original date, and unspecified metadata. Use `--listed` to restore homepage listing. Slug collisions require choosing another slug or an intentional update, never silently overwriting an existing entry.

Return the verified URL printed after `Published:`. If deployment fails after pushing, inspect the existing GitHub Actions run; do not create another entry or repeatedly push. Failed pre-push worktrees are preserved and their paths printed for recovery. The CLI retries concurrent pushes at most three times and stops if another publisher changed the same entry.
