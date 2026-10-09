# Documentation sync

The documentation receiver in [uniskela/com](https://github.com/uniskela/com) already lists this repository as an approved source. `docs/manifest.json` lists the reviewed public documentation pages. Add new pages there to publish them.

The notifier runs for README/docs changes on main, manually on main, and for releases targeting main. Release Please calls it directly after creating a release because events created with `GITHUB_TOKEN` do not trigger another workflow. Notifications let the receiver refresh its documentation draft PR; publishing still requires merging that PR.

## Required repository configuration

Set Actions variable `DOCS_SYNC_APP_ID` and Actions secret `DOCS_SYNC_APP_PRIVATE_KEY` using the existing notification App. Its installation must be limited to `uniskela/com`, with Contents write permission. Do not use the separate publishing App key. GitHub cannot read back an existing Actions secret; configure this repository from the original key held by the maintainer.

See [.com setup instructions](https://github.com/uniskela/com/blob/main/docs/docs-dispatch-setup.md). No key is stored in this repository. The notification job does not check out or execute source code; its short-lived token is revoked by the token action.

After configuring the App, run **Notify Uniskela documentation** on main, then verify **Propose documentation updates** in `.com`. A successful dispatch confirms acceptance only; also check the receiver run and draft PR. The destination scheduled/manual sync remains a fallback.
