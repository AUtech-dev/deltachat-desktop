import React, { useState, useRef } from 'react'
import DeltaDialog, { DeltaDialogBody, DeltaDialogContent } from './DeltaDialog'
import { Icon } from '@blueprintjs/core'
import { DesktopSettings } from '../../../shared/shared-types'
import { selectChat } from '../../stores/chat'
import QrReader from 'react-qr-reader'
import { Card, Spinner } from '@blueprintjs/core'
import { DeltaBackend } from '../../delta-remote'
import processOpenQrUrl from '../helpers/OpenQrUrl'

export function DeltaDialogImportQrInner({
  description,
  onClose,
}: {
  description: string
  onClose: () => void
}) {
  const tx = window.static_translate
  const [qrCode, setQrCode] = useState('')
  const [processQrCode, setProcessQrCode] = useState(false)

  const handleScanResult = (chatId: number = null) => {
    setProcessQrCode(false)
    if (chatId) {
      selectChat(chatId)
    }
    onClose()
  }

  const handleResponse = async (scannedQrCode: string) => {
    setProcessQrCode(true)
    processOpenQrUrl(scannedQrCode, handleScanResult)
  }

  const qrImageReader = useRef<any>()

  const handleScan = (data: string) => {
    if (data) {
      handleResponse(data)
    }
  }

  const cancelProcess = () => {
    DeltaBackend.call('stopOngoingProcess')
    onClose()
  }

  const handleError = (err: string) => {
    /* ignore-console-log */
    console.error(err)
  }

  const openImageDialog = () => {
    qrImageReader.current.openImageDialog()
  }

  return (
    <DeltaDialogBody>
      <DeltaDialogContent noPadding>
        {processQrCode && (
          <div>
            <Spinner />
            <p />
            <p className='delta-button danger' onClick={cancelProcess}>
              {tx('cancel')}
            </p>
          </div>
        )}
        {!processQrCode && (
          <div className='import-qr-code-dialog'>
            <div>
              <div>
                <QrReader
                  delay={300}
                  onError={handleError}
                  onScan={handleScan}
                  style={{ width: '100%' }}
                  facingMode='user'
                />
              </div>
            </div>
            <div className='qr-data'>
              <div className='content' aria-label={tx('a11y_qr_data')}>
                {qrCode}
              </div>
              <div
                title={tx('paste_from_clipboard')}
                className='copy-btn'
                role='button'
                onClick={() => {
                  navigator.clipboard.readText().then(handleResponse)
                }}
              >
                <Icon icon='clipboard' />
              </div>
            </div>
            <button onClick={openImageDialog} className={'bp3-button'}>
              {tx('load_qr_code_as_image')}
            </button>
            <div className='qr-image-loader'>
              <QrReader
                delay={300}
                ref={qrImageReader}
                onError={handleError}
                onScan={handleScan}
                style={{ width: '100%' }}
                legacyMode
              />
            </div>
          </div>
        )}
      </DeltaDialogContent>
    </DeltaDialogBody>
  )
}

export default function ImportQrCode({
  onClose,
  isOpen,
}: {
  onClose: () => void
  isOpen: boolean
  qrCode: string
  deltachat: DesktopSettings
}) {
  const tx = window.static_translate
  const Dialog = DeltaDialog as any // todo remove this cheat.
  return (
    <Dialog
      className='delta-dialog'
      title={tx('qrscan_title')}
      isOpen={isOpen}
      onClose={onClose}
    >
      {navigator.onLine && (
        <DeltaDialogImportQrInner description='' onClose={onClose} />
      )}
      {!navigator.onLine && (
        <DeltaDialogContent>
          <DeltaDialogBody>
            <Card>
              <p>{tx('qrshow_join_contact_no_connection_hint')}</p>
            </Card>
            <button onClick={onClose} className={'bp3-button'}>
              <span className='bp3-button-text'>{tx('ok')}</span>
            </button>
            <br />
          </DeltaDialogBody>
        </DeltaDialogContent>
      )}
    </Dialog>
  )
}
