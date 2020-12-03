import { app as rawApp, dialog, ipcMain, powerMonitor } from 'electron'
import { copyFile } from 'fs-extra'
import { getLogger } from '../shared/logger'
import { getLogsPath } from './application-constants'
import { LogHandler } from './log-handler'
import { ExtendedAppMainProcess } from './types'
import * as mainWindow from './windows/main'
import { openHelpWindow } from './windows/help'
import { openCallWindow } from './windows/call'

const log = getLogger('main/ipc')
const DeltaChatController: typeof import('./deltachat/controller').default = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./deltachat/controller').default
  } catch (error) {
    log.critical(
      "Fatal: The DeltaChat Module couldn't be loaded. Please check if all dependencies for deltachat-core are installed!",
      error
    )
    dialog.showErrorBox(
      'Fatal Error',
      `The DeltaChat Module couldn't be loaded.\n Please check if all dependencies for deltachat-core are installed!\n The Log file is located in this folder: ${getLogsPath()}`
    )
  }
})()

const app = rawApp as ExtendedAppMainProcess

export function init(cwd: string, logHandler: LogHandler) {
  const main = mainWindow
  const dcController = new DeltaChatController(cwd)

  if (process.platform !== 'linux') {
    // does only work mac and windows see:
    // https://www.electronjs.org/docs/api/power-monitor#event-resume-macos-windows
    powerMonitor.on('resume', () => {
      dcController.callMethod(null, 'context.maybeNetwork')
    })
  }

  ipcMain.once('ipcReady', _e => {
    app.ipcReady = true
    app.emit('ipcReady')
  })

  ipcMain.on('all', (e, ...args: any[]) => {
    log.debug('Renderer event:', e, ...args)
  })

  ipcMain.on('show', () => main.show())
  // ipcMain.on('setAllowNav', (e, ...args) => menu.setAllowNav(...args))

  ipcMain.once('frontendReady', () => app.emit('frontendReady'))

  /* dispatch a method on DC core */
  ipcMain.on(
    'EVENT_DC_DISPATCH',
    (e: any, _identifier: number, methodName: string, args: any[]) => {
      if (!Array.isArray(args)) args = [args]
      log.debug('EVENT_DC_DISPATCH: ', methodName, args)
      dcController.callMethod(e, methodName, args)
    }
  )

  /* dispatch a method on DC core with result passed to callback */
  ipcMain.on(
    'EVENT_DC_DISPATCH_CB',
    async (e: any, identifier: number, methodName: string, args: any[]) => {
      if (!Array.isArray(args)) args = [args]
      log.debug(`EVENT_DC_DISPATCH_CB (${identifier}) : ${methodName} ${args}`)

      try {
        const returnValue = await dcController.callMethod(e, methodName, args)
        main.send(
          `EVENT_DD_DISPATCH_RETURN_${identifier}_${methodName}`,
          returnValue
        )
      } catch (err) {
        main.send(
          `EVENT_DD_DISPATCH_RETURN_ERR_${identifier}_${methodName}`,
          err.toString()
        )
      }
    }
  )

  ipcMain.on('handleLogMessage', (_e, channel, level, stacktrace, ...args) =>
    logHandler.log(channel, level, stacktrace, ...args)
  )

  ipcMain.on('saveFile', (_e, source, target) => {
    copyFile(source, target, err => {
      if (err) main.send('error', err.message)
    })
  })

  ipcMain.on('ondragstart', (event, filePath) => {
    event.sender.startDrag({ file: filePath, icon: null })
  })

  ipcMain.on('saveLastChatId', (_e, chatId) => {
    const { lastChats } = app.state.saved
    lastChats[dcController.credentials.addr] = chatId
    // don't save to disk, because this is already done on close and it might block
    // we can ignore the crash case, because a crash isn't supposed to happen
    // and it's not important data
  })

  ipcMain.on('getLastSelectedChatId', e => {
    const { lastChats } = app.state.saved
    e.returnValue = lastChats[dcController.credentials.addr]
  })

  ipcMain.on('help', async (_ev, locale) => {
    await openHelpWindow(locale)
  })

  ipcMain.on('call', async (_ev, locale, options: string) => {
    await openCallWindow(locale, options)
  })

  ipcMain.on('reload-main-window', () => {
    mainWindow.window.webContents.reload()
  })

  ipcMain.on('get-log-path', ev => {
    ev.returnValue = logHandler.logFilePath()
  })
}
