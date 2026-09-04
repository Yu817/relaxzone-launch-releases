/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 *
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 *
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 *
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 *
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 *
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind mod market button
const modmarketBtn = document.getElementById('modmarketMediaButton')
if (modmarketBtn) {
    modmarketBtn.onclick = async e => {
        if (typeof window.rzRefreshMarketOnOpen === 'function') {
            window.rzRefreshMarketOnOpen()
        }
        switchView(getCurrentView(), VIEWS.modmarket)
    }
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
            const avatarHead = document.getElementById('rz_avatar_head')
            if(avatarHead){
                avatarHead.src = `https://mc-heads.net/avatar/${authUser.uuid}/32`
            }
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    const serverName = serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection')
    server_selection_button.innerHTML = `
        <span class="rz_server_btn_icon">🏰</span>
        <span class="rz_server_btn_name">${serverName}</span>
        <span class="rz_server_btn_arrow">
            <svg viewBox="0 0 10 6" width="10" height="6">
                <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
        </span>
    `
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = `
    <span class="rz_server_btn_icon">🏰</span>
    <span class="rz_server_btn_name">${Lang.queryJS('landing.selectedServer.loading')}</span>
    <span class="rz_server_btn_arrow">
        <svg viewBox="0 0 10 6" width="10" height="6">
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
    </span>
`
server_selection_button.onclick = async e => {
    (e.currentTarget || server_selection_button).blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }

    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }

    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    let isOnline = false
    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    try {
        const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        if(serv){
            const servStat = await getServerStatus(47, serv.hostname, serv.port)
            console.log('Server status result:', servStat)
            pLabel = Lang.queryJS('landing.serverStatus.players')
            pVal = `${servStat.players.online} / ${servStat.players.max}`
            isOnline = true
        }
    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }

    const applyStatus = () => {
        const lbl = document.getElementById('landingPlayerLabel')
        const cnt = document.getElementById('player_count')
        const dot = document.getElementById('server_status_dot')
        if (lbl) lbl.innerHTML = pLabel
        if (cnt) cnt.innerHTML = pVal
        if (dot) {
            dot.className = isOnline ? 'rz_status_dot_indicator online' : 'rz_status_dot_indicator offline'
        }
    }

    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            applyStatus()
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        applyStatus()
    }
}

