import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type DefaultEdgeOptions,
  type EdgeChange,
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
  Link2,
  Network,
  Redo2,
  Save,
  Settings,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import './App.css'
import {
  bootstrapNetBox,
  createTopology,
  deployPipeline,
  generatePipelineArtifacts,
  getHealth,
  getPipelineTools,
  type HealthResponse,
  type PipelineArtifactsResponse,
  type PipelineRunResponse,
  type PipelineToolReportResponse,
} from './api/gemeroticApi'
import { AssetNode } from './components/AssetNode'
import { EquipmentGlyph } from './components/EquipmentGlyph'
import { assetCatalog, getAssetDefinition } from './domain/assetCatalog'
import {
  buildTopologyPayload,
  createBuilderEdge,
  createInitialBuilderState,
  createNodeFromAsset,
  getNextAssetIndex,
  getPortName,
  getSuggestedPortIndex,
  getUsedPortIndexes,
  slugify,
  updateEdgeData,
  updateNodeData,
} from './domain/topologyBuilder'
import type {
  AssetType,
  BuilderEdge,
  BuilderState,
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
type EditorTab = 'equipment' | 'logical' | 'security'
type InteractionMode = 'select' | 'link'
type BuilderSnapshot = BuilderState
type CableDraft = {
  id?: string
  sourceId: string
  targetId: string
  label: string
  sourcePortIndex: number
  targetPortIndex: number
}

const viewOptions: Array<{
  id: TopologyView
  label: string
  description: string
}> = [
  {
    id: 'physical',
    label: 'Fisica',
    description: 'Equipos, puertos y cableado',
  },
  {
    id: 'logical',
    label: 'Logica',
    description: 'VLANs e interfaces',
  },
  {
    id: 'security',
    label: 'Seguridad',
    description: 'IEC 62443 y Purdue',
  },
]

const assetGroupDefinitions = [
  {
    role: 'network' as const,
    label: 'Red y acceso',
    description: 'Core, switching y terminacion',
  },
  {
    role: 'ot' as const,
    label: 'Control OT',
    description: 'Proceso, celda y telemetria',
  },
  {
    role: 'compute' as const,
    label: 'Servicios',
    description: 'SCADA, historicos e ingenieria',
  },
  {
    role: 'security' as const,
    label: 'Perimetro',
    description: 'Segmentacion y endurecimiento',
  },
]

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#57616a',
  },
  style: {
    stroke: '#57616a',
    strokeWidth: 2,
  },
  type: 'smoothstep',
}

