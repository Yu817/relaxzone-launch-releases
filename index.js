const remoteMain = require('@electron/remote/main')
remoteMain.initialize()

// Requirements
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const autoUpdater                       = require('electron-updater').autoUpdater
const ejse                              = require('ejs-electron')
const isDev                             = require('./app/assets/js/isdev')
const path                              = require('path')
const { pathToFileURL }                 = require('url')
const { MSFT_OPCODE, MSFT_REPLY_TYPE, MSFT_ERROR, SHELL_OPCODE } = require('./app/assets/js/ipcconstants')
const LangLoader                        = require('./app/assets/js/langloader')

// Setup Lang
LangLoader.setupLanguage()

// Setup auto updater.
let autoUpdaterInitialized = false
let autoUpdaterInstallStarted = false
let autoUpdaterEventSender = null

function sendAutoUpdateNotification(arg, info) {
    if(autoUpdaterEventSender && !autoUpdaterEventSender.isDestroyed()){
        autoUpdaterEventSender.send('autoUpdateNotification', arg, info)
    }
}

function initAutoUpdater(event) {

    autoUpdaterEventSender = event.sender
    if(autoUpdaterInitialized){
        return
    }
    autoUpdaterInitialized = true

    // Only stable launcher releases are distributed to players.
    autoUpdater.allowPrerelease = false
    
    if(isDev){
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = false
        autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml')
    } else {
        // Windows/Linux updates are downloaded and installed automatically.
        // macOS keeps the existing manual DMG flow because the app is not
        // distributed through a signed auto-update channel.
        autoUpdater.autoDownload = process.platform !== 'darwin'
        autoUpdater.autoInstallOnAppQuit = process.platform !== 'darwin'
    }
    if(process.platform === 'darwin'){
        autoUpdater.autoDownload = false
    }
    autoUpdater.on('update-available', (info) => {
        sendAutoUpdateNotification('update-available', info)
    })
    autoUpdater.on('update-downloaded', (info) => {
        sendAutoUpdateNotification('update-downloaded', info)

        // Do not ask the player whether to update. Once the installer has
        // finished downloading, silently install it and relaunch the launcher.
        if(!isDev && process.platform !== 'darwin' && !autoUpdaterInstallStarted){
            autoUpdaterInstallStarted = true
            setTimeout(() => {
                autoUpdater.quitAndInstall(true, true)
            }, 500)
        }
    })
    autoUpdater.on('download-progress', (progress) => {
        sendAutoUpdateNotification('download-progress', progress)
    })
    autoUpdater.on('update-not-available', (info) => {
        sendAutoUpdateNotification('update-not-available', info)
    })
    autoUpdater.on('checking-for-update', () => {
        sendAutoUpdateNotification('checking-for-update')
    })
    autoUpdater.on('error', (err) => {
        sendAutoUpdateNotification('realerror', err)
    }) 
}

// Open channel to listen for update actions.
ipcMain.on('autoUpdateAction', (event, arg, _data) => {
    switch(arg){
        case 'initAutoUpdater':
            console.log('Initializing auto updater.')
            initAutoUpdater(event)
            event.sender.send('autoUpdateNotification', 'ready')
            break
        case 'checkForUpdate':
            autoUpdater.checkForUpdates()
                .catch(err => {
                    sendAutoUpdateNotification('realerror', err)
                })
            break
        case 'installUpdateNow':
            autoUpdater.quitAndInstall()
            break
        default:
            console.log('Unknown argument', arg)
            break
    }
})
// Cache distribution index event from preloader and redirect to renderer.
let cachedDistributionResult = null
ipcMain.on('distributionIndexDone', (event, res) => {
    cachedDistributionResult = res
    event.sender.send('distributionIndexDone', res)
})
ipcMain.on('requestDistributionIndexDone', (event) => {
    if(cachedDistributionResult != null){
        event.sender.send('distributionIndexDone', cachedDistributionResult)
    }
})

// Handle trash item.
ipcMain.handle(SHELL_OPCODE.TRASH_ITEM, async (event, ...args) => {
    try {
        await shell.trashItem(args[0])
        return {
            result: true
        }
    } catch(error) {
        return {
            result: false,
            error: error
        }
    }
})

// Disable hardware acceleration.
// https://electronjs.org/docs/tutorial/offscreen-rendering
app.disableHardwareAcceleration()

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore()
            win.focus()
        }
    })
}


const REDIRECT_URI_PREFIX = 'https://login.live.com/oauth20_desktop.srf'

