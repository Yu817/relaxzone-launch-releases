# Relax Zone Launcher 專案指南

這份文件提供給後續協作的 AI 與開發者使用。開始修改前應先閱讀本文件，並以目前專案檔案的實際內容為準；如果本文件與程式碼不一致，先檢查差異，再更新本文件。

## 專案用途

這是一個以 Electron 製作的 Windows／macOS／Linux Minecraft 啟動器，服務 Relax Zone 悠然之境 MMORPG 伺服器。啟動器的主要工作是：

- 讓玩家使用 Microsoft 帳號登入 Minecraft。
- 自動檢查與安裝相容的 Java。
- 依伺服器分發設定下載、校驗並更新 Minecraft、Fabric Loader、伺服器模組與必要依賴。
- 管理遊戲設定、記憶體、Java 路徑、光影包及玩家自訂模組。
- 顯示伺服器公告、線上人數、狀態與 Discord Rich Presence。
- 啟動遊戲後自動連線至 Relax Zone。
- 啟動器本身在正式環境自動檢查並強制更新。

目前遊戲配置是 Minecraft 1.21.11 + Fabric + Java 21。預設模組包含 PackForge、Iris、Sodium、Simple Voice Chat、Xaero's Minimap 小地圖與 Inventory Sorting 背包整理。

## 目前專案狀態

- 啟動器版本：1.0.7
- Git 分支：main
- 最新 tag：v1.0.7
- Discord 邀請連結：https://discord.gg/m2Ern4DKCZ
- Windows 圖示來源：app/assets/images/SealCircle.png

## GitHub 儲存庫

這個專案使用兩個儲存庫，用途不可混淆：

| 儲存庫 | 用途 | 權限／內容 |
| --- | --- | --- |
| https://github.com/Yu817/relaxzone-launch.git | 原始碼 | 通常是 private，只放程式碼、設定與文件 |
| https://github.com/Yu817/relaxzone-launch-releases.git | 玩家下載版本 | 用 GitHub Releases 放安裝檔與更新 feed |

不要把 100 MB 左右的安裝檔直接 commit 到原始碼儲存庫。dist/ 已列在 .gitignore，安裝檔應作為 GitHub Release asset 上傳。

electron-builder 的發布設定在 electron-builder.yml：

- GitHub owner：Yu817
- GitHub release repo：relaxzone-launch-releases
- Windows 安裝檔格式：RelaxZone-Launcher-Setup-VERSION.exe
- 更新 feed：latest.yml
- Windows blockmap：RelaxZone-Launcher-Setup-VERSION.exe.blockmap

## 重要目錄與檔案

| 路徑 | 說明 |
| --- | --- |
| index.js | Electron main process、視窗、IPC、auto updater |
| app/app.ejs | 啟動器主畫面與頁面容器 |
| app/settings.ejs | 設定頁、模組頁、關於頁、版本更新頁 |
| app/assets/js/preloader.js | 載入設定、分發清單與快取 |
| app/assets/js/configmanager.js | 玩家設定、遊戲資料路徑與設定遷移 |
| app/assets/js/distromanager.js | 建立 Helios Distribution API、指定遠端／本機分發模式 |
| app/assets/js/processbuilder.js | 組裝 Minecraft 啟動參數與啟動遊戲 |
| app/assets/js/scripts/ | 登入、首頁、設定、更新、模組市集等前端邏輯 |
| app/assets/lang/ | zh_TW.toml、en_US.toml 與 Relax Zone 自訂文字 |
| distribution_relaxzone.json | Relax Zone 本機分發設定的主要來源 |
| distribution.json | 啟動器使用的分發設定副本，應與上面保持同步 |
| docs/distro.md | 分發清單與模組格式說明 |
| build/icon.png | electron-builder 使用的打包圖示，應與伺服器圖示一致 |
| electron-builder.yml | appId、安裝檔命名、平台打包與 GitHub 發布設定 |
| .github/workflows/build.yml | push 到 main 或 v* tag 時的跨平台建置 workflow |

## 分發設定與預設模組

### 本機／遠端模式

目前 app/assets/js/distromanager.js 的 REMOTE_DISTRO_URL 是空字串，因此啟動器使用本機分發模式。app/assets/js/preloader.js 會把打包進去的 distribution_relaxzone.json 同步到啟動器資料目錄，再由 Helios Distribution API 載入。

如果未來要改成遠端分發：

