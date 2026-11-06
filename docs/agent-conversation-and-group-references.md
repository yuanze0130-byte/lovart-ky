# Agent chat history and group references

## Behavior

- Agent history is stored in this browser's IndexedDB, separately for each signed-in account and project. Reloading or reopening the same project restores messages, context settings and plan insertion state.
- This is browser-local persistence, not cloud synchronization. Another device, another browser, private browsing, or clearing site storage will not retain the same history.
- The user message is saved before an AI request starts. A storage failure blocks submission or offers a save-only retry; reloading does not automatically resubmit a paid request.
- Concurrent tabs merge conversation writes. Clearing history changes its epoch so an older in-flight reply cannot restore cleared content.
- A plan insertion is claimed before adding it to the canvas. An interrupted insertion is shown as uncertain instead of being automatically repeated.
- The existing asset picker offers whole-group selection for eligible members. It merges their IDs into the existing selection without duplicates. Individual references remain removable. The selection is a snapshot; later group membership changes do not silently replace it.

## Regression checks

The three new regression scripts use the project's external regression fixture directory. From the repository root, install the isolated test dependencies (no environment file or API key is needed):

```sh
npm ci
npm install --prefix ../.analysis/canvas-regression --no-save fake-indexeddb react@19.2.7 react-test-renderer@19.2.7
node scripts/test-agent-conversation-store.mjs
node scripts/test-agent-conversation-panel.mjs
node scripts/test-canvas-group-reference-panel.mjs
node scripts/test-canvas-asset-references.mjs
```

These tests use simulated storage, React rendering and mocked AI responses; they do not send emails or invoke paid generation endpoints. Do not commit the external dependency directory.

Coverage includes account/project isolation, concurrent writes, clear-versus-late-reply races, storage failure recovery, component remounts, duplicate plan insertion guards, eligible group membership, stable selection and reference deduplication.