// Microsoft Auth Login
let msftAuthWindow
let msftAuthSuccess
let msftAuthViewSuccess
let msftAuthViewOnClose
ipcMain.on(MSFT_OPCODE.OPEN_LOGIN, (ipcEvent, ...arguments_) => {
    if (msftAuthWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN, msftAuthViewOnClose)
        return
    }
    msftAuthSuccess = false
    msftAuthViewSuccess = arguments_[0]
    msftAuthViewOnClose = arguments_[1]
    msftAuthWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLoginTitle') || 'Microsoft 登入',
        backgroundColor: '#1a1829',
        width: 520,
        height: 650,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftAuthWindow.on('closed', () => {
        msftAuthWindow = undefined
    })

    msftAuthWindow.on('close', () => {
        if(!msftAuthSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED, msftAuthViewOnClose)
        }
    })

    function handleOAuthRedirect(uri) {
        if (uri && uri.startsWith(REDIRECT_URI_PREFIX)) {
            let queryMap = {}
            try {
                new URL(uri).searchParams.forEach((v, k) => {
                    queryMap[k] = v
                })
            } catch(err) {
                console.error('Error parsing OAuth redirect URL:', err)
            }

            const returnView = queryMap.error ? msftAuthViewOnClose : msftAuthViewSuccess
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGIN, MSFT_REPLY_TYPE.SUCCESS, queryMap, returnView)

            msftAuthSuccess = true
            if (msftAuthWindow) {
                msftAuthWindow.close()
                msftAuthWindow = null
            }
            return true
        }
        return false
    }

    msftAuthWindow.webContents.on('did-navigate', (_, uri) => {
        handleOAuthRedirect(uri)
    })
    msftAuthWindow.webContents.on('will-redirect', (event, uri) => {
        if (handleOAuthRedirect(uri)) {
            event.preventDefault()
        }
    })

    msftAuthWindow.removeMenu()
    const msmc = require('msmc')
    const auth = new msmc.Auth('select_account')
    let authUrl = auth.createLink()
    if (authUrl.includes('&mkt=')) {
        authUrl = authUrl.replace(/&mkt=[^&]+/, '&mkt=zh-TW')
    } else {
        authUrl += '&mkt=zh-TW'
    }
    msftAuthWindow.loadURL(authUrl)
})

// Microsoft Auth Logout
let msftLogoutWindow
let msftLogoutSuccess
let msftLogoutSuccessSent
ipcMain.on(MSFT_OPCODE.OPEN_LOGOUT, (ipcEvent, uuid, isLastAccount) => {
    if (msftLogoutWindow) {
        ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.ALREADY_OPEN)
        return
    }

    msftLogoutSuccess = false
    msftLogoutSuccessSent = false
    msftLogoutWindow = new BrowserWindow({
        title: LangLoader.queryJS('index.microsoftLogoutTitle'),
        backgroundColor: '#222222',
        width: 520,
        height: 600,
        frame: true,
        icon: getPlatformIcon('SealCircle')
    })

    msftLogoutWindow.on('closed', () => {
        msftLogoutWindow = undefined
    })

    msftLogoutWindow.on('close', () => {
        if(!msftLogoutSuccess) {
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.ERROR, MSFT_ERROR.NOT_FINISHED)
        } else if(!msftLogoutSuccessSent) {
            msftLogoutSuccessSent = true
            ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
        }
    })
    
    msftLogoutWindow.webContents.on('did-navigate', (_, uri) => {
        if(uri.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/logoutsession') || uri.startsWith('https://login.live.com/oauth20_logout.srf')) {
            msftLogoutSuccess = true
            setTimeout(() => {
                if(!msftLogoutSuccessSent) {
                    msftLogoutSuccessSent = true
                    ipcEvent.reply(MSFT_OPCODE.REPLY_LOGOUT, MSFT_REPLY_TYPE.SUCCESS, uuid, isLastAccount)
                }

                if(msftLogoutWindow) {
                    msftLogoutWindow.close()
                    msftLogoutWindow = null
                }
            }, 5000)
        }
    })
    
    msftLogoutWindow.removeMenu()
    msftLogoutWindow.loadURL('https://login.microsoftonline.com/common/oauth2/v2.0/logout')
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {

    win = new BrowserWindow({
        width: 1280,
        height: 960,
        minWidth: 1024,
        minHeight: 720,
        center: true,
        icon: getPlatformIcon('SealCircle'),
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'app', 'assets', 'js', 'preloader.js'),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: isDev
        },
        backgroundColor: '#171614'
    })
    remoteMain.enable(win.webContents)

    const data = {
        lang: (str, placeHolders) => LangLoader.queryEJS(str, placeHolders)
    }
    Object.entries(data).forEach(([key, val]) => ejse.data(key, val))

    win.loadURL(pathToFileURL(path.join(__dirname, 'app', 'app.ejs')).toString())

    /*win.once('ready-to-show', () => {
        win.show()
    })*/

    win.removeMenu()

    win.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer L${level}] ${message} (${sourceId}:${line})`)
    })

    win.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.key.toLowerCase() === 'r' && input.type === 'keyDown') {
            win.reload()
            event.preventDefault()
        }
    })

    win.resizable = true

    win.on('closed', () => {
        win = null
    })
}

function createMenu() {
    
    if(process.platform === 'darwin') {

        // Extend default included application menu to continue support for quit keyboard shortcut
        let applicationSubMenu = {
            label: 'Application',
            submenu: [{
                label: 'About Application',
                selector: 'orderFrontStandardAboutPanel:'
            }, {
                type: 'separator'
            }, {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: () => {
                    app.quit()
                }
            }]
        }

        // New edit menu adds support for text-editing keyboard shortcuts
        let editSubMenu = {
            label: 'Edit',
            submenu: [{
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                selector: 'undo:'
            }, {
                label: 'Redo',
                accelerator: 'Shift+CmdOrCtrl+Z',
                selector: 'redo:'
            }, {
                type: 'separator'
            }, {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                selector: 'cut:'
            }, {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                selector: 'copy:'
            }, {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                selector: 'paste:'
            }, {
                label: 'Select All',
                accelerator: 'CmdOrCtrl+A',
                selector: 'selectAll:'
            }]
        }

        // Bundle submenus into a single template and build a menu object with it
        let menuTemplate = [applicationSubMenu, editSubMenu]
        let menuObject = Menu.buildFromTemplate(menuTemplate)

        // Assign it to the application
        Menu.setApplicationMenu(menuObject)

    }

}

function getPlatformIcon(filename){
    return path.join(__dirname, 'app', 'assets', 'images', `${filename}.png`)
}

app.on('ready', createWindow)
app.on('ready', createMenu)

app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})
