# Submission archive

The live service stores screenshots and review records in this repository on the **`submissions` branch**, separate from the site on `main`.

```text
submissions/
  vampire/
    index.json
    <tile-id>/<submission-id>-<image-hash>.webp
  werewolf/
    index.json
    <tile-id>/<submission-id>-<image-hash>.webp
```

The service creates these files when the first screenshot arrives. Each team index records the tile, drop, quantity, player, screenshot path, status, revision, and review history. Images can also be PNG or JPEG when submitted directly through the API.

Screenshots, player names, notes, and reviews are public in this public repository. Access codes and the GitHub token belong only in the service's secrets, never in this directory. Rejected evidence stays in the archive for transparency; rejecting does not delete the image or its Git history.

See [SETUP.md](../SETUP.md) to connect storage. Local automated and browser tests use memory only and never create real submissions.
