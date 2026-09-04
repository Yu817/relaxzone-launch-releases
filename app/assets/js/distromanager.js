const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

// Relax Zone 專屬遠端分發伺服器網址（日後若上傳至公開檔案主機，可填在此處）
// 當此處為空字串時，啟動器會固定鎖定讀取專案內的 Relax Zone Fabric 1.21.1 本機設定
exports.REMOTE_DISTRO_URL = ''

// 當無遠端 URL 時自動啟用本機開發模式 (devMode = true)，直接加載本機 Relax Zone 伺服器與模組
const useDevMode = !exports.REMOTE_DISTRO_URL || exports.REMOTE_DISTRO_URL.trim() === ''

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    useDevMode
)

exports.DistroAPI = api
