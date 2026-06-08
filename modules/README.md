# ECHO Module Release Contract

`knoxhack/ECHO-Modules` is the canonical source for module artifacts consumed by Ashfall editions.

Every module release must publish artifacts generated from the module descriptor version, not a single global pack version.

## Per-Module Outputs

For each module, generate:

```txt
<module>-<version>-neoforge.jar
<module>-<version>.echo-addon
<module>-<version>-standalone.jar
<module>-<version>-sources.jar
META-INF/echo.mod.json
META-INF/neoforge.mods.toml
echo-addon-package.json
```

Applicability:

| Output | Required when |
| --- | --- |
| `<module>-<version>-neoforge.jar` | The module supports the Minecraft/NeoForge runtime. |
| `<module>-<version>.echo-addon` | The module supports the ECHO native addon/module runtime. |
| `<module>-<version>-standalone.jar` | The module supports the standalone runtime. |
| `<module>-<version>-sources.jar` | Always, for traceability and developer debugging. |
| `META-INF/echo.mod.json` | Always, embedded in each runtime artifact where applicable. |
| `META-INF/neoforge.mods.toml` | NeoForge artifacts only. |
| `echo-addon-package.json` | `.echo-addon` packages only. |

## Edition Consumption

| Edition | Repo | Module artifact family |
| --- | --- | --- |
| Ashfall Native Edition | `knoxhack/ECHO-Ashfall-Native-Edition` | `<module>-<version>.echo-addon` |
| Ashfall NeoForge Edition | `knoxhack/ECHO-Ashfall-NeoForge-Edition` | `<module>-<version>-neoforge.jar` |
| Ashfall Standalone Edition | `knoxhack/ECHO-Ashfall-Standalone-Edition` | `<module>-<version>-standalone.jar` |

Pack manifests can still pin direct download URLs, SHA-256 hashes, sizes, module IDs, and versions for each module artifact. They can also declare module requirements and let ECHO Launcher resolve the correct artifact from the `knoxhack/ECHO-Modules` GitHub release feed.

## Launcher Module Resolution

Use `moduleRequirements` when a pack should update modules individually without hard-coding every module artifact URL:

```json
{
  "moduleArtifactFamily": "neoforge",
  "moduleRequirements": [
    {
      "id": "echocore",
      "version": "1.0.0"
    }
  ]
}
```

Default artifact names are derived from the pack family:

| Family | Default artifact |
| --- | --- |
| `echo-addon` | `<module>-<version>.echo-addon` |
| `neoforge` | `<module>-<version>-neoforge.jar` |
| `standalone` | `<module>-<version>-standalone.jar` |

Each requirement can override `assetName`, `path`, `sha256`, `size`, `required`, `side`, or `artifactFamily`. During install/update, the launcher expands those requirements into normal manifest `files`, downloads only changed module files when URLs are resolved, and falls back to the full pack archive only when a changed file has no individual release asset URL.