const roleLabels = {
  network: 'Red',
  compute: 'Servicios',
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
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(initialState.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdge>(initialState.edges)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialState.nodes[0]?.id ?? null,
  )
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null)
  const [editorTab, setEditorTab] = useState<EditorTab>('equipment')
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select')
  const [pendingLinkSourceId, setPendingLinkSourceId] = useState<string | null>(null)
  const [showInterfaceLabels, setShowInterfaceLabels] = useState(true)
  const [activeView, setActiveView] = useState<TopologyView>('physical')
  const [linkDraft, setLinkDraft] = useState<CableDraft | null>(null)
  const [historyPast, setHistoryPast] = useState<BuilderSnapshot[]>([])
  const [historyFuture, setHistoryFuture] = useState<BuilderSnapshot[]>([])
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:8000')
  const [apiKey, setApiKey] = useState('')
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [operationMessage, setOperationMessage] = useState('Builder listo')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [toolReport, setToolReport] = useState<PipelineToolReportResponse | null>(null)
  const [pipelineArtifacts, setPipelineArtifacts] =
    useState<PipelineArtifactsResponse | null>(null)
  const [pipelineRun, setPipelineRun] = useState<PipelineRunResponse | null>(null)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null
  const editorNode = nodes.find((node) => node.id === editorNodeId) ?? null
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const groupedAssets = useMemo(
    () =>
      assetGroupDefinitions.map((group) => ({
        ...group,
        assets: assetCatalog.filter((asset) => asset.role === group.role),
      })),
    [],
  )
  const payload = useMemo(() => buildTopologyPayload({ settings, nodes, edges }), [
    settings,
    nodes,
    edges,
  ])
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const artifactText = useMemo(
    () => (pipelineArtifacts === null ? '' : JSON.stringify(pipelineArtifacts, null, 2)),
    [pipelineArtifacts],
  )
  const pipelineRunText = useMemo(
    () => (pipelineRun === null ? '' : JSON.stringify(pipelineRun, null, 2)),
    [pipelineRun],
  )
  const topologySummary = useMemo(
    () => ({
      assets: nodes.length,
      links: edges.length,
      ports: payload.interfaces.length,
      vlans: payload.vlans.length,
      zones: payload.security_zones.length,
      conduits: payload.conduits.length,
      criticalAssets: nodes.filter((node) => node.data.criticality === 'critical').length,
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
  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          activeView,
        },
        selected: node.id === selectedNodeId,
      })),
    [activeView, nodes, selectedNodeId],
  )
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        label: getEdgeDisplayLabel(edge, nodeById, showInterfaceLabels, activeView),
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.id === selectedEdgeId ? '#b87416' : getEdgeColor(activeView),
        },
        style: {
          stroke: edge.id === selectedEdgeId ? '#b87416' : getEdgeColor(activeView),
          strokeDasharray: getEdgeDash(activeView),
          strokeWidth: edge.id === selectedEdgeId ? 3 : activeView === 'security' ? 2.6 : 2,
        },
        animated: activeView === 'logical',
        type: 'smoothstep',
      })),
    [activeView, edges, nodeById, selectedEdgeId, showInterfaceLabels],
  )
  const allToolsInstalled =
    toolReport !== null &&
    toolReport.tools.length > 0 &&
    toolReport.tools.every((tool) => tool.installed)
  const canUndo = historyPast.length > 0
  const canRedo = historyFuture.length > 0
  const apiConfig = { baseUrl: apiBaseUrl, apiKey }

  function pushHistorySnapshot() {
    const snapshot = cloneSnapshot({ settings, nodes, edges })
    setHistoryPast((previous) => [...previous.slice(-59), snapshot])
    setHistoryFuture([])
  }

  function restoreSnapshot(snapshot: BuilderSnapshot) {
    const cloned = cloneSnapshot(snapshot)
    setSettings(cloned.settings)
    setNodes(cloned.nodes)
    setEdges(cloned.edges)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorNodeId(null)
    setPendingLinkSourceId(null)
    setLinkDraft(null)
    setInteractionMode('select')
  }

  function undo() {
    if (historyPast.length === 0) {
      return
    }
    const previous = historyPast[historyPast.length - 1]
    const current = cloneSnapshot({ settings, nodes, edges })
    setHistoryPast(historyPast.slice(0, -1))
    setHistoryFuture([current, ...historyFuture].slice(0, 60))
    restoreSnapshot(previous)
  }

  function redo() {
    if (historyFuture.length === 0) {
      return
    }
    const next = historyFuture[0]
    const current = cloneSnapshot({ settings, nodes, edges })
    setHistoryPast([...historyPast, current].slice(-60))
    setHistoryFuture(historyFuture.slice(1))
    restoreSnapshot(next)
  }

  function cancelTransientUi() {
    setPendingLinkSourceId(null)
    setLinkDraft(null)
    setInteractionMode('select')
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (isEditableElement(target)) {
        return
      }

      const modifier = event.metaKey || event.ctrlKey

      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
        return
      }

      if (
        (modifier && event.key.toLowerCase() === 'y') ||
        (modifier && event.shiftKey && event.key.toLowerCase() === 'z')
      ) {
        event.preventDefault()
        redo()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        cancelTransientUi()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedEdgeId) {
          event.preventDefault()
          removeSelectedEdge()
          return
        }
        if (selectedNodeId) {
          event.preventDefault()
          removeSelectedNode()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const handleNodesChange = (changes: NodeChange<BuilderNode>[]) => {
    if (shouldRecordNodeChanges(changes)) {
      pushHistorySnapshot()
    }
    onNodesChange(changes)

    const removedSelectedNode = changes.some(
      (change) => change.type === 'remove' && change.id === selectedNodeId,
    )
    if (removedSelectedNode) {
      setSelectedNodeId(null)
      setEditorNodeId(null)
    }
  }

  const handleEdgesChange = (changes: EdgeChange<BuilderEdge>[]) => {
    if (changes.some((change) => change.type === 'remove')) {
      pushHistorySnapshot()
    }
    onEdgesChange(changes)
    const removedSelectedEdge = changes.some(
      (change) => change.type === 'remove' && change.id === selectedEdgeId,
    )
    if (removedSelectedEdge) {
      setSelectedEdgeId(null)
    }
  }

  const addAsset = (assetType: AssetType) => {
    pushHistorySnapshot()
    const asset = getAssetDefinition(assetType)
    const node = createNodeFromAsset(asset, getNextAssetIndex(nodes, assetType), {
      x: 180 + nodes.length * 34,
      y: 140 + nodes.length * 28,
    })
    setNodes((currentNodes) => [...currentNodes, node])
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setOperationStatus('success')
    setOperationMessage(`Activo ${asset.label} agregado`)
  }

  function removeSelectedNode() {
    if (selectedNodeId === null) {
      return
    }
    pushHistorySnapshot()
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNodeId))
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorNodeId(null)
  }

  function removeSelectedEdge() {
    if (selectedEdgeId === null) {
      return
    }
    pushHistorySnapshot()
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId))
    setSelectedEdgeId(null)
    setLinkDraft(null)
  }

  const duplicateSelectedNode = () => {
    if (selectedNode === null) {
      return
    }
    pushHistorySnapshot()
    const asset = getAssetDefinition(selectedNode.data.assetType)
    const node = createNodeFromAsset(
      asset,
      getNextAssetIndex(nodes, selectedNode.data.assetType),
      {
        x: selectedNode.position.x + 52,
        y: selectedNode.position.y + 42,
      },
    )
    const duplicatedNode: BuilderNode = {
      ...node,
      data: {
        ...selectedNode.data,
        allowedProtocols: [...selectedNode.data.allowedProtocols],
        label: `${selectedNode.data.label} copia`,
      },
    }
    setNodes((currentNodes) => [...currentNodes, duplicatedNode])
    setSelectedNodeId(duplicatedNode.id)
    setEditorNodeId(duplicatedNode.id)
  }

  const changeSelectedAssetType = (assetType: AssetType) => {
    if (editorNodeId === null) {
      return
    }
    pushHistorySnapshot()
    const asset = getAssetDefinition(assetType)
    setNodes((currentNodes) =>
      updateNodeData(currentNodes, editorNodeId, {
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
      }),
    )
  }

  const updateEditorNode = (patch: Partial<BuilderNode['data']>) => {
    if (editorNodeId === null) {
      return
    }
    pushHistorySnapshot()
    setNodes((currentNodes) => updateNodeData(currentNodes, editorNodeId, patch))
  }

  const updateSettingsWithHistory = (patch: Partial<TopologySettings>) => {
    pushHistorySnapshot()
    setSettings((currentSettings) => ({ ...currentSettings, ...patch }))
  }

  const enterLinkMode = () => {
    setInteractionMode((currentMode) => {
      const nextMode = currentMode === 'link' ? 'select' : 'link'
      if (nextMode === 'select') {
        setPendingLinkSourceId(null)
      }
      return nextMode
    })
    setOperationStatus('success')
    setOperationMessage(
      interactionMode === 'link'
        ? 'Modo seleccion activado'
        : 'Modo enlace activado: selecciona dos equipos',
    )
  }

  const selectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }

  const handleNodeClick = (_: unknown, node: BuilderNode) => {
    if (interactionMode !== 'link') {
      selectNode(node.id)
      return
    }

    if (pendingLinkSourceId === null) {
      setPendingLinkSourceId(node.id)
      setSelectedNodeId(node.id)
      setOperationStatus('success')
      setOperationMessage('Ahora selecciona el segundo equipo del enlace')
      return
    }

    if (pendingLinkSourceId === node.id) {
      setPendingLinkSourceId(null)
      setOperationStatus('idle')
      setOperationMessage('Origen de cable cancelado')
      return
    }

    openCableDraft(pendingLinkSourceId, node.id)
  }

  const handleNodeDoubleClick = (_: unknown, node: BuilderNode) => {
    setInteractionMode('select')
    setPendingLinkSourceId(null)
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setEditorNodeId(node.id)
    setEditorTab(getEditorTabForView(activeView))
  }

  const openCableDraft = (sourceId: string, targetId: string) => {
    const sourceNode = nodeById.get(sourceId)
    const targetNode = nodeById.get(targetId)
    if (!sourceNode || !targetNode) {
      return
    }
    setPendingLinkSourceId(null)
    setLinkDraft({
      sourceId,
      targetId,
      label: buildCableLabel(sourceNode, targetNode, edges.length + 1),
      sourcePortIndex: getSuggestedPortIndex(sourceNode, edges),
      targetPortIndex: getSuggestedPortIndex(targetNode, edges),
    })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorNodeId(null)
    setOperationStatus('success')
    setOperationMessage('Configura nombre y puertos del cable')
  }

  const openCableEditor = (edge: BuilderEdge) => {
    setInteractionMode('select')
    setPendingLinkSourceId(null)
    setSelectedNodeId(null)
    setSelectedEdgeId(edge.id)
    setLinkDraft({
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      label: edge.data?.label ?? edge.label?.toString() ?? edge.id,
      sourcePortIndex: edge.data?.sourcePortIndex ?? 0,
      targetPortIndex: edge.data?.targetPortIndex ?? 0,
    })
  }

  const saveCableDraft = () => {
    if (linkDraft === null) {
      return
    }

    if (!validateCableDraft(linkDraft, nodes, edges)) {
      setOperationStatus('error')
      setOperationMessage('Revisa puertos ocupados o enlaces duplicados')
      return
    }

    pushHistorySnapshot()
    if (linkDraft.id) {
      setEdges((currentEdges) =>
        updateEdgeData(currentEdges, linkDraft.id!, {
          label: linkDraft.label,
          sourcePortIndex: linkDraft.sourcePortIndex,
          targetPortIndex: linkDraft.targetPortIndex,
        }),
      )
      setSelectedEdgeId(linkDraft.id)
    } else {
      const edgeId = `edge-${linkDraft.sourceId}-${linkDraft.targetId}-${Date.now()}`
      const edge = createBuilderEdge({
        id: edgeId,
        source: linkDraft.sourceId,
        target: linkDraft.targetId,
        label: linkDraft.label,
        sourcePortIndex: linkDraft.sourcePortIndex,
        targetPortIndex: linkDraft.targetPortIndex,
      })
      setEdges((currentEdges) => [...currentEdges, edge])
      setSelectedEdgeId(edgeId)
    }

    setLinkDraft(null)
    setInteractionMode('select')
    setOperationStatus('success')
    setOperationMessage('Cable guardado')
  }

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
          ? `Health OK · NetBox ${result.data.checks.netbox_connected ? 'online' : 'offline'}`
          : `Health fallo · HTTP ${result.status}`,
      )
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  const checkTools = async () => {
    setOperationStatus('running')
    try {
      const result = await getPipelineTools(apiConfig)
      if (!result.ok || result.data.data === undefined) {
        setOperationStatus('error')
        setOperationMessage(extractMessage(result.data, `HTTP ${result.status}`))
        return
      }
      setToolReport(result.data.data)
      setOperationStatus('success')
      setOperationMessage(
        `${result.data.data.tools.filter((tool) => tool.installed).length}/${result.data.data.tools.length} herramientas disponibles`,
      )
    } catch (error) {
      setOperationStatus('error')
      setOperationMessage(error instanceof Error ? error.message : 'Request failed')
    }
  }

  const bootstrap = () =>
    runOperation(() => bootstrapNetBox(apiConfig), 'Bootstrap de NetBox completado')

  const persistTopology = () =>
    runOperation(() => createTopology(apiConfig, payload), 'Topologia enviada a NetBox')

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
            <h1>Builder OT/IT</h1>
            <p className="brand-subtitle">Canvas OT · NetBox · Containerlab</p>
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
          <span data-ready={health?.checks.netbox_connected ? 'true' : 'false'}>
            <Database size={16} />
            {health?.checks.netbox_connected ? 'NetBox online' : 'NetBox pendiente'}
          </span>
          <span data-ready={allToolsInstalled ? 'true' : 'false'}>
            <Network size={16} />
            {toolReport === null
              ? 'Lab no verificado'
              : allToolsInstalled
                ? 'Lab listo'
                : 'Lab parcial'}
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="library-panel" aria-label="Biblioteca de equipos">
          <div className="panel-title">
            <Factory size={18} />
            <span>Contexto de planta</span>
          </div>

          <div className="field-grid field-grid--stacked">
            <label className="field">
              <span>Topologia</span>
              <input
                value={settings.name}
                onChange={(event) => updateSettingsWithHistory({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Sitio</span>
              <input
                value={settings.siteName}
                onChange={(event) => updateSettingsWithHistory({ siteName: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Sala</span>
              <input
                value={settings.roomName}
                onChange={(event) => updateSettingsWithHistory({ roomName: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Rack</span>
              <input
                value={settings.rackName}
                onChange={(event) => updateSettingsWithHistory({ rackName: event.target.value })}
              />
            </label>
          </div>

          <div className="summary-grid">
            <SummaryTile label="Activos" value={String(topologySummary.assets)} />
            <SummaryTile label="Cables" value={String(topologySummary.links)} />
            <SummaryTile label="Zonas" value={String(topologySummary.zones)} />
            <SummaryTile label="SL max" value={topologySummary.maxSecurityLevel} />
          </div>

          <div className="panel-title panel-title--spaced">
            <Network size={18} />
            <span>Paleta de equipos</span>
          </div>

          {groupedAssets.map((group) => (
            <section className="library-group" key={group.role}>
              <div className="library-group__header">
                <strong>{group.label}</strong>
                <small>{group.description}</small>
              </div>
              <div className="asset-library">
                {group.assets.map((asset) => (
                  <button
                    className={`asset-card asset-card--${asset.role}`}
                    key={asset.assetType}
                    onClick={() => addAsset(asset.assetType)}
                    type="button"
                  >
                    <div className="asset-card__icon">
                      <EquipmentGlyph assetType={asset.assetType} size={34} />
                    </div>
                    <div className="asset-card__body">
                      <strong>{asset.label}</strong>
                      <small>
                        {roleLabels[asset.role]} · L{asset.purdueLevel} · {asset.portCount}{' '}
                        puertos
                      </small>
                    </div>
                    <span className="asset-card__badge">{asset.shortLabel}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <section className="canvas-panel" aria-label="Canvas de topologia">
          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id)
              setSelectedNodeId(null)
              setEditorNodeId(null)
            }}
            onEdgeDoubleClick={(_, edge) => openCableEditor(edge as BuilderEdge)}
            onPaneClick={() => {
              setSelectedEdgeId(null)
              if (interactionMode !== 'link') {
                setSelectedNodeId(null)
              }
            }}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.24 }}
          >
            <Panel className="canvas-meta" position="top-left">
              <span>{settings.siteName}</span>
              <strong>{settings.name}</strong>
              <small>
                {settings.roomName} · {settings.rackName}
              </small>
            </Panel>

            <Panel className="canvas-toolbar" position="top-center">
              <button
                type="button"
                className="tool-button"
                data-active={interactionMode === 'select'}
                onClick={() => {
                  setInteractionMode('select')
                  setPendingLinkSourceId(null)
                }}
                title="Modo seleccion"
              >
                <Box size={15} />
                Seleccion
              </button>
              <button
                type="button"
                className="tool-button"
                data-active={interactionMode === 'link'}
                onClick={enterLinkMode}
                title="Modo enlace"
              >
                <Cable size={15} />
                Enlace
              </button>
              <button
                type="button"
                className="tool-button"
                data-active={showInterfaceLabels}
                onClick={() => setShowInterfaceLabels((current) => !current)}
                title="Mostrar u ocultar etiquetas de puertos"
              >
                <Link2 size={15} />
                Etiquetas
              </button>
              <button
                type="button"
                className="tool-button"
                disabled={!canUndo}
                onClick={undo}
                title="Deshacer"
              >
                <Undo2 size={15} />
                Deshacer
              </button>
              <button
                type="button"
                className="tool-button"
                disabled={!canRedo}
                onClick={redo}
                title="Rehacer"
              >
                <Redo2 size={15} />
                Rehacer
              </button>
            </Panel>

            <Panel className="zone-hud" position="top-right">
              {payload.security_zones.slice(0, 5).map((zone) => (
                <span key={zone.id}>
                  {zone.name}
                  <strong>{zone.device_ids.length}</strong>
                </span>
              ))}
            </Panel>

            <Panel className="selection-hud" position="bottom-center">
              {pendingLinkSourceId ? (
                <span className="selection-chip selection-chip--pending">
                  Cable desde {nodeById.get(pendingLinkSourceId)?.data.label ?? pendingLinkSourceId}
                </span>
              ) : selectedEdge ? (
                <button
                  className="selection-chip selection-chip--button"
                  onClick={() => openCableEditor(selectedEdge)}
                  type="button"
                >
                  <Cable size={16} />
                  <div>
                    <strong>{selectedEdge.data?.label ?? selectedEdge.id}</strong>
                    <small>
                      {describeEdgePorts(selectedEdge, nodeById)}
                    </small>
                  </div>
                </button>
              ) : selectedNode ? (
                <div className="selection-chip">
                  <EquipmentGlyph assetType={selectedNode.data.assetType} size={28} />
                  <div>
                    <strong>{selectedNode.data.label}</strong>
                    <small>Doble clic para configurar</small>
                  </div>
                </div>
              ) : (
                <span className="selection-chip selection-chip--empty">
                  Vista {getViewLabel(activeView)} · {getViewSummary(activeView, topologySummary)}
                </span>
              )}
            </Panel>

            <Background color="#aab2b8" gap={24} size={1.1} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable nodeColor={(node) => getNodeColor(node as BuilderNode)} />
          </ReactFlow>
        </section>

        <aside className="inspector-panel" aria-label="Inspector">
          {linkDraft ? (
            <CableEditor
              draft={linkDraft}
              edges={edges}
              nodeById={nodeById}
              onCancel={() => setLinkDraft(null)}
              onChange={setLinkDraft}
              onDelete={linkDraft.id ? removeSelectedEdge : undefined}
              onSave={saveCableDraft}
            />
          ) : editorNode ? (
            <>
              <div className="editor-header">
                <div className="panel-title">
                  <Settings size={18} />
                  <span>Configurar equipo</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setEditorNodeId(null)}
                  title="Cerrar editor"
                >
                  <X size={16} />
                </button>
              </div>

              <SelectedNodeCard node={editorNode} />

              <div className="inspector-tabs" role="tablist" aria-label="Panel de edicion">
                {[
                  { id: 'equipment', label: 'Equipo', icon: Box },
                  { id: 'logical', label: 'Red', icon: GitBranch },
                  { id: 'security', label: 'Seguridad', icon: Network },
                ].map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      aria-selected={editorTab === tab.id}
                      className="inspector-tab"
                      key={tab.id}
                      onClick={() => setEditorTab(tab.id as EditorTab)}
                      role="tab"
                      type="button"
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              <div className="inspector-scroll">
                {editorTab === 'equipment' ? (
                  <>
                    <section className="inspector-section">
                      <div className="section-heading">
                        <Box size={16} />
                        <span>Identidad e inventario</span>
                      </div>
                      <label className="field">
                        <span>Etiqueta</span>
                        <input
                          value={editorNode.data.label}
                          onChange={(event) => updateEditorNode({ label: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Tipo de activo</span>
                        <select
                          value={editorNode.data.assetType}
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
                            value={editorNode.data.manufacturer ?? ''}
                            onChange={(event) =>
                              updateEditorNode({ manufacturer: event.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Modelo</span>
                          <input
                            value={editorNode.data.model ?? ''}
                            onChange={(event) => updateEditorNode({ model: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="field-grid">
                        <label className="field">
                          <span>Firmware</span>
                          <input
                            value={editorNode.data.firmwareVersion ?? ''}
                            onChange={(event) =>
                              updateEditorNode({ firmwareVersion: event.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Serie</span>
                          <input
                            value={editorNode.data.serialNumber ?? ''}
                            onChange={(event) =>
                              updateEditorNode({ serialNumber: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </section>

                    <section className="inspector-section">
                      <div className="section-heading">
                        <Cable size={16} />
                        <span>Rack y puertos</span>
                      </div>
                      <div className="field-grid">
                        <label className="field">
                          <span>RU rack</span>
                          <input
                            min="1"
                            max="60"
                            type="number"
                            value={editorNode.data.rackPosition ?? ''}
                            onChange={(event) =>
                              updateEditorNode({
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
                            value={editorNode.data.portCount}
                            onChange={(event) =>
                              updateEditorNode({
                                portCount: parseBoundedNumber(event.target.value, 1, 1, 96),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Prefijo de puerto</span>
                        <input
                          value={editorNode.data.portPrefix}
                          onChange={(event) =>
                            updateEditorNode({ portPrefix: event.target.value })
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
                  </>
                ) : null}

                {editorTab === 'logical' ? (
                  <section className="inspector-section">
                    <div className="section-heading">
                      <GitBranch size={16} />
                      <span>Direccionamiento y segmentacion</span>
                    </div>
                    <div className="field-grid">
                      <label className="field">
                        <span>VLAN ID</span>
                        <input
                          min="1"
                          max="4094"
                          type="number"
                          value={editorNode.data.vlanId}
                          onChange={(event) =>
                            updateEditorNode({
                              vlanId: parseBoundedNumber(event.target.value, 1, 1, 4094),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Nombre VLAN</span>
                        <input
                          value={editorNode.data.vlanName}
                          onChange={(event) =>
                            updateEditorNode({ vlanName: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>IPv4 principal</span>
                      <input
                        placeholder="192.168.10.10/24"
                        value={editorNode.data.ipv4Address ?? ''}
                        onChange={(event) =>
                          updateEditorNode({ ipv4Address: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>IPv6 principal</span>
                      <input
                        placeholder="2001:db8::10/64"
                        value={editorNode.data.ipv6Address ?? ''}
                        onChange={(event) =>
                          updateEditorNode({ ipv6Address: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>MAC principal</span>
                      <input
                        placeholder="00:1A:2B:3C:4D:5E"
                        value={editorNode.data.macAddress ?? ''}
                        onChange={(event) =>
                          updateEditorNode({ macAddress: event.target.value })
                        }
                      />
                    </label>
                    <div className="toggle-row">
                      <label>
                        <input
                          checked={editorNode.data.enabled}
                          onChange={(event) =>
                            updateEditorNode({ enabled: event.target.checked })
                          }
                          type="checkbox"
                        />
                        Interfaz habilitada
                      </label>
                      <label>
                        <input
                          checked={editorNode.data.mgmtOnly}
                          onChange={(event) =>
                            updateEditorNode({ mgmtOnly: event.target.checked })
                          }
                          type="checkbox"
                        />
                        Solo gestion
                      </label>
                    </div>
                  </section>
                ) : null}

                {editorTab === 'security' ? (
                  <section className="inspector-section">
                    <div className="section-heading">
                      <Settings size={16} />
                      <span>Zona y cumplimiento OT</span>
                    </div>
                    <label className="field">
                      <span>Zona IEC 62443</span>
                      <input
                        value={editorNode.data.zoneName}
                        onChange={(event) =>
                          updateEditorNode({
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
                          value={editorNode.data.purdueLevel}
                          onChange={(event) =>
                            updateEditorNode({
                              purdueLevel: Number(event.target.value) as PurdueLevel,
                            })
                          }
                        >
                          {purdueOptions.map((level) => (
                            <option key={level} value={level}>
                              L{level} · {purdueLabels[level]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Security Level</span>
                        <select
                          value={editorNode.data.securityLevel}
                          onChange={(event) =>
                            updateEditorNode({
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
                        value={editorNode.data.criticality}
                        onChange={(event) =>
                          updateEditorNode({
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
                        value={editorNode.data.allowedProtocols.join(', ')}
                        onChange={(event) =>
                          updateEditorNode({
                            allowedProtocols: parseProtocols(event.target.value),
                          })
                        }
                      />
                    </label>
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="panel-title">
                <LayersIcon />
                <span>Resumen operativo</span>
              </div>

              {selectedEdge ? (
                <button
                  type="button"
                  className="selected-link-card"
                  onClick={() => openCableEditor(selectedEdge)}
                >
                  <Cable size={18} />
                  <div>
                    <strong>{selectedEdge.data?.label ?? selectedEdge.id}</strong>
                    <small>{describeEdgePorts(selectedEdge, nodeById)}</small>
                  </div>
                </button>
              ) : null}

              <section className="inspector-section">
                <div className="section-heading">
                  <Factory size={16} />
                  <span>Distribucion Purdue</span>
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
              </section>

              <section className="inspector-section">
                <div className="section-heading">
                  <Network size={16} />
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
                  <button type="button" className="secondary-button" onClick={checkTools}>
                    <Settings size={16} />
                    Entorno
                  </button>
                  <button type="button" className="secondary-button" onClick={bootstrap}>
                    <CheckCircle2 size={16} />
                    Bootstrap
                  </button>
                  <button type="button" className="secondary-button" onClick={generateArtifacts}>
                    <GitBranch size={16} />
                    Artefactos
                  </button>
                  <button type="button" className="secondary-button" onClick={deployPipelineRun}>
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
              </section>

              <section className="inspector-section">
                <div className="section-heading">
                  <Database size={16} />
                  <span>Entorno actual</span>
                </div>
                <div className="tool-grid">
                  {(toolReport?.tools ?? []).map((tool) => (
                    <div
                      className="tool-chip"
                      data-installed={tool.installed}
                      key={tool.name}
                    >
                      <span>{tool.name}</span>
                      <strong>{tool.installed ? 'OK' : 'Falta'}</strong>
                      <small>{tool.path ?? tool.error ?? 'Sin detectar'}</small>
                    </div>
                  ))}
                  {toolReport === null ? (
                    <div className="tool-chip" data-installed="pending">
                      <span>Entorno</span>
                      <strong>No verificado</strong>
                      <small>Consulta pendiente</small>
                    </div>
                  ) : null}
                </div>
              </section>

              <DataDrawer
                label="TopologyCreate"
                meta={`${payload.devices.length} equipos · ${payload.cables.length} cables`}
                value={payloadText}
              />

              {pipelineArtifacts ? (
                <DataDrawer
                  label="Artefactos"
                  meta={`${pipelineArtifacts.artifacts.length} archivos`}
                  value={artifactText}
                />
              ) : null}

              {pipelineRun ? (
                <DataDrawer
                  label="Ejecucion"
                  meta={`${pipelineRun.commands.length} comandos`}
                  value={pipelineRunText}
                />
              ) : null}
            </>
          )}
        </aside>
      </section>
    </main>
  )
}

function CableEditor({
  draft,
  edges,
  nodeById,
  onCancel,
  onChange,
  onDelete,
  onSave,
}: {
  draft: CableDraft
  edges: BuilderEdge[]
  nodeById: Map<string, BuilderNode>
  onCancel: () => void
  onChange: (draft: CableDraft) => void
  onDelete?: () => void
  onSave: () => void
}) {
  const sourceNode = nodeById.get(draft.sourceId)
  const targetNode = nodeById.get(draft.targetId)

  if (!sourceNode || !targetNode) {
    return null
  }

  const sourceOptions = buildPortOptions(sourceNode, edges, draft.id, draft.sourcePortIndex)
  const targetOptions = buildPortOptions(targetNode, edges, draft.id, draft.targetPortIndex)

  return (
    <>
      <div className="editor-header">
        <div className="panel-title">
          <Cable size={18} />
          <span>{draft.id ? 'Editar cable' : 'Nuevo cable'}</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onCancel}
          title="Cerrar editor de cable"
        >
          <X size={16} />
        </button>
      </div>

      <div className="link-card">
        <div className="link-card__endpoint">
          <EquipmentGlyph assetType={sourceNode.data.assetType} size={34} />
          <div>
            <strong>{sourceNode.data.label}</strong>
            <small>{sourceNode.id}</small>
          </div>
        </div>
        <Cable size={18} />
        <div className="link-card__endpoint">
          <EquipmentGlyph assetType={targetNode.data.assetType} size={34} />
          <div>
            <strong>{targetNode.data.label}</strong>
            <small>{targetNode.id}</small>
          </div>
        </div>
      </div>

      <section className="inspector-section">
        <div className="section-heading">
          <Cable size={16} />
          <span>Definicion del enlace</span>
        </div>
        <label className="field">
          <span>Nombre del cable</span>
          <input
            value={draft.label}
            onChange={(event) =>
              onChange({
                ...draft,
                label: event.target.value,
              })
            }
          />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>{sourceNode.data.label}</span>
            <select
              value={draft.sourcePortIndex}
              onChange={(event) =>
                onChange({
                  ...draft,
                  sourcePortIndex: Number(event.target.value),
                })
              }
            >
              {sourceOptions.map((option) => (
                <option disabled={option.disabled} key={option.index} value={option.index}>
                  {option.name} {option.disabled ? '· ocupado' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{targetNode.data.label}</span>
            <select
              value={draft.targetPortIndex}
              onChange={(event) =>
                onChange({
                  ...draft,
                  targetPortIndex: Number(event.target.value),
                })
              }
            >
              {targetOptions.map((option) => (
                <option disabled={option.disabled} key={option.index} value={option.index}>
                  {option.name} {option.disabled ? '· ocupado' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="helper-copy">
          Flujo tipo GNS3: activa la herramienta de enlace, elige origen, elige destino y
          confirma aquí los puertos.
        </p>
      </section>

      <div className="action-row">
        <button type="button" className="secondary-button" onClick={onSave}>
          <Save size={16} />
          Guardar cable
        </button>
        {onDelete ? (
          <button type="button" className="danger-button" onClick={onDelete}>
            <Trash2 size={16} />
            Eliminar
          </button>
        ) : null}
      </div>
    </>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SelectedNodeCard({ node }: { node: BuilderNode }) {
  return (
    <div className="selected-node-card">
      <div className="selected-node-card__glyph">
        <EquipmentGlyph assetType={node.data.assetType} size={40} />
      </div>
      <div className="selected-node-card__body">
        <strong>{node.data.label}</strong>
        <span>{node.data.assetType.replace('_', ' ')}</span>
        <small>
          VLAN {node.data.vlanId} · {node.data.zoneName} · {node.data.securityLevel}
        </small>
      </div>
    </div>
  )
}

function DataDrawer({
  label,
  meta,
  value,
}: {
  label: string
  meta: string
  value: string
}) {
  return (
    <details className="data-drawer">
      <summary>
        <div>
          <strong>{label}</strong>
          <small>{meta}</small>
        </div>
      </summary>
      <pre className="payload-preview">{value}</pre>
    </details>
  )
}

function LayersIcon() {
  return <Layers3Visual />
}

function Layers3Visual() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="m9 2 6 3.3-6 3.2-6-3.2L9 2Zm0 5.6 6 3.2L9 14 3 10.8l6-3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function cloneSnapshot(snapshot: BuilderSnapshot): BuilderSnapshot {
  return {
    settings: { ...snapshot.settings },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        allowedProtocols: [...node.data.allowedProtocols],
      },
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
      markerEnd:
        edge.markerEnd && typeof edge.markerEnd === 'object'
          ? { ...edge.markerEnd }
          : edge.markerEnd,
      style: edge.style ? { ...edge.style } : undefined,
    })),
  }
}

function shouldRecordNodeChanges(changes: NodeChange<BuilderNode>[]): boolean {
  return changes.some((change) => {
    if (change.type === 'remove' || change.type === 'add' || change.type === 'replace') {
      return true
    }
    if (change.type === 'position') {
      return 'dragging' in change ? change.dragging === false : true
    }
    return false
  })
}

function isEditableElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false
  }

  const tag = element.tagName.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    element.isContentEditable
  )
}

function buildPortOptions(
  node: BuilderNode,
  edges: BuilderEdge[],
  excludedEdgeId: string | undefined,
  selectedPortIndex: number,
) {
  const used = new Set(getUsedPortIndexes(edges, node.id, excludedEdgeId))
  const maxIndex = Math.max(node.data.portCount - 1, selectedPortIndex, ...used.values())

  return Array.from({ length: Math.max(maxIndex + 1, 1) }, (_, index) => ({
    index,
    name: getPortName(node, index),
    disabled: used.has(index) && index !== selectedPortIndex,
  }))
}

function validateCableDraft(
  draft: CableDraft,
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): boolean {
  if (draft.sourceId === draft.targetId) {
    return false
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  if (!nodeIds.has(draft.sourceId) || !nodeIds.has(draft.targetId)) {
    return false
  }

  const sourceUsed = getUsedPortIndexes(edges, draft.sourceId, draft.id)
  const targetUsed = getUsedPortIndexes(edges, draft.targetId, draft.id)
  if (sourceUsed.includes(draft.sourcePortIndex) || targetUsed.includes(draft.targetPortIndex)) {
    return false
  }

  return !edges.some((edge) => {
    if (edge.id === draft.id) {
      return false
    }

    const sameOrientation =
      edge.source === draft.sourceId &&
      edge.target === draft.targetId &&
      (edge.data?.sourcePortIndex ?? 0) === draft.sourcePortIndex &&
      (edge.data?.targetPortIndex ?? 0) === draft.targetPortIndex

    const reverseOrientation =
      edge.source === draft.targetId &&
      edge.target === draft.sourceId &&
      (edge.data?.sourcePortIndex ?? 0) === draft.targetPortIndex &&
      (edge.data?.targetPortIndex ?? 0) === draft.sourcePortIndex

    return sameOrientation || reverseOrientation
  })
}

function buildCableLabel(
  sourceNode: BuilderNode,
  targetNode: BuilderNode,
  sequence: number,
): string {
  return `${sourceNode.data.label} a ${targetNode.data.label} ${sequence}`
}

function describeEdgePorts(
  edge: BuilderEdge,
  nodeById: Map<string, BuilderNode>,
): string {
  const sourceNode = nodeById.get(edge.source)
  const targetNode = nodeById.get(edge.target)
  if (!sourceNode || !targetNode) {
    return edge.id
  }

  return `${sourceNode.data.label}:${getPortName(sourceNode, edge.data?.sourcePortIndex ?? 0)} ↔ ${targetNode.data.label}:${getPortName(targetNode, edge.data?.targetPortIndex ?? 0)}`
}

function getEdgeDisplayLabel(
  edge: BuilderEdge,
  nodeById: Map<string, BuilderNode>,
  showInterfaceLabels: boolean,
  view: TopologyView,
): string {
  const cableLabel = edge.data?.label ?? edge.label?.toString() ?? edge.id
  if (!showInterfaceLabels || view === 'security') {
    return cableLabel
  }

  const sourceNode = nodeById.get(edge.source)
  const targetNode = nodeById.get(edge.target)
  if (!sourceNode || !targetNode) {
    return cableLabel
  }

  return `${cableLabel} · ${getPortName(sourceNode, edge.data?.sourcePortIndex ?? 0)} ↔ ${getPortName(targetNode, edge.data?.targetPortIndex ?? 0)}`
}

function getEditorTabForView(view: TopologyView): EditorTab {
  if (view === 'logical') {
    return 'logical'
  }
  if (view === 'security') {
    return 'security'
  }
  return 'equipment'
}

function extractMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    return String((data as { message: unknown }).message)
  }
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    return String((data as { detail: unknown }).detail)
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
    return '#0d7b74'
  }
  if (view === 'security') {
    return '#bf3434'
  }
  return '#57616a'
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
    return `${summary.ports} interfaces · ${summary.vlans} VLANs`
  }
  if (view === 'security') {
    return `${summary.zones} zonas · ${summary.conduits} conductos · ${summary.maxSecurityLevel}`
  }
  return `${summary.links} cables · ${summary.criticalAssets} activos criticos`
}

function getNodeColor(node: BuilderNode): string {
  if (node.data.activeView === 'logical') {
    return '#0d7b74'
  }
  if (node.data.activeView === 'security') {
    return node.data.criticality === 'critical' ? '#bf3434' : '#a76412'
  }
  return '#5d676f'
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
