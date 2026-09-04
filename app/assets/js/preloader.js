const {ipcRenderer}  = require('electron')
const fs             = require('fs-extra')
const os             = require('os')
const path           = require('path')

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const { LoggerUtil } = require('helios-core')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Load ConfigManager
ConfigManager.load()

// Yuck!
// TODO Fix this
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

// Load Strings
LangLoader.setupLanguage()

/**
 * 
 * @param {Object} data
 */
function onDistroLoad(data){
    if(data != null){
        
        // Resolve the selected server: default to the main server (Relax Zone Fabric 1.21.1)
        const currentServer = ConfigManager.getSelectedServer()
        if(currentServer == null || data.getServerById(currentServer) == null){
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    ipcRenderer.send('distributionIndexDone', data != null)
}

// Ensure distribution.json & distribution_dev.json are synchronized from distribution_relaxzone.json
const cachedDistroPath = path.join(ConfigManager.getLauncherDirectory(), 'distribution.json')
const cachedDevDistroPath = path.join(ConfigManager.getLauncherDirectory(), 'distribution_dev.json')
const localDistroPath = path.join(__dirname, '..', '..', '..', 'distribution_relaxzone.json')
if(fs.existsSync(localDistroPath)){
    try {
        fs.copySync(localDistroPath, cachedDistroPath)
        fs.copySync(localDistroPath, cachedDevDistroPath)
        logger.info('Synchronized distribution_relaxzone.json to launcher directory.')
    } catch(e) {
        logger.warn('Failed to sync local distribution_relaxzone.json:', e)
    }
}

// Ensure Distribution is downloaded and cached.
DistroAPI.getDistribution()
    .then(distribution => {
        logger.info('Loaded distribution index.')

        onDistroLoad(distribution)
    })
    .catch(err => {
        logger.info('Failed to load an older version of the distribution index.')
        logger.info('Application cannot run.')
        logger.error(err)

        onDistroLoad(null)
    })

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})
