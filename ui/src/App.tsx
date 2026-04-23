import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Activity,
  Box,
  Cable,
  CheckCircle2,
  Copy,
  Database,
  Factory,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Save,
  Settings,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import './App.css'
import {
  bootstrapNetBox,
  createTopology,
  deployPipeline,
  generatePipelineArtifacts,
  getHealth,
  type HealthResponse,
  type PipelineArtifactsResponse,
  type PipelineRunResponse,
} from './api/gemeroticApi'
import { AssetNode } from './components/AssetNode'
import { assetCatalog, getAssetDefinition } from './domain/assetCatalog'
import {
  buildTopologyPayload,
  createInitialBuilderState,
  createNodeFromAsset,
  getNextAssetIndex,
  slugify,
  updateNodeData,
} from './domain/topologyBuilder'
import type {
  AssetType,
  BuilderNode,
  Criticality,
  PurdueLevel,
  SecurityLevel,
  TopologySettings,
  TopologyView,
} from './domain/topologyTypes'

const nodeTypes = {
  asset: AssetNode,
}

const criticalityOptions: Criticality[] = ['critical', 'high', 'medium', 'low']
const securityLevelOptions: SecurityLevel[] = ['SL-0', 'SL-1', 'SL-2', 'SL-3', 'SL-4']
const purdueOptions: PurdueLevel[] = [0, 1, 2, 3, 4, 5]
type OperationStatus = 'idle' | 'running' | 'success' | 'error'

const viewOptions: Array<{
  id: TopologyView
  label: string
  description: string
}> = [
  {
    id: 'physical',
    label: 'Fisica',
    description: 'Sites, salas, racks, puertos y cables',
  },
  {
    id: 'logical',
    label: 'Logica',
    description: 'Interfaces, VLANs y direccionamiento',
  },
  {
    id: 'security',
    label: 'Seguridad',
    description: 'Zonas IEC 62443, Purdue y conductos',
  },
]

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#4b5563',
  },
  style: {
    stroke: '#4b5563',
    strokeWidth: 2,
  },
  type: 'smoothstep',
}

const roleLabels = {
  network: 'Red',
  compute: 'Computo',
  ot: 'OT',
  security: 'Seguridad',
}

