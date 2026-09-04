<p align="center"><img src="./app/assets/images/SealCircle.png" width="150px" height="150px" alt="Relax Zone"></p>

<h1 align="center">Relax Zone Launcher</h1>

<p align="center">Relax Zone 悠然之境官方 Minecraft 啟動器</p>

<p align="center">自動管理遊戲檔案、Java、模組與版本更新，讓玩家可以直接進入 Relax Zone。</p>

## 功能

- Microsoft 帳號登入與多帳號切換。
- 自動檢查並下載相容的 Java 環境。
- 自動下載、校驗與更新 Minecraft、Fabric 及伺服器模組。
- 內建伺服器公告、服務狀態與 Discord Rich Presence。
- 提供模組探索市集與遊戲設定管理。
- 支援啟動器自動更新。

## 下載

請從 [Relax Zone 官方下載頁](https://github.com/Yu817/relaxzone-launch-releases/releases/latest) 下載對應系統的安裝檔。

| 平台 | 安裝檔名 |
| --- | --- |
| Windows x64 | `RelaxZone-Launcher-Setup-VERSION.exe` |
| macOS x64 | `RelaxZone-Launcher-Setup-VERSION-x64.dmg` |
| macOS arm64 | `RelaxZone-Launcher-Setup-VERSION-arm64.dmg` |
| Linux x64 | `RelaxZone-Launcher-Setup-VERSION.AppImage` |

## 系統需求

- Windows 10/11 x64、macOS 或 Linux x64。
- 啟動器開發環境需要 [Node.js 22](https://nodejs.org/)。
- 遊戲所需的 Java 會由啟動器自動檢查與安裝。

## 開發

在專案根目錄執行：

```console
npm ci
npm start
```

建立目前作業系統的安裝檔：

```console
npm run dist
```

指定平台建立安裝檔：

| 平台 | 指令 |
| --- | --- |
| Windows x64 | `npm run dist:win` |
| macOS | `npm run dist:mac` |
| Linux x64 | `npm run dist:linux` |

執行檢查：

```console
npm run lint
```

## 分發設定

- `distribution_relaxzone.json` 是目前 Relax Zone 的本機分發設定。
- `distribution.json` 是啟動器讀取的分發設定副本。
- `docs/distro.md` 說明伺服器、Java 與模組設定格式。
- `docs/sample_distribution.json` 提供最小可用範例。

正式環境若要使用遠端分發設定，請在 `app/assets/js/distromanager.js` 設定 HTTPS 來源，並同步準備公告 RSS 與模組檔案的公開網址。

## 支援

遇到登入、下載或啟動問題，請前往 [Relax Zone Discord](https://discord.gg/relaxzone)，並附上啟動器控制台紀錄與錯誤發生步驟。

## 相關文件

- [Microsoft 帳號驗證設定](docs/MicrosoftAuth.md)
- [分發設定格式](docs/distro.md)
- [Minecraft 官方網站](https://www.minecraft.net/)
