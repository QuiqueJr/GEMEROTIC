import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCcw, Save, Unplug, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildTerminalWebSocketUrl,
  createTerminalSession,
  syncRunningConfig,
  type APIConfig,
} from '../api/gemeroticApi'

type RuntimeTerminalProps = {
  apiConfig: APIConfig
  nodeId: string
  nodeLabel: string
  onClose: () => void
  onRunningConfigSynced: (runningConfig: string) => void
  onStatus: (message: string, tone: 'idle' | 'running' | 'success' | 'error') => void
  topologyName: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export function RuntimeTerminal({
  apiConfig,
  nodeId,
  nodeLabel,
  onClose,
  onRunningConfigSynced,
  onStatus,
  topologyName,
}: RuntimeTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const connectingRef = useRef(false)
  const apiConfigRef = useRef(apiConfig)
  const onStatusRef = useRef(onStatus)
  const onRunningConfigSyncedRef = useRef(onRunningConfigSynced)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const [syncBusy, setSyncBusy] = useState(false)

  useEffect(() => {
    apiConfigRef.current = apiConfig
    onStatusRef.current = onStatus
    onRunningConfigSyncedRef.current = onRunningConfigSynced
  }, [apiConfig, onRunningConfigSynced, onStatus])

  const writeLine = useCallback((message: string) => {
    terminalRef.current?.writeln(`\r\n${message}`)
  }, [])

  const disconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setConnectionStatus('disconnected')
  }, [])

  const openSocket = useCallback(async () => {
    try {
      const terminalToken = await resolveTerminalToken(
        apiConfigRef.current,
        topologyName,
        nodeId,
      )
      if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
        connectingRef.current = false
        return
      }
      const socket = new WebSocket(
        buildTerminalWebSocketUrl(
          apiConfigRef.current,
          topologyName,
          nodeId,
          terminalToken,
        ),
      )
      socketRef.current = socket
      connectingRef.current = false

      socket.onopen = () => {
        setConnectionStatus('connected')
        onStatusRef.current(`Consola conectada: ${nodeLabel}`, 'success')
        writeLine(`Conectado a ${nodeLabel}.`)
      }
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          terminalRef.current?.write(event.data)
          return
        }
        if (event.data instanceof Blob) {
          void event.data.text().then((text) => terminalRef.current?.write(text))
          return
        }
        terminalRef.current?.write(String(event.data))
      }
      socket.onerror = () => {
        setConnectionStatus('error')
        onStatusRef.current(`Error de consola: ${nodeLabel}`, 'error')
        writeLine('Error en la conexión WebSocket.')
      }
      socket.onclose = () => {
        socketRef.current = null
        setConnectionStatus('disconnected')
      }
    } catch (error) {
      connectingRef.current = false
      setConnectionStatus('error')
      const message =
        error instanceof Error ? error.message : 'No se pudo crear sesión de consola.'
      onStatusRef.current(message, 'error')
      writeLine(message)
    }
  }, [nodeId, nodeLabel, topologyName, writeLine])

  const connect = useCallback(() => {
    if (typeof WebSocket === 'undefined') {
      setConnectionStatus('error')
      writeLine('WebSocket no disponible en este navegador.')
      return
    }
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
      return
    }
    if (connectingRef.current) {
      return
    }

    setConnectionStatus('connecting')
    connectingRef.current = true
    void openSocket()
  }, [openSocket, writeLine])

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, ui-monospace, SFMono-Regular, monospace',
      fontSize: 13,
      theme: {
        background: '#101820',
        foreground: '#d6e2ee',
        cursor: '#f7c948',
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    annotateTerminalInput(container, nodeId)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    terminal.writeln(`GEMEROTIC runtime · ${nodeLabel}`)
    terminal.writeln('Conectando consola interactiva...')
    fitAddon.fit()

    const disposable = terminal.onData((data) => {
      const socket = socketRef.current
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(data)
      }
    })
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => fitAddon.fit())
    resizeObserver?.observe(container)
    connect()

    return () => {
      disposable.dispose()
      resizeObserver?.disconnect()
      connectingRef.current = false
      socketRef.current?.close()
      socketRef.current = null
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [connect, nodeId, nodeLabel])

  const clearTerminal = () => {
    terminalRef.current?.clear()
  }

  const saveRunningConfig = async () => {
    setSyncBusy(true)
    onStatusRef.current(`Guardando running-config: ${nodeLabel}`, 'running')
    try {
      const result = await syncRunningConfig(apiConfigRef.current, topologyName, nodeId)
      if (!result.ok || result.data.data === undefined) {
        const message = `No se pudo guardar running-config (${result.status})`
        onStatusRef.current(message, 'error')
        writeLine(message)
        return
      }
      onRunningConfigSyncedRef.current(result.data.data.running_config)
      const message = `Running-config guardado: ${nodeLabel}`
      onStatusRef.current(message, 'success')
      writeLine(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Petición fallida'
      onStatusRef.current(message, 'error')
      writeLine(message)
    } finally {
      setSyncBusy(false)
    }
  }

  return (
    <div className="modal-backdrop runtime-terminal-backdrop">
      <section
        aria-label={`Consola runtime ${nodeLabel}`}
        className="modal-shell runtime-terminal"
        role="dialog"
      >
        <header className="runtime-terminal__header">
          <div>
            <span>Consola runtime</span>
            <strong>{nodeLabel}</strong>
          </div>
          <button
            aria-label="Cerrar consola"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="runtime-terminal__toolbar">
          <span data-status={connectionStatus}>
            {getConnectionStatusLabel(connectionStatus)}
          </span>
          <button className="secondary-button" onClick={connect} type="button">
            <Zap size={16} />
            Conectar
          </button>
          <button className="secondary-button" onClick={disconnect} type="button">
            <Unplug size={16} />
            Desconectar
          </button>
          <button className="secondary-button" onClick={clearTerminal} type="button">
            <RotateCcw size={16} />
            Limpiar
          </button>
          <button
            className="secondary-button"
            disabled={syncBusy}
            onClick={() => void saveRunningConfig()}
            type="button"
          >
            <Save size={16} />
            Guardar running-config
          </button>
          <button className="secondary-button" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <div className="runtime-terminal__surface" ref={containerRef} />
      </section>
    </div>
  )
}

async function resolveTerminalToken(
  apiConfig: APIConfig,
  topologyName: string,
  nodeId: string,
): Promise<string | undefined> {
  const apiKey = apiConfig.apiKey?.trim() ?? ''
  if (!apiKey) {
    return undefined
  }
  const result = await createTerminalSession(apiConfig, topologyName, nodeId)
  if (!result.ok || result.data.data === undefined) {
    throw new Error(`No se pudo crear sesión de consola (${result.status})`)
  }
  return result.data.data.token
}

function getConnectionStatusLabel(status: ConnectionStatus): string {
  if (status === 'connecting') {
    return 'Conectando'
  }
  if (status === 'connected') {
    return 'Conectado'
  }
  if (status === 'error') {
    return 'Error'
  }
  return 'Desconectado'
}

function annotateTerminalInput(container: HTMLDivElement, nodeId: string): void {
  const input = container.querySelector<HTMLTextAreaElement>(
    '.xterm-helper-textarea',
  )
  if (input === null) {
    return
  }
  input.id = `runtime-terminal-input-${nodeId}`
  input.name = `runtime-terminal-input-${nodeId}`
  input.setAttribute('aria-label', `Entrada de consola ${nodeId}`)
}
