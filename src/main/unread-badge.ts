import * as mainWindow from './windows/main'
import { app, ipcMain } from 'electron'
import DeltaChatController from './deltachat/controller'
import { getLogger } from '../shared/logger'
import Badge from 'electron-windows-badge'
const log = getLogger('main/badge')

export default function setupUnreadBadge(dc: DeltaChatController) {
  if (process.platform === 'win32') {
    log.info('setup badge windows')
    const badgeOptions = {
      color: '#2090ea',
    }
    new Badge(mainWindow.window, badgeOptions)
  }

  let reUpdateTimeOut: NodeJS.Timeout

  async function update() {
    const count = await dc.callMethod(
      null,
      'chatList.getGeneralFreshMessageCounter'
    )
    log.info(`badge: ${count}`)
    if (process.platform === 'win32') {
      ipcMain.emit('update-badge', {}, count)
    } else {
      app.setBadgeCount(count)
    }
  }

  dc._dc.on('DC_EVENT_INCOMING_MSG', (_chatId: number, _msgId: number) => {
    // don't update imidiately if the app is in focused
    if (mainWindow.window.hidden) update()

    // update after a delay again to make sure its up to date
    if (reUpdateTimeOut) clearTimeout(reUpdateTimeOut)
    reUpdateTimeOut = setTimeout(() => {
      update()
    }, 4000)
  })

  dc.on('ready', () => {
    // for start and after account switch
    update()
  })

  ipcMain.on('update-badge-internal', () => {
    log.debug(`update-badge-internal`)
    // after selecting a chat to take mark read into account
    if (reUpdateTimeOut) clearTimeout(reUpdateTimeOut)
    reUpdateTimeOut = setTimeout(() => update(), 200)
  })
}
