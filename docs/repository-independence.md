# Repository independence: preserve first

## Verified baseline (2026-10-27)

- Repository: `ibbuilds/ig-downloader`, ID `1435358365`.
- Public, MIT licensed, with the original copyright retained.
- GitHub still marks it as a fork of `hoaianle/Instagram-Downloader`.
- At inspection, issue and discussion features were disabled. PRs and Actions work.
- The product can be independently developed, distributed and contributed to without changing GitHub's fork-network flag.

## Destructive fork detachment is not automated

GitHub's current documentation for **Leave fork network** warns that issues, pull requests, wikis, stars, watchers, comments and other metadata are not retained; Git commit metadata is retained. The operation is permanent. Therefore it is not equivalent to keeping the same repository and all its history. Do not delete/recreate the repository or force-push a replacement history to remove the fork label.

Before an owner chooses that operation, export Git refs and GitHub metadata, record Actions/settings and review whether loss of PR history is acceptable. A metadata export is not a guarantee of lossless restoration. Consult GitHub about an in-place administrative option without assuming it is available. Until such a path is confirmed, preserve this repository, its ID and URL. This document is a migration procedure, not a claim that detachment happened.

Official instructions and warnings: https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork

## Non-destructive administrator setup

Repository settings are not controlled by committed YAML alone. An owner can enable Issues, Discussions and private vulnerability reporting, set the About description, and require the relevant CI checks before merging. Do not assume these settings are enabled just because templates and CODEOWNERS exist.

For GitHub CLI users, the following edits only the two community features and description; it does not detach, rename or publish anything:

```sh
gh repo edit ibbuilds/ig-downloader --enable-issues --enable-discussions --description "Open-source modular resource extraction engine and CLI; Instagram reference adapter"
```

Review default-branch protection/rules and reviewer requirements separately. Keep public PR workflows secret-free. Configure a suitable controlled Instagram test URL and a dedicated session only for trusted live checks; never place session values in Git.

## Naming and licensing

Keep the current repository URL for existing users. `sget` is the generic CLI command; `igd` and `ig-downloader` are compatibility aliases. No public npm name has been reserved or published. `private: true` in package.json prevents accidental registry publication; it does not change the MIT license or repository visibility.