// 點擊伺服器狀態卡片可手動重新整理
const statusWrapperEl = document.getElementById('server_status_wrapper')
if(statusWrapperEl){
    statusWrapperEl.onclick = () => {
        refreshServerStatus(true)
    }
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 *
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 *
 * @param {boolean} launchAfter Whether we should begin to launch after scanning.
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)

            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ''
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ''
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), err.message || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return
    }


    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        let isGameRunning = false
        const onLoadComplete = () => {
            isGameRunning = true
            toggleLaunchArea(false)
            if(hasRPC){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                proc.stdout.on('data', gameStateChange)
            }
            proc.stdout.removeListener('data', tempListener)
            proc.stderr.removeListener('data', gameErrorListener)
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        let errorOutput = ''
        const gameErrorListener = function(data){
            const str = data.toString()
            errorOutput += str
            if(str.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()

            // Bind listeners to stdout.
            proc.stdout.on('data', tempListener)
            proc.stderr.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            // Handle process exit / close
            proc.on('close', (code, signal) => {
                if(!isGameRunning && code !== 0 && code !== null){
                    loggerLaunchSuite.error(`Game process exited early with code ${code}: ${errorOutput}`)
                    toggleLaunchArea(false)
                    showLaunchFailure('遊戲啟動異常中斷', `遊戲行程非預期結束 (代碼 ${code})。<br><br>${errorOutput.slice(-300) || '請檢查 Java 版本或防毒軟體設定。'}`)
                }
                if(hasRPC){
                    loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
                    DiscordWrapper.shutdownRPC()
                    hasRPC = false
                }
                proc = null
            })

            // Init Discord Hook
            if(distro.rawDistribution.discord != null && serv.rawServer.discord != null){
                DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
                hasRPC = true
            }

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 *
 * @param {boolean} up True to slide up, otherwise false.
 */
/**
 * Show the news UI via a slide animation.
 *
 * @param {boolean} up True to slide up, otherwise false.
 */
function slide_(up){
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.getElementById('newsContainer')
    const hero = document.querySelector('.rz_hero_center')
    const deck = document.querySelector('.rz_bottom_deck')

    if(!newsContainer){
        return
    }

    newsGlideCount++

    if(up){
        newsContainer.style.display = 'flex'
        void newsContainer.offsetHeight
        newsContainer.style.top = '0px'

        if(hero){
            hero.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
            hero.style.opacity = '0'
            hero.style.transform = 'translateY(-20px)'
            hero.style.pointerEvents = 'none'
        }
        if(deck){
            deck.style.transition = 'opacity 0.35s ease, transform 0.35s ease'
            deck.style.opacity = '0'
            deck.style.transform = 'translateY(20px)'
            deck.style.pointerEvents = 'none'
        }
        if(landingContainer){
            landingContainer.style.background = 'rgba(0, 0, 0, 0.65)'
        }
    } else {
        newsContainer.style.top = '100%'

        if(hero){
            hero.style.opacity = '1'
            hero.style.transform = 'none'
            hero.style.pointerEvents = 'all'
        }
        if(deck){
            deck.style.opacity = '1'
            deck.style.transform = 'none'
            deck.style.pointerEvents = 'all'
        }
        if(landingContainer){
            landingContainer.style.background = null
        }
        setTimeout(() => {
            if(!newsActive){
                newsContainer.style.display = 'none'
            }
        }, 400)
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Bind news close button.
const newsCloseBtnEl = document.getElementById('newsCloseButton')
if(newsCloseBtnEl){
    newsCloseBtnEl.onclick = () => {
        document.getElementById('newsButton').click()
    }
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 *
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 *
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 *
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)

            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        if(e.key === 'Escape'){
            document.getElementById('newsButton').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 *
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

// Google Spreadsheet Announcement Configuration
const GOOGLE_SHEET_NEWS_ID = '1eKRBorkgPCo0dJqm2RjfXNMxdXACTMloNeQNV2Wy0Ms'
const GOOGLE_SHEET_NEWS_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_NEWS_ID}/export?format=csv`

/**
 * Robust CSV parser for Google Sheets export format.
 *
 * @param {string} text The raw CSV text.
 * @returns {Array<Array<string>>} Parsed rows.
 */
function parseCSV(text){
    const rows = []
    let currentRow = []
    let currentField = ''
    let inQuotes = false

    for(let i = 0; i < text.length; i++){
        const char = text[i]
        const nextChar = text[i + 1]
        if(char === '"'){
            if(inQuotes && nextChar === '"'){
                currentField += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if(char === ',' && !inQuotes){
            currentRow.push(currentField.trim())
            currentField = ''
        } else if((char === '\r' || char === '\n') && !inQuotes){
            if(char === '\r' && nextChar === '\n'){
                i++
            }
            currentRow.push(currentField.trim())
            if(currentRow.some(field => field.length > 0)){
                rows.push(currentRow)
            }
            currentRow = []
            currentField = ''
        } else {
            currentField += char
        }
    }

    if(currentField.length > 0 || currentRow.length > 0){
        currentRow.push(currentField.trim())
        if(currentRow.some(field => field.length > 0)){
            rows.push(currentRow)
        }
    }

    return rows
}

/**
 * Determine the CSS class for a tag based on user type or tag text.
 *
 * @param {string} tagText Tag label.
 * @param {string} tagType Optional type identifier.
 * @returns {string} CSS class name.
 */
function resolveTagClass(tagText, tagType){
    const type = (tagType || '').toLowerCase().trim()
    const validTypes = ['dungeon', 'event', 'notice', 'update', 'system', 'danger', 'alert', 'success', 'info']
    if(validTypes.includes(type)){
        return `tag_${type}`
    }

    const t = (tagText || '').toLowerCase()
    if(t.includes('副本') || t.includes('王') || t.includes('boss')){
        return 'tag_dungeon'
    }
    if(t.includes('活動') || t.includes('玩法') || t.includes('節日')){
        return 'tag_event'
    }
    if(t.includes('維護') || t.includes('緊急') || t.includes('注意') || t.includes('修復')){
        return 'tag_notice'
    }
    if(t.includes('更新') || t.includes('版本') || t.includes('改版') || t.includes('新增')){
        return 'tag_update'
    }
    if(t.includes('系統') || t.includes('通知') || t.includes('規則')){
        return 'tag_system'
    }
    return 'tag_default'
}

/**
 * Escape HTML special characters to prevent injection.
 *
 * @param {string} str Raw string.
 * @returns {string} Escaped string.
 */
function escapeHtml(str){
    if(!str) return ''
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * Render parsed announcements onto the homepage news strip.
 *
 * @param {Array<Object>} newsItems The list of announcement objects.
 */
function renderHomepageNewsStrip(newsItems){
    const container = document.getElementById('rz_news_items')
    if(!container || !newsItems || newsItems.length === 0){
        return
    }

    container.innerHTML = ''
    const displayCount = Math.min(newsItems.length, 3)

    for(let i = 0; i < displayCount; i++){
        const item = newsItems[i]
        const itemEl = document.createElement('div')
        itemEl.className = 'rz_news_item'

        const tagClass = resolveTagClass(item.tag, item.type)
        itemEl.innerHTML = `
            <span class="rz_news_tag ${tagClass}">${escapeHtml(item.tag)}</span>
            <span class="rz_news_text">${escapeHtml(item.text)}</span>
            <span class="rz_news_date">${escapeHtml(item.date)}</span>
        `

        if(item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))){
            itemEl.title = `點擊開啟連結: ${item.link}`
            itemEl.onclick = (e) => {
                e.stopPropagation()
                shell.openExternal(item.link)
            }
        } else {
            itemEl.onclick = () => {
                document.getElementById('newsButton').click()
            }
        }

        container.appendChild(itemEl)
    }
}

/**
 * Fetch announcement data from Google Sheets CSV endpoint.
 *
 * @returns {Promise<Array<Object>|null>} List of announcements or null if failed.
 */
async function fetchSpreadsheetNews(){
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4500)

        const response = await fetch(GOOGLE_SHEET_NEWS_URL, {
            signal: controller.signal,
            cache: 'no-store'
        })
        clearTimeout(timeoutId)

        if(!response.ok){
            loggerLanding.warn(`Google Sheet fetch returned HTTP status ${response.status}`)
            return null
        }

        const text = await response.text()
        if(!text || text.trim().length === 0){
            loggerLanding.debug('Google Sheet returned empty content.')
            return null
        }

        const rawRows = parseCSV(text)
        if(!rawRows || rawRows.length === 0){
            return null
        }

        let rows = rawRows
        // Skip header row if present
        if(rows[0] && rows[0][0]){
            const headerStr = rows[0].join(' ').toLowerCase()
            if(headerStr.includes('標籤') || headerStr.includes('tag') || headerStr.includes('類型') || headerStr.includes('內容') || headerStr.includes('title')){
                rows = rows.slice(1)
            }
        }

        const newsItems = []
        for(const row of rows){
            if(!row || row.length === 0){
                continue
            }
            let tag = ''
            let type = ''
            let contentText = ''
            let date = ''
            let link = ''

            if(row.length >= 5){
                tag = row[0]
                type = row[1]
                contentText = row[2]
                date = row[3]
                link = row[4]
            } else if(row.length === 4){
                tag = row[0]
                type = row[1]
                contentText = row[2]
                date = row[3]
            } else if(row.length === 3){
                tag = row[0]
                contentText = row[1]
                date = row[2]
            } else if(row.length === 2){
                tag = row[0]
                contentText = row[1]
            } else if(row.length === 1){
                tag = '公告'
                contentText = row[0]
            }

            if(!contentText && !tag){
                continue
            }

            newsItems.push({
                tag: tag || '公告',
                type: type || '',
                text: contentText || tag,
                date: date || '',
                link: link || ''
            })
        }

        return newsItems
    } catch(err){
        loggerLanding.warn('Failed to fetch news from Google Sheet:', err.message)
        return null
    }
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index, or fall back to Google Sheets news.
 */
async function loadNews(){

    // First attempt to fetch Google Sheet news and update the homepage strip
    const sheetNews = await fetchSpreadsheetNews()
    if(sheetNews && sheetNews.length > 0){
        renderHomepageNewsStrip(sheetNews)
    }

    const distroData = await DistroAPI.getDistribution()
    if(distroData.rawDistribution && distroData.rawDistribution.rss) {
        try {
            const newsFeed = distroData.rawDistribution.rss
            const newsHost = new URL(newsFeed).origin + '/'
            const data = await $.ajax({ url: newsFeed, timeout: 2500 })
            const items = $(data).find('item')
            const articles = []

            for(let i=0; i<items.length; i++){
                const el = $(items[i])
                const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
                let comments = el.find('slash\\:comments').text() || '0'
                comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                let content = el.find('content\\:encoded').text()
                let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                let matches
                while((matches = regex.exec(content))){
                    content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                }

                let link   = el.find('link').text()
                let title  = el.find('title').text()
                let author = el.find('dc\\:creator').text()

                articles.push({
                    link,
                    title,
                    date,
                    author,
                    content,
                    comments,
                    commentsLink: link + '#comments'
                })
            }
            return { articles }
        } catch(err){
            loggerLanding.warn('RSS load failed, falling back to Google Sheet articles.')
        }
    }

    // If no RSS or RSS failed, use Google Sheet articles if available
    if(sheetNews && sheetNews.length > 0){
        const articles = sheetNews.map(item => {
            const hasLink = item.link && (item.link.startsWith('http://') || item.link.startsWith('https://'))
            let contentHtml = `<div style="font-size: 15px; line-height: 1.8; color: #e2e8f0; white-space: pre-wrap;">${escapeHtml(item.text)}</div>`
            if(hasLink){
                contentHtml += `<div style="margin-top: 20px;"><a href="${escapeHtml(item.link)}" onclick="shell.openExternal('${escapeHtml(item.link)}'); return false;" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.4); color: #38bdf8; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer;"><span>🔗 前往相關網址</span></a></div>`
            }
            return {
                link: item.link || '#',
                title: `【${item.tag}】 ${item.text.length > 30 ? item.text.substring(0, 30) + '...' : item.text}`,
                date: item.date || '最新公告',
                author: 'Relax Zone 悠然之境',
                content: contentHtml,
                comments: '0 Comments',
                commentsLink: '#'
            }
        })
        return { articles }
    }

    loggerLanding.debug('No RSS feed and no Google Sheet articles available.')
    return null
}
