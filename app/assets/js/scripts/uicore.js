/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')

// Keep this in sync with the GitHub publish target in electron-builder.yml.
const UPDATE_RELEASE_BASE_URL = 'https://github.com/Yu817/relaxzone-launch-releases/releases/download'

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

let updateStatusHideTimer
let activeUpdateVersion = null

function updateText(key, placeholders = null){
    return Lang.queryJS(`uicore.autoUpdate.${key}`, placeholders)
}

function showLauncherUpdateStatus(state, info = null){
    const overlay = document.getElementById('launcherUpdateOverlay')
    const modal = document.getElementById('launcherUpdateModal')
    const icon = document.getElementById('launcherUpdateModalIcon')
    const title = document.getElementById('launcherUpdateModalTitle')
    const description = document.getElementById('launcherUpdateModalDescription')
    const progress = document.getElementById('launcherUpdateProgress')
    const progressBar = document.getElementById('launcherUpdateProgressBar')
    const progressText = document.getElementById('launcherUpdateProgressText')
    const acknowledge = document.getElementById('launcherUpdateAcknowledge')

    if(!overlay || !modal || !icon || !title || !description || !progress || !progressBar || !progressText || !acknowledge){
        return
    }

    if(updateStatusHideTimer){
        clearTimeout(updateStatusHideTimer)
        updateStatusHideTimer = null
    }

    const version = info && info.version ? info.version : activeUpdateVersion
    const percent = info && Number.isFinite(Number(info.percent)) ? Math.max(0, Math.min(100, Number(info.percent))) : 0

    modal.dataset.state = state
    acknowledge.style.display = state === 'error' ? 'inline-flex' : 'none'
    acknowledge.innerText = updateText('acknowledgeButton')
    acknowledge.onclick = () => hideLauncherUpdateStatus()
    progress.style.display = state === 'downloading' || state === 'installing' ? 'block' : 'none'
    progressText.style.display = state === 'downloading' ? 'block' : 'none'
    progressBar.style.width = `${state === 'installing' ? 100 : percent}%`

    switch(state){
        case 'available':
            icon.innerText = '↓'
            title.innerText = version
                ? updateText('availableModalTitle', { version })
                : updateText('availableModalTitleFallback')
            description.innerText = updateText('availableModalDescription')
            break
        case 'downloading':
            icon.innerText = '↓'
            title.innerText = updateText('downloadingModalTitle')
            description.innerText = version
                ? updateText('downloadingModalDescription', { version })
                : updateText('downloadingModalDescriptionFallback')
            progressText.innerText = `${percent.toFixed(0)}%`
            break
        case 'installing':
            icon.innerText = '↻'
            title.innerText = updateText('installingModalTitle')
            description.innerText = updateText('installingModalDescription')
            break
        case 'latest':
            icon.innerText = '✓'
            title.innerText = updateText('latestModalTitle')
            description.innerText = updateText('latestModalDescription')
            break
        case 'error':
            icon.innerText = '!'
            title.innerText = updateText('errorModalTitle')
            description.innerText = updateText('errorModalDescription')
            break
        case 'checking':
        default:
            icon.innerText = '↻'
            title.innerText = updateText('checkingModalTitle')
            description.innerText = updateText('checkingModalDescription')
            break
    }

    overlay.style.display = 'flex'
    overlay.setAttribute('aria-hidden', 'false')
}

function hideLauncherUpdateStatus(delay = 0){
    const overlay = document.getElementById('launcherUpdateOverlay')
    if(!overlay){
        return
    }
    if(updateStatusHideTimer){
        clearTimeout(updateStatusHideTimer)
        updateStatusHideTimer = null
    }
    if(delay > 0){
        updateStatusHideTimer = setTimeout(() => hideLauncherUpdateStatus(), delay)
        return
    }
    overlay.style.display = 'none'
    overlay.setAttribute('aria-hidden', 'true')
}

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                showLauncherUpdateStatus('checking')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)
                activeUpdateVersion = info.version
                showLauncherUpdateStatus('available', info)
                
                if(process.platform === 'darwin'){
                    info.darwindownload = `${UPDATE_RELEASE_BASE_URL}/v${info.version}/RelaxZone-Launcher-Setup-${info.version}-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
                    showUpdateUI(info)
                }
                
                populateSettingsUpdateInformation(info)
                break
            case 'download-progress':
                showLauncherUpdateStatus('downloading', {
                    percent: info.percent,
                    version: activeUpdateVersion
                })
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                activeUpdateVersion = info.version
                showLauncherUpdateStatus('installing', info)
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installingButton'), true)
                showUpdateUI(info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                showLauncherUpdateStatus('latest')
                hideLauncherUpdateStatus(900)
                activeUpdateVersion = null
                populateSettingsUpdateInformation(null)
                break
            case 'ready':
                if(!updateCheckListener){
                    updateCheckListener = setInterval(() => {
                        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                    }, 1800000)
                }
                ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                break
            case 'realerror':
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                showLauncherUpdateStatus('error', info)
                showSettingsUpdateCheckError()
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

function showUpdateUI(info){
    //TODO Make this message a bit more informative `${info.version}`
    document.getElementById('image_seal_container').setAttribute('update', true)
    document.getElementById('image_seal_container').onclick = () => {
        /*setOverlayContent('Update Available', 'A new update for the launcher is available. Would you like to install now?', 'Install', 'Later')
        setOverlayHandler(() => {
            if(!isDev){
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            } else {
                console.error('Cannot install updates in development environment.')
                toggleOverlay(false)
            }
        })
        setDismissHandler(() => {
            toggleOverlay(false)
        })
        toggleOverlay(true, true)*/
        switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
            settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
        })
    }
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Bind restore down button.
        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                if(window.isMaximized()){
                    window.unmaximize()
                } else {
                    window.maximize()
                }
                document.activeElement.blur()
            })
        })

        // Bind settings button in frame.
        Array.from(document.getElementsByClassName('fSb')).map((val) => {
            val.addEventListener('click', e => {
                const settingsBtn = document.getElementById('settingsMediaButton')
                if(settingsBtn) {
                    settingsBtn.click()
                }
                document.activeElement.blur()
            })
        })

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if(document.readyState === 'complete'){

        //266.01
        //170.8
        //53.21
        // Bind progress bar length to length of bot wrapper
        //const targetWidth = document.getElementById("launch_content").getBoundingClientRect().width
        //const targetWidth2 = document.getElementById("server_selection").getBoundingClientRect().width
        //const targetWidth3 = document.getElementById("launch_button").getBoundingClientRect().width

        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
        
    }

}, false)

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
})
