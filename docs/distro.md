# Distribution Index

The launcher reads a JSON distribution index to discover Relax Zone servers and the files required by each client. The local development copy is `distribution_relaxzone.json`; the launcher copies it to its cache before loading it when the local file is available.

All remote URLs should use HTTPS and should point to files that are publicly downloadable by the player. The small example in `sample_distribution.json` is intentionally minimal; the production file may contain more modules and servers.

## Top-level object

```json
{
    "version": "1.0.0",
    "discord": {
        "clientId": "12334567890123456789",
        "smallImageText": "Relax Zone 悠然之境",
        "smallImageKey": "seal-circle"
    },
    "rss": "https://relaxzone.org/rss.xml",
    "servers": []
}
```

| Property | Type | Description |
| --- | --- | --- |
| `version` | string | Version of the distribution format. |
| `discord` | object | Optional global Discord Rich Presence settings. |
| `rss` | URL | Optional news feed used by the launcher. |
| `servers` | array | Server configurations available to players. |

### Discord settings

- `clientId`: Discord application client ID.
- `smallImageText`: Tooltip for the small image.
- `smallImageKey`: Name of the small image uploaded to the Discord application.

## Server object

```json
{
    "id": "RelaxZone-Fabric-1.21.11",
    "name": "Relax Zone 悠然之境",
    "description": "Relax Zone Minecraft 生存冒險伺服器。",
    "icon": "assets/images/SealCircle.png",
    "version": "1.0.0",
    "address": "mc.relaxzone.org",
    "minecraftVersion": "1.21.11",
    "discord": {
        "shortId": "悠然之境",
        "largeImageText": "Relax Zone 悠然之境",
        "largeImageKey": "server-relaxzone"
    },
    "mainServer": true,
    "autoconnect": true,
    "javaOptions": {
        "suggestedMajor": 21,
        "supported": "21.x",
        "ram": {
            "minimum": 3072,
            "recommended": 4096
        }
    },
    "modules": []
}
```

| Property | Type | Description |
| --- | --- | --- |
| `id` | string | Stable server ID used for saved settings. Changing it creates a new instance. |
| `name` | string | Name displayed in the launcher. |
| `description` | string | Description displayed to the player. |
| `icon` | URL or relative path | Server icon. Relative paths resolve from the launcher assets. |
| `version` | semver | Version of this server configuration. |
| `address` | string | Minecraft server address, including a port when necessary. |
| `minecraftVersion` | string | Minecraft version used by the client. |
| `discord` | object | Optional server-specific Rich Presence settings. |
| `mainServer` | boolean | Marks the default server. Only one server should use `true`. |
| `autoconnect` | boolean | Allows automatic connection after the game starts. |
| `javaOptions` | object | Optional Java version and memory requirements. |
| `modules` | array | Files and loaders required by the client. |

## Java options

```json
{
    "suggestedMajor": 21,
    "supported": "21.x",
    "distribution": "TEMURIN",
    "ram": {
        "minimum": 3072,
        "recommended": 4096
    },
    "platformOptions": [
        {
            "platform": "win32",
            "architecture": "x64",
            "distribution": "TEMURIN"
        }
    ]
}
```

- `supported`: semver range accepted by the client.
- `suggestedMajor`: Java major version shown to the player and used by automatic installation.
- `distribution`: Preferred JDK distribution when Java must be downloaded.
- `ram.minimum`: Lowest selectable memory in MB; use multiples of 512.
- `ram.recommended`: Default memory in MB; use multiples of 512.
- `platformOptions`: Optional platform-specific overrides. More specific entries take precedence over base values.

## Module object

Every module has an ID, display name, type and artifact. Modules may also contain `required` and `subModules`.

```json
{
    "id": "net.fabricmc:fabric-loader:0.19.5",
    "name": "Fabric Loader",
    "type": "Fabric",
    "artifact": {
        "size": 1984980,
        "MD5": "23bf6a8c5ba938db7d13959a2630357f",
        "url": "https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar"
    },
    "subModules": []
}
```

### Common module types

- `Fabric`: Fabric loader and its dependent libraries.
- `FabricMod`: Fabric mod JAR.
- `ForgeHosted`: Forge installer or hosted Forge artifact.
- `ForgeMod`: Forge mod JAR.
- `LiteLoader`: LiteLoader and its dependent modules.
- `LiteMod`: LiteLoader mod.
- `Library`: Java library placed on the classpath.
- `VersionManifest`: A version manifest downloaded and parsed by the launcher.
- `File`: Generic file copied into the server instance directory.

### Artifact properties

- `size`: Expected file size in bytes.
- `MD5`: Expected lowercase MD5 hash. The launcher verifies the file before launch.
- `url`: HTTPS download URL.
- `path`: Relative destination for a generic `File` module. Do not use absolute paths.

### Optional modules

Use `required` for modules that can be enabled or disabled by the player:

```json
"required": {
    "value": false,
    "def": true
}
```

`value` indicates whether the module is currently required by the distribution. `def` controls the initial player preference when `value` is false. A module can contain `subModules` when it bundles additional libraries or configuration files.

## Release checklist

Before publishing a new distribution index:

1. Increase the server `version` whenever the module list or client files change.
2. Verify every artifact URL and hash from a clean data directory.
3. Confirm that the intended server has `mainServer: true`.
4. Test the exact Minecraft and Java versions on Windows, macOS and Linux where supported.
5. Publish the JSON only after the launcher can load it without falling back to stale cache data.
