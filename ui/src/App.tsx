import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Activity,
  Box,
  Cable,
  Copy,
  Database,
  Factory,
  KeyRound,
  Save,
  Settings,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import './App.css'
import {
  bootstrapNetBox,
  createTopology,
  getHealth,
  type HealthResponse,
} from './api/gemeroticApi'
import { AssetNode } from './components/AssetNode'
import { assetCatalog, getAssetDefinition } from './domain/assetCatalog'
import {
  buildTopologyPayload,
  createInitialBuilderState,
  createNodeFromAsset,
  updateNodeData,
} from './domain/topologyBuilder'
import type {
  AssetType,
  BuilderNode,
  Criticality,
  PurdueLevel,
  SecurityLevel,
  TopologySettings,
} from './domain/topologyTypes'

const nodeTypes = {
  asset: AssetNode,
}

const criticalityOptions: Criticality[] = ['critical', 'high', 'medium', 'low']
const securityLevelOptions: SecurityLevel[] = ['SL-0', 'SL-1', 'SL-2', 'SL-3', 'SL-4']
const purdueOptions: PurdueLevel[] = [0, 1, 2, 3, 4, 5]
type OperationStatus = 'idle' | 'running' | 'success' | 'error'

function App() {
  const initialState = useMemo(() => createInitialBuilderState(), [])
  const [settings, setSettings] = useState<TopologySettings>(initialState.settings)
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(
    initialState.nodes,
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialState.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialState.nodes[0]?.id ?? null,
  )
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8000')
  const [apiKey, setApiKey] = useState('')
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [operationMessage, setOperationMessage] = useState('API sin verificar')
  const [health, setHealth] = useState<HealthResponse | null>(null)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const payload = useMemo(
    () => buildTopologyPayload({ settings, nodes, edges }),
    [settings, nodes, edges],
  )
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])

  const handleConnect = (connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
          animated: true,
        },
        currentEdges,
      ),
    )
  }

  const handleNodesChange = (changes: NodeChange<BuilderNode>[]) => {
    onNodesChange(changes)
    const removedSelectedNode = changes.some(
      (change) => change.type === 'remove' && change.id === selectedNodeId,
    )
    if (removedSelectedNode) {
      setSelectedNodeId(null)
    }
  }

  const addAsset = (assetType: AssetType) => {
    const asset = getAssetDefinition(assetType)
    const assetCount = nodes.filter((node) => node.data.assetType === assetType).length
    const node = createNodeFromAsset(asset, assetCount, {
      x: 160 + nodes.length * 36,
      y: 120 + nodes.length * 28,
    })
    setNodes((currentNodes) => [...currentNodes, node])
    setSelectedNodeId(node.id)
  }

  const removeSelectedNode = () => {
    if (selectedNodeId === null) {
      return
    }

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNodeId))
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    )
    setSelectedNodeId(null)
  }

  const updateSelectedNode = (patch: Partial<BuilderNode['data']>) => {
    if (selectedNodeId === null) {
      return
    }
    setNodes((currentNodes) => updateNodeData(currentNodes, selectedNodeId, patch))
  }

  const updateSettings = (patch: Partial<TopologySettings>) => {
    setSettings((currentSettings) => ({ ...currentSettings, ...patch }))
  }

  const apiConfig = { baseUrl: apiBaseUrl, apiKey }

  const runOperation = async (
    operation: () => Promise<{ ok: boolean; status: number; data: unknown }>,
    successMessage: string,
  ) => {
    setOperationStatus('running')
    try {
      const result = await operation()
      if (!result.ok) {
        setOperationStatus('error')
        setOperationMessage(extractMessage(result.data, `HTTP ${result.status}`))
        return
      }
      setOperationStatus('success')
      setOperationMessage(successMessage)
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  const checkHealth = async () => {
    setOperationStatus('running')
    try {
      const result = await getHealth(apiConfig)
      setHealth(result.data)
      setOperationStatus(result.ok ? 'success' : 'error')
      setOperationMessage(
        result.ok
          ? `Health OK · NetBox ${result.data.checks.netbox_connected ? 'OK' : 'offline'}`
          : `Health fallo · HTTP ${result.status}`,
      )
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  const bootstrap = () =>
    runOperation(
      () => bootstrapNetBox(apiConfig),
      'Bootstrap de NetBox completado',
    )

  const persistTopology = () =>
    runOperation(
      () => createTopology(apiConfig, payload),
      'Topologia enviada a NetBox',
    )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">GE</div>
          <div>
            <p className="eyebrow">GEMEROTIC UI</p>
            <h1>Constructor OT/IT</h1>
          </div>
        </div>
        <div className="topbar__status">
          <span data-status={operationStatus}>
            <Activity size={16} />
            {operationMessage}
          </span>
          <span>
            <Database size={16} />
            NetBox {health?.checks.netbox_connected ? 'online' : 'SSoT'}
          </span>
        </div>
      </header>

      <section className="workbench">
        <aside className="asset-palette" aria-label="Paleta de activos">
          <div className="panel-title">
            <Box size={18} />
            <span>Activos</span>
          </div>
          <div className="asset-palette__grid">
            {assetCatalog.map((asset) => (
              <button
                className={`asset-button asset-button--${asset.role}`}
                key={asset.assetType}
                onClick={() => addAsset(asset.assetType)}
                type="button"
              >
                <span>{asset.shortLabel}</span>
                {asset.label}
              </button>
            ))}
          </div>

          <div className="panel-title panel-title--spaced">
            <Factory size={18} />
            <span>Topologia</span>
          </div>
          <label className="field">
            <span>Nombre</span>
            <input
              value={settings.name}
              onChange={(event) => updateSettings({ name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Sitio</span>
            <input
              value={settings.siteName}
              onChange={(event) => updateSettings({ siteName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Sala</span>
            <input
              value={settings.roomName}
              onChange={(event) => updateSettings({ roomName: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Rack</span>
            <input
              value={settings.rackName}
              onChange={(event) => updateSettings({ rackName: event.target.value })}
            />
          </label>
        </aside>

        <section className="canvas-panel" aria-label="Canvas de topologia">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.24 }}
          >
            <Background color="#b9c7c2" gap={22} />
            <Controls position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const asset = node as BuilderNode
                return asset.data.assetType === 'plc' ? '#d97706' : '#2f766d'
              }}
            />
          </ReactFlow>
        </section>

        <aside className="inspector" aria-label="Inspector">
          <div className="panel-title">
            <Settings size={18} />
            <span>Inspector</span>
          </div>

          {selectedNode ? (
            <div className="inspector__content">
              <label className="field">
                <span>Etiqueta</span>
                <input
                  value={selectedNode.data.label}
                  onChange={(event) =>
                    updateSelectedNode({ label: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={selectedNode.data.assetType}
                  onChange={(event) =>
                    updateSelectedNode({
                      assetType: event.target.value as AssetType,
                    })
                  }
                >
                  {assetCatalog.map((asset) => (
                    <option key={asset.assetType} value={asset.assetType}>
                      {asset.assetType}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Zona IEC 62443</span>
                <input
                  value={selectedNode.data.zoneName}
                  onChange={(event) =>
                    updateSelectedNode({
                      zoneName: event.target.value,
                      zoneId: event.target.value.toLowerCase().replace(/\s+/g, '-'),
                    })
                  }
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>Purdue</span>
                  <select
                    value={selectedNode.data.purdueLevel}
                    onChange={(event) =>
                      updateSelectedNode({
                        purdueLevel: Number(event.target.value) as PurdueLevel,
                      })
                    }
                  >
                    {purdueOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>SL</span>
                  <select
                    value={selectedNode.data.securityLevel}
                    onChange={(event) =>
                      updateSelectedNode({
                        securityLevel: event.target.value as SecurityLevel,
                      })
                    }
                  >
                    {securityLevelOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Criticidad</span>
                <select
                  value={selectedNode.data.criticality}
                  onChange={(event) =>
                    updateSelectedNode({
                      criticality: event.target.value as Criticality,
                    })
                  }
                >
                  {criticalityOptions.map((criticality) => (
                    <option key={criticality} value={criticality}>
                      {criticality}
                    </option>
                  ))}
                </select>
              </label>
              <div className="action-row">
                <button type="button" className="secondary-button">
                  <Copy size={16} />
                  Duplicar
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={removeSelectedNode}
                >
                  <Trash2 size={16} />
                  Eliminar
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <KeyRound size={20} />
              <span>Sin seleccion</span>
            </div>
          )}

          <div className="panel-title panel-title--spaced">
            <Cable size={18} />
            <span>Payload</span>
          </div>
          <pre className="payload-preview">{payloadText}</pre>
          <div className="panel-title panel-title--spaced">
            <KeyRound size={18} />
            <span>API</span>
          </div>
          <label className="field">
            <span>Base URL</span>
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
            />
          </label>
          <label className="field">
            <span>X-API-Key</span>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
            />
          </label>
          <div className="api-actions">
            <button type="button" className="secondary-button" onClick={checkHealth}>
              <Activity size={16} />
              Health
            </button>
            <button type="button" className="secondary-button" onClick={bootstrap}>
              <Database size={16} />
              Bootstrap
            </button>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={operationStatus === 'running'}
            onClick={persistTopology}
          >
            <Save size={16} />
            Persistir en NetBox
          </button>
        </aside>
      </section>
    </main>
  )
}

function extractMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    return String((data as { message: unknown }).message)
  }
  return fallback
}

export default App