1. 將 REMOTE_DISTRO_URL 設為公開可下載的 HTTPS JSON URL。
2. 確認玩家不需要登入 private GitHub repo；private repo 的 Raw URL 不能當作玩家公開下載來源。
3. JSON 中所有模組的 artifact URL、圖示與相關檔案都必須能讓玩家直接下載。
4. 測試遠端失效時的 fallback 行為，並檢查啟動器不會載入過期快取。

### 修改模組時必須做的事

distribution_relaxzone.json 與 distribution.json 目前內容應完全一致。修改預設模組時，兩份檔案都要更新，不要只改其中一份。

每個 FabricMod 至少需要：

~~~json
{
    "id": "com.relaxzone.mods:example:1.0.0+mc1.21.11",
    "name": "Example Mod",
    "type": "FabricMod",
    "required": {
        "value": true,
        "def": true
    },
    "artifact": {
        "size": 123456,
        "MD5": "lowercase-md5",
        "url": "https://example.com/example.jar"
    }
}
~~~

注意事項：

- id 必須是 Helios 可解析的三段 Maven identifier；即使檔案來自 Modrinth，也要使用有效的 group、artifact、version。
- artifact.size 必須是實際檔案大小。
- artifact.MD5 必須是實際下載檔案的 lowercase MD5，不要拿 SHA-1 或 SHA-512 代替。
- URL 必須是 HTTPS 且玩家可直接下載的檔案。
- 模組的必要依賴要放在 subModules 或明確列為模組，並同樣填完整 artifact 資訊。
- 會隨啟動器預載的模組使用 required.value: true；不要意外設成玩家可關閉的 optional module。
- 修改模組清單或伺服器檔案時，同時增加 distribution 的頂層 version 與該 server 的 version。

目前新增的預設模組如下：

- Xaero's Minimap 26.4.2，Modrinth version 8MdqDp18。
- Inventory Sorting 2.1.4，Modrinth version Dq4h9aTH。
- Inventory Sorting 的必要依賴 Cloth Config API 21.11.153，Modrinth version xuX40TN5。

## 品牌與已移除功能

目前啟動器有以下產品規則，修改 UI 時要維持一致：

- 「官方網站」按鈕已移除；關於頁只保留 Discord 社群連結與更新公告。
- 「開發者控制台」按鈕、F12、Ctrl+Shift+I 開啟 DevTools 的玩家入口已移除；正式版 BrowserWindow 的 devTools 為停用狀態。
- 「搶先體驗版」更新頻道已移除；正式版 updater 固定只接收穩定版本。
- Discord 連結固定使用 https://discord.gg/m2Ern4DKCZ。
- app/assets/images/SealCircle.png 是玩家看到的 Relax Zone 圖示；更新圖示時也要同步確認 build/icon.png、Windows 主程式、捷徑與工作列圖示。

不要只把按鈕藏起來卻留下會被玩家觸發的事件；如果重新調整這些功能，畫面、事件、IPC 與語系文字要一起檢查。

## 開發與驗證

需求環境是 Node.js 22，版本寫在 .nvmrc 與 package.json.engines。第一次準備專案：

~~~powershell
npm ci
~~~

本機啟動：

~~~powershell
npm start
~~~

基本驗證：

~~~powershell
npm run lint
node --check index.js
node --check app/assets/js/configmanager.js
node --check app/assets/js/scripts/settings.js
node --check app/assets/js/scripts/uibinder.js
node --check app/assets/js/scripts/uicore.js
~~~

修改分發清單後，至少確認：

~~~powershell
node -e "const fs=require('fs'); for(const f of ['distribution.json','distribution_relaxzone.json']) JSON.parse(fs.readFileSync(f,'utf8')); console.log('distribution JSON valid')"
~~~

也應使用 helios-core 的分發解析器建立一次 HeliosDistribution，確認 Maven identifier、模組類型、required 狀態與 subModules 都可正常解析。模組檔案要在乾淨資料目錄測試下載與 MD5 校驗，不能只確認 JSON 語法。

## 版本更新規則

任何會進入玩家安裝包的程式碼、語系、圖示或 bundled distribution 變更，都要增加 launcher 版本。只改本機 source 而不升版，已安裝的玩家不會收到新的 bundled 檔案。

更新時同步修改：

1. package.json 的 version。
2. package-lock.json 根層與空字串 package 的 version；依賴套件自己的版本不要誤改。
3. app/assets/js/scripts/settings.js 的內建更新公告（如果公告是硬編碼的話）。
4. 若涉及伺服器／模組，distribution_relaxzone.json 與 distribution.json 的頂層及 server version。

