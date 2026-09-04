const fs = require('fs-extra')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')
const ConfigManager = require('./configmanager')

const MODRINTH_API = 'https://api.modrinth.com/v2'
const USER_AGENT = 'RelaxZoneLauncher/1.0.0 (https://relaxzone.org; contact@relaxzone.org)'

/**
 * Helper to get the active mods directory for the current selected server
 */
function getActiveModsDirectory() {
    let servId = null
    try {
        servId = ConfigManager.getSelectedServer()
    } catch (_e) {
        servId = null
    }
    if (!servId) {
        servId = 'RelaxZone-Fabric-1.21.11'
    }
    let baseDir = null
    try {
        baseDir = ConfigManager.getInstanceDirectory()
    } catch (_e) {
        baseDir = null
    }
    if (!baseDir) {
        try {
            baseDir = path.join(ConfigManager.getDataDirectory(), 'instances')
        } catch (_e) {
            baseDir = path.join(process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME), '.relaxzone-launcher', 'instances')
        }
    }
    const dir = path.join(baseDir, servId, 'mods')
    try {
        fs.ensureDirSync(dir)
    } catch (e) {
        console.warn('Failed to ensure mods directory:', e)
    }
    return dir
}

/**
 * Get installed mod tracking database file path
 */
function getInstalledDbPath() {
    const dir = getActiveModsDirectory()
    if (!dir) return null
    return path.join(dir, '.market_installed.json')
}

/**
 * Load installed marketplace mods database
 */
function loadInstalledDb() {
    const dbPath = getInstalledDbPath()
    if (!dbPath || !fs.existsSync(dbPath)) {
        return {}
    }
    try {
        return fs.readJsonSync(dbPath)
    } catch (_e) {
        return {}
    }
}

/**
 * Save installed marketplace mods database
 */
function saveInstalledDb(data) {
    const dbPath = getInstalledDbPath()
    if (!dbPath) return
    try {
        fs.writeJsonSync(dbPath, data, { spaces: 2 })
    } catch (e) {
        console.error('Failed to save market installed DB:', e)
    }
}

/**
 * Get count of active installed marketplace mods
 */
function getInstalledCount() {
    try {
        const db = loadInstalledDb()
        const currentFiles = getInstalledFilenames()
        let count = 0
        for (const id in db) {
            const rec = db[id]
            if (rec && rec.filename && (currentFiles.has(rec.filename) || currentFiles.has(rec.filename + '.disabled'))) {
                count++
            }
        }
        return count
    } catch (_e) {
        return 0
    }
}

/**
 * Robust HTTP/HTTPS GET request with Node.js https module
 */