const purdueLabels: Record<PurdueLevel, string> = {
  0: 'Proceso',
  1: 'Control',
  2: 'Supervision',
  3: 'DMZ industrial',
  4: 'IT planta',
  5: 'Enterprise',
}

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
  const [activeView, setActiveView] = useState<TopologyView>('physical')
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8000')
  const [apiKey, setApiKey] = useState('')
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [operationMessage, setOperationMessage] = useState('API sin verificar')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [pipelineArtifacts, setPipelineArtifacts] =
    useState<PipelineArtifactsResponse | null>(null)
  const [pipelineRun, setPipelineRun] = useState<PipelineRunResponse | null>(null)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const payload = useMemo(
    () => buildTopologyPayload({ settings, nodes, edges }),
    [settings, nodes, edges],
  )
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const artifactText = useMemo(
    () =>
      pipelineArtifacts === null
        ? ''
        : JSON.stringify(pipelineArtifacts, null, 2),
    [pipelineArtifacts],
  )
  const pipelineRunText = useMemo(
    () => (pipelineRun === null ? '' : JSON.stringify(pipelineRun, null, 2)),
    [pipelineRun],
  )
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          activeView,
        },
      })),
    [activeView, nodes],
  )
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: activeView === 'logical',
        label: getEdgeLabel(activeView),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: getEdgeColor(activeView),
        },
        style: {
          stroke: getEdgeColor(activeView),
          strokeDasharray: getEdgeDash(activeView),
          strokeWidth: activeView === 'security' ? 2.6 : 2,
        },
        type: 'smoothstep',
      })),
    [activeView, edges],
  )
  const topologySummary = useMemo(
    () => ({
      assets: nodes.length,
      links: edges.length,
      ports: payload.interfaces.length,
      vlans: payload.vlans.length,
      zones: payload.security_zones.length,
      conduits: payload.conduits.length,
      criticalAssets: nodes.filter((node) => node.data.criticality === 'critical')
        .length,
      maxSecurityLevel: getMaxSecurityLevel(nodes),
    }),
    [edges.length, nodes, payload],
  )
  const purdueSummary = useMemo(
    () =>
      purdueOptions.map((level) => ({
        level,
        label: purdueLabels[level],
        count: nodes.filter((node) => node.data.purdueLevel === level).length,
      })),
    [nodes],
  )

  const handleConnect = (connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
          ...defaultEdgeOptions,
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
    const node = createNodeFromAsset(asset, getNextAssetIndex(nodes, assetType), {
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

  const duplicateSelectedNode = () => {
    if (selectedNode === null) {
      return
    }

    const asset = getAssetDefinition(selectedNode.data.assetType)
    const node = createNodeFromAsset(
      asset,
      getNextAssetIndex(nodes, selectedNode.data.assetType),
      {
        x: selectedNode.position.x + 42,
        y: selectedNode.position.y + 42,
      },
    )
    const duplicatedNode: BuilderNode = {
      ...node,
      data: {
        ...selectedNode.data,
        label: `${selectedNode.data.label} copia`,
      },
    }
    setNodes((currentNodes) => [...currentNodes, duplicatedNode])
    setSelectedNodeId(duplicatedNode.id)
  }

  const changeSelectedAssetType = (assetType: AssetType) => {
    const asset = getAssetDefinition(assetType)
    updateSelectedNode({
      assetType: asset.assetType,
      criticality: asset.criticality,
      portCount: asset.portCount,
      portPrefix: asset.portPrefix,
      zoneId: asset.defaultZoneId,
      zoneName: asset.defaultZoneName,
      purdueLevel: asset.purdueLevel,
      securityLevel: asset.securityLevel,
      vlanId: asset.vlanId,
      vlanName: asset.vlanName,
      allowedProtocols: asset.defaultProtocols,
    })
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
          ? `Health OK - NetBox ${result.data.checks.netbox_connected ? 'OK' : 'offline'}`
          : `Health fallo - HTTP ${result.status}`,
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

  const generateArtifacts = async () => {
    setOperationStatus('running')
    try {
      const result = await generatePipelineArtifacts(apiConfig, payload)
      if (!result.ok || result.data.data === undefined) {
        setOperationStatus('error')
        setOperationMessage(extractMessage(result.data, `HTTP ${result.status}`))
        return
      }
      setPipelineArtifacts(result.data.data)
      setPipelineRun(null)
      setOperationStatus('success')
      setOperationMessage(
        `${result.data.data.artifacts.length} artefactos de pipeline generados`,
      )
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  const deployPipelineRun = async () => {
    setOperationStatus('running')
    try {
      const result = await deployPipeline(apiConfig, payload)
      if (!result.ok || result.data.data === undefined) {
        setOperationStatus('error')
        setOperationMessage(extractMessage(result.data, `HTTP ${result.status}`))
        return
      }
      setPipelineRun(result.data.data)
      setPipelineArtifacts({
        topology_name: result.data.data.topology_name,
        artifacts: result.data.data.artifacts,
      })
      setOperationStatus('success')
      setOperationMessage('Pipeline desplegado correctamente')
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  return (
    <main className="app-shell" data-view={activeView}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            GE
          </div>
          <div>
            <p className="eyebrow">GEMEROTIC</p>
            <h1>Digital Twin OT/IT</h1>
            <p className="brand-subtitle">React Flow - FastAPI - NetBox SSoT</p>
          </div>
        </div>
        <nav className="view-switcher" aria-label="Vista de topologia">
          {viewOptions.map((view) => (
            <button
              aria-pressed={activeView === view.id}
              key={view.id}
              onClick={() => setActiveView(view.id)}
              type="button"
            >
              <span>{view.label}</span>
              <small>{view.description}</small>
            </button>
          ))}
        </nav>
        <div className="topbar__status">
          <span aria-live="polite" data-status={operationStatus}>
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
          <div className="pipeline-strip" aria-label="Pipeline activo">
            <span>UI</span>
            <span>API</span>
            <span>NetBox</span>
          </div>

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
                <span className="asset-button__code">{asset.shortLabel}</span>
                <span className="asset-button__copy">
                  <strong>{asset.label}</strong>
                  <small>
                    {roleLabels[asset.role]} - L{asset.purdueLevel} - VLAN{' '}
                    {asset.vlanId}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="panel-title panel-title--spaced">
            <Layers3 size={18} />
            <span>Modelo Purdue</span>
          </div>
          <div className="purdue-stack">
            {purdueSummary.map((row) => (
              <div className="purdue-row" key={row.level}>
                <span className="purdue-row__level">L{row.level}</span>
                <span className="purdue-row__label">{row.label}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>

          <div className="panel-title panel-title--spaced">
            <Factory size={18} />
            <span>Topologia fisica</span>
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
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineStyle={{
              stroke: getEdgeColor(activeView),
              strokeWidth: 2,
            }}
            fitView
            fitViewOptions={{ padding: 0.24 }}
          >
            <Panel className="canvas-hud" position="top-left">
              <span>Vista {getViewLabel(activeView)}</span>
              <strong>{settings.name}</strong>
              <small>{getViewSummary(activeView, topologySummary)}</small>
            </Panel>
            <Panel className="zone-hud" position="top-right">
              {payload.security_zones.map((zone) => (
                <span key={zone.id}>
                  {zone.name}
                  <strong>{zone.device_ids.length}</strong>
                </span>
              ))}
            </Panel>
            <Background color="#d0d5d8" gap={24} />
            <Controls position="bottom-left" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => getNodeColor(node as BuilderNode)}
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
              <div className="node-summary">
                <div>
                  <span>Activo</span>
                  <strong>{selectedNode.data.assetType.replace('_', ' ')}</strong>
                </div>
                <div>
                  <span>VLAN</span>
                  <strong>{selectedNode.data.vlanId}</strong>
                </div>
                <div>
                  <span>Zona</span>
                  <strong>{selectedNode.data.zoneName}</strong>
                </div>
              </div>

              <section className="config-section" data-layer="physical">
                <div className="section-heading">
                  <Network size={16} />
                  <span>Layer 1 - Fisica</span>
                </div>
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
                  <span>Tipo de activo</span>
                  <select
                    value={selectedNode.data.assetType}
                    onChange={(event) =>
                      changeSelectedAssetType(event.target.value as AssetType)
                    }
                  >
                    {assetCatalog.map((asset) => (
                      <option key={asset.assetType} value={asset.assetType}>
                        {asset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>Fabricante</span>
                    <input
                      value={selectedNode.data.manufacturer ?? ''}
                      onChange={(event) =>
                        updateSelectedNode({ manufacturer: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Modelo</span>
                    <input
                      value={selectedNode.data.model ?? ''}
                      onChange={(event) =>
                        updateSelectedNode({ model: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>Firmware</span>
                    <input
                      value={selectedNode.data.firmwareVersion ?? ''}
                      onChange={(event) =>
                        updateSelectedNode({ firmwareVersion: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Serie</span>
                    <input
                      value={selectedNode.data.serialNumber ?? ''}
                      onChange={(event) =>
                        updateSelectedNode({ serialNumber: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>RU rack</span>
                    <input
                      min="1"
                      max="60"
                      type="number"
                      value={selectedNode.data.rackPosition ?? ''}
                      onChange={(event) =>
                        updateSelectedNode({
                          rackPosition: parseOptionalBoundedNumber(
                            event.target.value,
                            1,
                            60,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Puertos</span>
                    <input
                      min="1"
                      max="96"
                      type="number"
                      value={selectedNode.data.portCount}
                      onChange={(event) =>
                        updateSelectedNode({
                          portCount: parseBoundedNumber(event.target.value, 1, 1, 96),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Prefijo de puerto</span>
                  <input
                    value={selectedNode.data.portPrefix}
                    onChange={(event) =>
                      updateSelectedNode({ portPrefix: event.target.value })
                    }
                  />
                </label>
              </section>

              <section className="config-section" data-layer="logical">
                <div className="section-heading">
                  <GitBranch size={16} />
                  <span>Layer 2 - Logica</span>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>VLAN ID</span>
                    <input
                      min="1"
                      max="4094"
                      type="number"
                      value={selectedNode.data.vlanId}
                      onChange={(event) =>
                        updateSelectedNode({
                          vlanId: parseBoundedNumber(
                            event.target.value,
                            1,
                            1,
                            4094,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Nombre VLAN</span>
                    <input
                      value={selectedNode.data.vlanName}
                      onChange={(event) =>
                        updateSelectedNode({ vlanName: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>IPv4 principal</span>
                  <input
                    placeholder="192.168.10.10/24"
                    value={selectedNode.data.ipv4Address ?? ''}
                    onChange={(event) =>
                      updateSelectedNode({ ipv4Address: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>IPv6 principal</span>
                  <input
                    placeholder="2001:db8::10/64"
                    value={selectedNode.data.ipv6Address ?? ''}
                    onChange={(event) =>
                      updateSelectedNode({ ipv6Address: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>MAC principal</span>
                  <input
                    placeholder="00:1A:2B:3C:4D:5E"
                    value={selectedNode.data.macAddress ?? ''}
                    onChange={(event) =>
                      updateSelectedNode({ macAddress: event.target.value })
                    }
                  />
                </label>
                <div className="toggle-row">
                  <label>
                    <input
                      checked={selectedNode.data.enabled}
                      onChange={(event) =>
                        updateSelectedNode({ enabled: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Interfaz habilitada
                  </label>
                  <label>
                    <input
                      checked={selectedNode.data.mgmtOnly}
                      onChange={(event) =>
                        updateSelectedNode({ mgmtOnly: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Solo gestion
                  </label>
                </div>
              </section>

              <section className="config-section" data-layer="security">
                <div className="section-heading">
                  <LockKeyhole size={16} />
                  <span>Layer 3 - Seguridad OT</span>
                </div>
                <label className="field">
                  <span>Zona IEC 62443</span>
                  <input
                    value={selectedNode.data.zoneName}
                    onChange={(event) =>
                      updateSelectedNode({
                        zoneName: event.target.value,
                        zoneId: slugify(event.target.value),
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
                          L{level} - {purdueLabels[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Security Level</span>
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
                <label className="field">
                  <span>Protocolos permitidos</span>
                  <input
                    value={selectedNode.data.allowedProtocols.join(', ')}
                    onChange={(event) =>
                      updateSelectedNode({
                        allowedProtocols: parseProtocols(event.target.value),
                      })
                    }
                  />
                </label>
              </section>

              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={duplicateSelectedNode}
                >
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
            <span>Payload TopologyCreate</span>
          </div>
          <div className="payload-metrics">
            <span>{payload.devices.length} devices</span>
            <span>{payload.interfaces.length} interfaces</span>
            <span>{payload.vlans.length} VLANs</span>
            <span>{payload.conduits.length} conductos</span>
          </div>
          <pre className="payload-preview">{payloadText}</pre>

          <div className="panel-title panel-title--spaced">
            <KeyRound size={18} />
            <span>Pipeline</span>
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
              <CheckCircle2 size={16} />
              Bootstrap
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={generateArtifacts}
            >
              <GitBranch size={16} />
              Artefactos
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={deployPipelineRun}
            >
              <Network size={16} />
              Deploy
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

          {pipelineArtifacts ? (
            <>
              <div className="panel-title panel-title--spaced">
                <GitBranch size={18} />
                <span>Artefactos</span>
              </div>
              <div className="payload-metrics">
                <span>{pipelineArtifacts.artifacts.length} archivos</span>
                <span>
                  {
                    pipelineArtifacts.artifacts.filter(
                      (artifact) => artifact.stage === 'containerlab',
                    ).length
                  }{' '}
                  containerlab
                </span>
                <span>
                  {
                    pipelineArtifacts.artifacts.filter(
                      (artifact) => artifact.stage === 'ansible',
                    ).length
                  }{' '}
                  ansible
                </span>
                <span>
                  {
                    pipelineArtifacts.artifacts.filter(
                      (artifact) => artifact.stage === 'opa',
                    ).length
                  }{' '}
                  opa
                </span>
              </div>
              <pre className="payload-preview">{artifactText}</pre>
            </>
          ) : null}

          {pipelineRun ? (
            <>
              <div className="panel-title panel-title--spaced">
                <Network size={18} />
                <span>Ejecucion</span>
              </div>
              <div className="payload-metrics">
                <span>{pipelineRun.commands.length} comandos</span>
                <span>{pipelineRun.bundle_dir}</span>
              </div>
              <pre className="payload-preview">{pipelineRunText}</pre>
            </>
          ) : null}
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

function getMaxSecurityLevel(nodes: BuilderNode[]): SecurityLevel {
  const order = new Map<SecurityLevel, number>(
    securityLevelOptions.map((level, index) => [level, index]),
  )
  return nodes.reduce<SecurityLevel>((currentLevel, node) => {
    const currentRank = order.get(currentLevel) ?? 0
    const nodeRank = order.get(node.data.securityLevel) ?? 0
    return nodeRank > currentRank ? node.data.securityLevel : currentLevel
  }, 'SL-0')
}

function getEdgeColor(view: TopologyView): string {
  if (view === 'logical') {
    return '#0f766e'
  }
  if (view === 'security') {
    return '#b91c1c'
  }
  return '#4b5563'
}

function getEdgeDash(view: TopologyView): string | undefined {
  if (view === 'logical') {
    return '7 5'
  }
  if (view === 'security') {
    return '2 5'
  }
  return undefined
}

function getEdgeLabel(view: TopologyView): string {
  if (view === 'logical') {
    return 'VLAN'
  }
  if (view === 'security') {
    return 'conduit'
  }
  return 'cable'
}

function getViewLabel(view: TopologyView): string {
  return viewOptions.find((option) => option.id === view)?.label ?? 'Fisica'
}

function getViewSummary(
  view: TopologyView,
  summary: {
    links: number
    ports: number
    vlans: number
    zones: number
    conduits: number
    criticalAssets: number
    maxSecurityLevel: SecurityLevel
  },
): string {
  if (view === 'logical') {
    return `${summary.ports} interfaces - ${summary.vlans} VLANs`
  }
  if (view === 'security') {
    return `${summary.zones} zonas - ${summary.conduits} conductos - ${summary.maxSecurityLevel}`
  }
  return `${summary.links} cables - ${summary.criticalAssets} activos criticos`
}

function getNodeColor(node: BuilderNode): string {
  if (node.data.activeView === 'logical') {
    return '#0f766e'
  }
  if (node.data.activeView === 'security') {
    return node.data.criticality === 'critical' ? '#b91c1c' : '#92400e'
  }
  return '#4b5563'
}

function parseOptionalBoundedNumber(
  value: string,
  min: number,
  max: number,
): number | undefined {
  if (value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function parseBoundedNumber(
  value: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value.trim() === '') {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function parseProtocols(value: string): string[] {
  return value
    .split(',')
    .map((protocol) => protocol.trim())
    .filter(Boolean)
}

export default App