版本使用一般 semver，例如 1.0.7，Git tag 使用 v1.0.7。不要重複使用已發布的版本號；更新 feed 需要新的版本號才能正確觸發玩家更新。

## Windows 打包流程

一般情況可使用：

~~~powershell
npm run dist:win
~~~

本機 Windows 若因 electron-builder 的 winCodeSign 快取 symlink 導致打包失敗，使用已驗證的 fallback。先建置 unpacked app，再以快取中的 rcedit-x64.exe 嵌入圖示，最後用 unpacked app 重建 NSIS 安裝檔：

~~~powershell
npx electron-builder build --win --publish never --config.win.signAndEditExecutable=false

$rcedit = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache') -Recurse -Filter 'rcedit-x64.exe' -File | Select-Object -First 1 -ExpandProperty FullName
& $rcedit 'dist\win-unpacked\Relax Zone Launcher.exe' --set-icon 'dist\.icon-ico\icon.ico'

npx electron-builder build --win nsis --prepackaged 'dist\win-unpacked' --publish never --config.win.signAndEditExecutable=false
~~~

打包後檢查：

- dist\RelaxZone-Launcher-Setup-VERSION.exe 存在。
- dist\latest.yml 的 version、檔名、size 與 sha512 對應本機安裝檔。
- 從 dist\win-unpacked\Relax Zone Launcher.exe 擷取的圖示是 SealCircle.png。
- 沒有把 dist/、node_modules/、token、憑證或本機設定提交進 Git。

目前沒有正式程式碼簽章憑證；未簽章安裝檔可能被 Windows SmartScreen 顯示警告，除非使用者另外要求，不要假稱安裝檔已簽章。

## Git 提交與 GitHub 發布流程

完成修改後依序執行：

~~~powershell
git status --short
npm run lint
git diff --check

git add <實際修改的檔案>
git commit -m "feat: describe the change"
git push origin main

git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
~~~

推送 v* tag 會觸發 .github/workflows/build.yml：

- 在 macOS、Ubuntu、Windows 建置安裝檔。
- Node.js 使用 22。
- 透過 RELAXZONE_RELEASE_TOKEN secret 與 GH_TOKEN 發布到 relaxzone-launch-releases。

推 tag 後要到 GitHub Actions 與 relaxzone-launch-releases 檢查 workflow 是否成功，不要只看到 git push 成功就認定玩家已經拿得到更新。若 workflow 沒有發布 asset，手動建立同名 tag 的 GitHub Release，並上傳以下三個檔案：

~~~text
dist/RelaxZone-Launcher-Setup-X.Y.Z.exe
dist/latest.yml
dist/RelaxZone-Launcher-Setup-X.Y.Z.exe.blockmap
~~~

手動上傳時使用 GitHub credential helper 或安全的環境變數取得 token；不要把 token 寫入 AGENTS.md、source code、PowerShell 檔案或 command output。Release 必須是非 draft、非 prerelease，tag 必須和 vX.Y.Z 完全一致。

發布完成後，用玩家實際可存取的網址驗證更新 feed：

~~~powershell
$feed = Invoke-WebRequest -Uri 'https://github.com/Yu817/relaxzone-launch-releases/releases/latest/download/latest.yml' -UseBasicParsing
Write-Output $feed.StatusCode
~~~

然後確認 feed 的 version、size 與 sha512 和本機 dist 安裝檔相符。也要確認安裝檔下載 URL 回傳 HTTP 200。只有這些檢查都通過，才向使用者宣告版本已可更新。

## 修改時的安全原則

- 先查看 git status 和相關 diff，保留使用者原本未提交的修改。
- 不要使用 git reset --hard、git checkout -- 或廣泛刪除來解決衝突，除非使用者明確要求。
- 不要把 private source repo 的 URL 當作玩家下載 URL。
- 不要只更新 distribution.json 而忘記 distribution_relaxzone.json，反之亦然。
- 不要只更新 package version 而忘記 package-lock 根層版本。
- 不要在未確認檔案大小與 MD5 前加入新的模組 artifact。
- 不要把 dist 安裝檔、node_modules、.env、token、.p12、.pfx、.pem 或 .key 提交到 Git。
- 修改完成後要回報實際測試結果；如果只做了語法／封裝測試，不能宣稱已完成 Minecraft 遊戲內實測。