function modrinthFetch(endpoint) {
    return new Promise((resolve, reject) => {
        const urlStr = endpoint.startsWith('http') ? endpoint : `${MODRINTH_API}${endpoint}`
        let parsedUrl
        try {
            parsedUrl = new URL(urlStr)
        } catch (_e) {
            return reject(new Error(`無效的 API 請求網址: ${urlStr}`))
        }

        const client = parsedUrl.protocol === 'https:' ? https : http
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            }
        }

        const req = client.request(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return modrinthFetch(res.headers.location).then(resolve).catch(reject)
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Modrinth API 錯誤 (HTTP ${res.statusCode}): ${res.statusMessage || '請求未成功'}`))
            }

            let body = ''
            res.setEncoding('utf8')
            res.on('data', chunk => { body += chunk })
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body)
                    resolve(parsed)
                } catch (err) {
                    reject(new Error(`解析 Modrinth 回應資料失敗: ${err.message}`))
                }
            })
        })

        req.on('error', (err) => {
            reject(new Error(`連線至 Modrinth 伺服器失敗: ${err.message}`))
        })

        req.setTimeout(15000, () => {
            req.destroy(new Error('連線 Modrinth 伺服器超時 (15秒)，請檢查網路'))
        })

        req.end()
    })
}

/**
 * Search mods from Modrinth
 * 
 * @param {Object} options
 * @param {string} options.query - search query
 * @param {string} options.category - category tag (e.g. optimization, utility)
 * @param {string} options.index - sorting (downloads, relevance, newest, updated)
 * @param {number} options.limit - number of items to return
 * @param {number} options.offset - offset for pagination
 */
async function searchMods(options = {}) {
    const query = options.query ? encodeURIComponent(options.query.trim()) : ''
    const index = options.index || 'downloads'
    const limit = options.limit || 24
    const offset = options.offset || 0

    // Handle special "installed" category filter
    if (options.category === 'installed') {
        const installedMap = loadInstalledDb()
        const currentFiles = getInstalledFilenames()
        const installedIds = Object.keys(installedMap).filter(id => {
            const rec = installedMap[id]
            return rec && rec.filename && (currentFiles.has(rec.filename) || currentFiles.has(rec.filename + '.disabled'))
        })

        if (installedIds.length === 0) {
            return { total_hits: 0, offset: 0, limit, hits: [] }
        }

        const endpoint = `/projects?ids=${encodeURIComponent(JSON.stringify(installedIds))}`
        const projects = await modrinthFetch(endpoint)
        const hits = (projects || []).map(p => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            description: p.description,
            categories: p.categories || [],
            author: p.author || '社群開發者',
            downloads: p.downloads || 0,
            follows: p.followers || p.follows || 0,
            icon_url: p.icon_url,
            date_modified: p.updated,
            isInstalled: true,
            installedFilename: installedMap[p.id] ? installedMap[p.id].filename : null,
            installedVersionNumber: installedMap[p.id] ? installedMap[p.id].versionNumber : null,
            installedVersionId: installedMap[p.id] ? installedMap[p.id].versionId : null
        }))

        return {
            total_hits: hits.length,
            offset: 0,
            limit: hits.length,
            hits
        }
    }

    // Build facets for Fabric
    const facets = [
        ['project_type:mod'],
        ['categories:fabric']
    ]

    if (options.category && options.category !== 'all') {
        facets.push([`categories:${options.category}`])
    }

    const facetsQuery = encodeURIComponent(JSON.stringify(facets))
    const endpoint = `/search?query=${query}&facets=${facetsQuery}&index=${index}&limit=${limit}&offset=${offset}`
    
    const data = await modrinthFetch(endpoint)
    const installedMap = loadInstalledDb()
    const currentFiles = getInstalledFilenames()

    // Cross reference installed status
    const hits = (data.hits || []).map(hit => {
        const record = installedMap[hit.project_id]
        let isInstalled = false
        let installedFilename = null
        let installedVersionNumber = null
        let installedVersionId = null

        if (record && record.filename) {
            if (currentFiles.has(record.filename) || currentFiles.has(record.filename + '.disabled')) {
                isInstalled = true
                installedFilename = record.filename
                installedVersionNumber = record.versionNumber || null
                installedVersionId = record.versionId || null
            }
        }

        return {
            id: hit.project_id,
            slug: hit.slug,
            title: hit.title,
            description: hit.description,
            categories: hit.categories || [],
            author: hit.author || '社群開發者',
            downloads: hit.downloads || 0,
            follows: hit.follows || 0,
            icon_url: hit.icon_url,
            date_modified: hit.date_modified,
            isInstalled,
            installedFilename,
            installedVersionNumber,
            installedVersionId
        }
    })

    return {
        total_hits: data.total_hits || 0,
        offset: data.offset || 0,
        limit: data.limit || limit,
        hits
    }
}

/**
 * Get project details by ID or slug (links, body, full description)
 */
async function getProjectDetails(projectIdOrSlug) {
    return await modrinthFetch(`/project/${projectIdOrSlug}`)
}

/**
 * Get all Fabric versions of a project for version selection
 */
async function getProjectVersions(projectIdOrSlug) {
    const encodedLoaders = encodeURIComponent(JSON.stringify(['fabric']))
    const versions = await modrinthFetch(`/project/${projectIdOrSlug}/version?loaders=${encodedLoaders}`)
    if (!versions) return []

    const installedMap = loadInstalledDb()
    const currentFiles = getInstalledFilenames()
    const installedRecord = installedMap[projectIdOrSlug]

    let activeFilename = null
    let activeVersionId = null

    if (installedRecord && installedRecord.filename) {
        if (currentFiles.has(installedRecord.filename) || currentFiles.has(installedRecord.filename + '.disabled')) {
            activeFilename = installedRecord.filename
            activeVersionId = installedRecord.versionId || null
        }
    }

    return versions.map(v => {
        const primaryFile = (v.files || []).find(f => f.primary) || (v.files || [])[0]
        const isCurrentInstalled = (activeVersionId && v.id === activeVersionId) || (activeFilename && primaryFile && primaryFile.filename === activeFilename)

        return {
            id: v.id,
            projectId: v.project_id,
            name: v.name,
            versionNumber: v.version_number,
            gameVersions: v.game_versions || [],
            loaders: v.loaders || [],
            versionType: v.version_type || 'release',
            datePublished: v.date_published,
            downloads: v.downloads || 0,
            changelog: v.changelog || '',
            files: v.files || [],
            primaryFile: primaryFile || null,
            isInstalled: isCurrentInstalled,
            isCompatible121: (v.game_versions || []).some(gv => gv.startsWith('1.21')),
            isExact12111: (v.game_versions || []).includes('1.21.11')
        }
    })
}

/**
 * Get a set of all current mod filenames in mods directory
 */
function getInstalledFilenames() {
    const dir = getActiveModsDirectory()
    if (!dir || !fs.existsSync(dir)) return new Set()
    try {
        return new Set(fs.readdirSync(dir))
    } catch (_e) {
        return new Set()
    }
}

/**
 * Find the best compatible file for a project (fabric 1.21.x prioritized)
 */
async function getBestModVersion(projectIdOrSlug) {
    const encodedLoaders = encodeURIComponent(JSON.stringify(['fabric']))
    const versions = await modrinthFetch(`/project/${projectIdOrSlug}/version?loaders=${encodedLoaders}`)
    if (!versions || versions.length === 0) {
        throw new Error('此模組目前沒有相容的 Fabric 版本')
    }

    // Try finding versions with 1.21.11, then any 1.21.x
    let chosenVersion = versions.find(v => v.game_versions && v.game_versions.includes('1.21.11'))

    if (!chosenVersion) {
        chosenVersion = versions.find(v => v.game_versions && v.game_versions.some(gv => gv.startsWith('1.21')))
    }

    // Fallback: take the latest release version if not found
    if (!chosenVersion) {
        chosenVersion = versions.find(v => v.version_type === 'release') || versions[0]
    }

    if (!chosenVersion || !chosenVersion.files || chosenVersion.files.length === 0) {
        throw new Error('未找到可供下載的模組檔案')
    }

    const primaryFile = chosenVersion.files.find(f => f.primary) || chosenVersion.files[0]
    return {
        versionId: chosenVersion.id,
        versionNumber: chosenVersion.version_number,
        name: chosenVersion.name,
        gameVersions: chosenVersion.game_versions,
        file: primaryFile
    }
}

/**
 * Download a file from URL to local path with progress callback
 */
function downloadFile(fileUrl, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        let parsedUrl
        try {
            parsedUrl = new URL(fileUrl)
        } catch (_e) {
            return reject(new Error(`下載網址無效: ${fileUrl}`))
        }

        const client = parsedUrl.protocol === 'https:' ? https : http

        const req = client.get(fileUrl, {
            headers: { 'User-Agent': USER_AGENT }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`下載失敗 (HTTP ${res.statusCode})`))
            }

            const totalBytes = parseInt(res.headers['content-length'], 10) || 0
            let downloadedBytes = 0

            const fileStream = fs.createWriteStream(destPath)

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length
                if (totalBytes > 0 && typeof onProgress === 'function') {
                    const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                    onProgress(percent)
                }
            })

            res.pipe(fileStream)

            fileStream.on('finish', () => {
                fileStream.close(() => resolve(destPath))
            })

            fileStream.on('error', (err) => {
                try { fs.removeSync(destPath) } catch (_e) { /* Best effort cleanup. */ }
                reject(err)
            })
        })

        req.on('error', (err) => {
            try { fs.removeSync(destPath) } catch (_e) { /* Best effort cleanup. */ }
            reject(new Error(`下載模組失敗: ${err.message}`))
        })

        req.setTimeout(45000, () => {
            req.destroy(new Error('下載超時 (45秒)'))
        })
    })
}

/**
 * Install a mod by project ID or slug (automatically picks recommended compatible version)
 */
async function installMod(projectIdOrSlug, onProgress) {
    const modsDir = getActiveModsDirectory()
    if (!modsDir) {
        throw new Error('找不到遊戲本機模組目錄')
    }

    // 1. Get best version and download link
    const best = await getBestModVersion(projectIdOrSlug)
    return await installModVersion(projectIdOrSlug, best.versionId, onProgress)
}

/**
 * Install a SPECIFIC version of a mod by version ID (with automatic older version replacement)
 */
async function installModVersion(projectIdOrSlug, versionId, onProgress) {
    const modsDir = getActiveModsDirectory()
    if (!modsDir) {
        throw new Error('找不到遊戲本機模組目錄')
    }

    // 1. Query version information
    const versionObj = await modrinthFetch(`/version/${versionId}`)
    if (!versionObj || !versionObj.files || versionObj.files.length === 0) {
        throw new Error('該版本未包含有效的模組檔案')
    }

    const primaryFile = versionObj.files.find(f => f.primary) || versionObj.files[0]
    const filename = primaryFile.filename
    const destPath = path.join(modsDir, filename)

    // 2. Check if an older/different version of this mod was previously installed
    const db = loadInstalledDb()
    const oldRecord = db[projectIdOrSlug]

    if (oldRecord && oldRecord.filename && oldRecord.filename !== filename) {
        const oldFile = path.join(modsDir, oldRecord.filename)
        const oldDisabledFile = path.join(modsDir, oldRecord.filename + '.disabled')
        try {
            if (fs.existsSync(oldFile)) fs.removeSync(oldFile)
            if (fs.existsSync(oldDisabledFile)) fs.removeSync(oldDisabledFile)
            console.log(`[ModMarket] Removed previous version file: ${oldRecord.filename}`)
        } catch (e) {
            console.warn(`[ModMarket] Could not clean up old version file: ${oldRecord.filename}`, e)
        }
    }

    // 3. Download the new version file
    await downloadFile(primaryFile.url, destPath, onProgress)

    // 4. Update database
    db[projectIdOrSlug] = {
        projectId: projectIdOrSlug,
        versionId: versionObj.id,
        versionNumber: versionObj.version_number,
        filename: filename,
        installedAt: new Date().toISOString(),
        fileSize: primaryFile.size,
        gameVersions: versionObj.game_versions || []
    }
    saveInstalledDb(db)

    return {
        success: true,
        filename: filename,
        versionId: versionObj.id,
        versionNumber: versionObj.version_number
    }
}

/**
 * Uninstall a mod
 */
async function uninstallMod(projectIdOrSlug) {
    const modsDir = getActiveModsDirectory()
    if (!modsDir) return false

    const db = loadInstalledDb()
    const record = db[projectIdOrSlug]
    let filename = record ? record.filename : null

    // Try matching files if not in DB
    if (!filename && fs.existsSync(modsDir)) {
        try {
            const files = fs.readdirSync(modsDir)
            const match = files.find(f => f.toLowerCase().includes(projectIdOrSlug.toLowerCase()))
            if (match) filename = match
        } catch (_e) {
            filename = filename || null
        }
    }

    if (filename) {
        const targetPath = path.join(modsDir, filename)
        const disabledPath = path.join(modsDir, filename + '.disabled')

        if (fs.existsSync(targetPath)) {
            try { fs.removeSync(targetPath) } catch (e) { console.error('Failed to remove file:', e) }
        }
        if (fs.existsSync(disabledPath)) {
            try { fs.removeSync(disabledPath) } catch (e) { console.error('Failed to remove disabled file:', e) }
        }
    }

    delete db[projectIdOrSlug]
    saveInstalledDb(db)
    return true
}

module.exports = {
    searchMods,
    installMod,
    installModVersion,
    uninstallMod,
    getActiveModsDirectory,
    getBestModVersion,
    getInstalledCount,
    getProjectVersions,
    getProjectDetails,
    loadInstalledDb
}
