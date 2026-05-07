import {
  Background,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
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
  ChevronRight,
  Circle,
  Copy,
  Database,
  Factory,
  GitBranch,
  Layers3,
  Link2,
  Network,
  MessageSquare,
  Redo2,
  Save,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  SendHorizonal,
  Square,
  TerminalSquare,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'

import './App.css'
import {
  bootstrapNetBox,
  chatWithComplianceAssistant,
  deploySavedPipeline,
  generateComplianceReport,
  generateSavedPipelineArtifacts,
  getPipelineLabStatus,
  getTopologyState,
  type ComplianceChatMessage,
  type ComplianceChatResponse,
  type ComplianceReportResponse,
  getHealth,
  type PipelineConsoleResultResponse,
  getPipelineTools,
  type HealthResponse,
  type PipelineArtifactsResponse,
  type PipelineLabStatusResponse,
  type PipelineRunResponse,
  type PipelineToolReportResponse,
  type TopologyProjectStatePayload,
  type TopologyProjectStateSaveResponse,
  runPipelineConsoleCommand,
  saveTopologyState,
} from './api/gemeroticApi'
import { AssetNode } from './components/AssetNode'
import { CableEdge } from './components/CableEdge'
import { DrawingNode as DrawingCanvasNode } from './components/DrawingNode'
import { EquipmentGlyph } from './components/EquipmentGlyph'
import { getEdgeHandleIds, getSiblingOffsets } from './domain/edgeLayout'
import { assetCatalog, getAssetDefinition } from './domain/assetCatalog'
const DEPLOY_TOOL_NAMES = ['docker', 'containerlab', 'ansible-playbook'] as const

import {
  buildTopologyPayload,
  createBuilderEdge,
  createInitialBuilderState,
  createNodeFromAsset,
  getNextAssetIndex,
  getPortName,
  getUsedPortIndexes,
  slugify,
  updateEdgeData,
  updateNodeData,
  updatePortConfig,
} from './domain/topologyBuilder'
import type { DrawingKind, DrawingNode as DrawingNodeModel } from './domain/drawingTypes'
import type {
  AssetType,
  BuilderEdge,
  BuilderNode,
  BuilderPortConfig,
  BuilderState,
  Criticality,
  PurdueLevel,
  SecurityLevel,
  TopologySettings,
  TopologyView,
} from './domain/topologyTypes'

const nodeTypes = {
  asset: AssetNode,
  drawing: DrawingCanvasNode,
}

const edgeTypes = {
  cable: CableEdge,
}

const PROJECT_NAME_STORAGE_KEY = 'gemerotic-current-project-v2'
const PROJECT_DRAFT_STORAGE_PREFIX = 'gemerotic-project-draft-v2:'
const criticalityOptions: Criticality[] = ['critical', 'high', 'medium', 'low']
const securityLevelOptions: SecurityLevel[] = ['SL-0', 'SL-1', 'SL-2', 'SL-3', 'SL-4']
const purdueOptions: PurdueLevel[] = [0, 1, 2, 3, 4, 5]

type OperationStatus = 'idle' | 'running' | 'success' | 'error'
type WorkflowState =
  | 'online'
  | 'ready'
  | 'missing'
  | 'partial'
  | 'unchecked'
  | 'running'
  | 'error'
type EditorTab = 'equipment' | 'ports' | 'logical' | 'security'
type InteractionMode = 'select' | 'link'
type DataTab = 'topology' | 'artifacts' | 'run' | 'compliance'
type ConsoleEntry = {
  id: string
  tone: OperationStatus
  text: string
}
type DeviceConsole = {
  nodeId: string
  label: string
  draft: string
  entries: ConsoleEntry[]
}
type LinkEndpoint = {
  nodeId: string
  portIndex: number
}
type PortPickerState = {
  phase: 'source' | 'target'
  nodeId: string
  sourceEndpoint?: LinkEndpoint
}
type CableDraft = {
  id?: string
  sourceId: string
  targetId: string
  label: string
  sourcePortIndex: number
  targetPortIndex: number
}
type CanvasNode = BuilderNode | DrawingNodeModel
type CanvasHistoryState = BuilderState & {
  drawings: DrawingNodeModel[]
}

const viewOptions: Array<{
  id: TopologyView
  label: string
}> = [
  { id: 'physical', label: 'Fisica' },
  { id: 'logical', label: 'Logica' },
  { id: 'security', label: 'Seguridad' },
]

const assetGroups = [
  { id: 'network', label: 'Routers/Switches' },
  { id: 'ot', label: 'Control OT' },
  { id: 'compute', label: 'End devices' },
  { id: 'security', label: 'Security' },
  { id: 'all', label: 'All devices' },
]

const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: false,
  style: {
    stroke: '#5f6972',
    strokeWidth: 2,
  },
  type: 'cable',
}

const purdueLabels: Record<PurdueLevel, string> = {
  0: 'Proceso',
  1: 'Control',
  2: 'Supervision',
  3: 'DMZ industrial',
  4: 'IT planta',
  5: 'Enterprise',
}

const drawingPalette = ['#2563eb', '#0f766e', '#b45309', '#b91c1c', '#64748b']

const drawingKindLabels: Record<DrawingKind, string> = {
  zone: 'Zona',
  rectangle: 'Rectangulo',
  ellipse: 'Circulo',
  text: 'Texto',
}

function createInitialDrawingNodes(): DrawingNodeModel[] {
  return []
}

function createDrawingNode(
  id: string,
  kind: DrawingKind,
  label: string,
  view: TopologyView,
  options: {
    color: string
    height: number
    position: { x: number; y: number }
    width: number
    purdueLevel?: PurdueLevel
    securityLevel?: SecurityLevel
  },
): DrawingNodeModel {
  return {
    id,
    data: {
      color: options.color,
      height: options.height,
      kind,
      label,
      purdueLevel: options.purdueLevel,
      securityLevel: options.securityLevel,
      view,
      width: options.width,
    },
    draggable: true,
    position: options.position,
    selectable: true,
    style: {
      height: options.height,
      width: options.width,
    },
    type: 'drawing',
    zIndex: -10,
  }
}

function App() {
  const initialState = useMemo(() => createInitialAppState(), [])
  const [settings, setSettings] = useState<TopologySettings>(
    initialState.snapshot.settings,
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(
    initialState.snapshot.nodes,
  )
  const [drawings, setDrawings, onDrawingsChange] =
    useNodesState<DrawingNodeModel>(initialState.snapshot.drawings)
  const [edges, setEdges, onEdgesChange] = useEdgesState<BuilderEdge>(
    initialState.snapshot.edges,
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialState.snapshot.nodes[0]?.id ?? null,
  )
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null)
  const [drawingEditorId, setDrawingEditorId] = useState<string | null>(null)
  const [editorTab, setEditorTab] = useState<EditorTab>('equipment')
  const [activeView, setActiveView] = useState<TopologyView>(initialState.activeView)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select')
  const [pendingLinkSource, setPendingLinkSource] = useState<LinkEndpoint | null>(null)
  const [portPicker, setPortPicker] = useState<PortPickerState | null>(null)
  const [showInterfaceLabels, setShowInterfaceLabels] = useState(false)
  const [selectedDeviceGroup, setSelectedDeviceGroup] = useState<string>('all')
  const [dataTab, setDataTab] = useState<DataTab>('topology')
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [showDataBrowser, setShowDataBrowser] = useState(false)
  const [linkDraft, setLinkDraft] = useState<CableDraft | null>(null)
  const [historyPast, setHistoryPast] = useState<CanvasHistoryState[]>([])
  const [historyFuture, setHistoryFuture] = useState<CanvasHistoryState[]>([])
  const [apiBaseUrl, setApiBaseUrl] = useState(() =>
    window.localStorage.getItem('gemerotic-api-base-url') ?? getDefaultApiBaseUrl(),
  )
  const [apiKey, setApiKey] = useState(() =>
    window.localStorage.getItem('gemerotic-api-key') ?? '',
  )
  const [remoteStateLoaded, setRemoteStateLoaded] = useState(
    () => window.localStorage.getItem(PROJECT_NAME_STORAGE_KEY) === null,
  )
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<CanvasNode, BuilderEdge> | null>(null)
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [operationMessage, setOperationMessage] = useState('Proyecto cargado')
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      id: 'boot-console-entry',
      tone: 'success',
      text: 'Proyecto cargado. Arrastra equipos al workspace o usa Add Link para crear enlaces.',
    },
  ])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [toolReport, setToolReport] = useState<PipelineToolReportResponse | null>(null)
  const [pipelineArtifacts, setPipelineArtifacts] =
    useState<PipelineArtifactsResponse | null>(null)
  const [pipelineRun, setPipelineRun] = useState<PipelineRunResponse | null>(null)
  const [labStatus, setLabStatus] = useState<PipelineLabStatusResponse | null>(null)
  const [complianceReport, setComplianceReport] =
    useState<ComplianceReportResponse | null>(null)
  const [showComplianceAssistant, setShowComplianceAssistant] = useState(false)
  const [chatMessages, setChatMessages] = useState<ComplianceChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [deviceConsoles, setDeviceConsoles] = useState<Record<string, DeviceConsole>>({})
  const [activeConsoleTabId, setActiveConsoleTabId] = useState<string>('app')
  const [consoleBusyNodeId, setConsoleBusyNodeId] = useState<string | null>(null)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null
  const selectedDrawing =
    drawings.find((drawing) => drawing.id === selectedDrawingId) ?? null
  const editorNode = nodes.find((node) => node.id === editorNodeId) ?? null
  const editorDrawing =
    drawings.find((drawing) => drawing.id === drawingEditorId) ?? null
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const pendingLinkSourceNode =
    pendingLinkSource === null ? null : nodeById.get(pendingLinkSource.nodeId) ?? null
  const visibleAssets = useMemo(() => {
    if (selectedDeviceGroup === 'all') {
      return assetCatalog
    }
    return assetCatalog.filter((asset) => asset.role === selectedDeviceGroup)
  }, [selectedDeviceGroup])
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
  const complianceText = useMemo(
    () => (complianceReport === null ? '' : JSON.stringify(complianceReport, null, 2)),
    [complianceReport],
  )
  const topologySummary = useMemo(
    () => ({
      assets: nodes.length,
      links: edges.length,
      interfaces: payload.interfaces.length,
      zones: payload.security_zones.length,
    }),
    [edges.length, nodes.length, payload.interfaces.length, payload.security_zones.length],
  )
  const resizeDrawingFromCanvas = useCallback(
    (drawingId: string, width: number, height: number) => {
      const nextWidth = clampDrawingSize(width)
      const nextHeight = clampDrawingSize(height)
      const snapshot = cloneSnapshot({ settings, nodes, edges, drawings })
      setHistoryPast((previous) => [...previous.slice(-59), snapshot])
      setHistoryFuture([])
      setDrawings((currentDrawings) =>
        currentDrawings.map((drawing) =>
          drawing.id === drawingId
            ? syncDrawingDimensions(drawing, {
                height: nextHeight,
                width: nextWidth,
              })
            : drawing,
        ),
      )
      setOperationStatus('success')
      setOperationMessage('Dibujo redimensionado')
    },
    [drawings, edges, nodes, setDrawings, settings],
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
  const displayedDrawings = useMemo(
    () =>
      drawings
        .filter((drawing) => drawing.data.view === activeView)
        .map((drawing) => ({
          ...drawing,
          data: {
            ...drawing.data,
            onResizeEnd: (width: number, height: number) =>
              resizeDrawingFromCanvas(drawing.id, width, height),
          },
          selected: drawing.id === selectedDrawingId,
          style: {
            height: drawing.data.height,
            width: drawing.data.width,
          },
          zIndex: -10,
        })),
    [activeView, drawings, resizeDrawingFromCanvas, selectedDrawingId],
  )
  const displayedCanvasNodes = useMemo(
    () => [...displayedDrawings, ...displayedNodes] as CanvasNode[],
    [displayedDrawings, displayedNodes],
  )
  const siblingOffsets = useMemo(() => getSiblingOffsets(edges), [edges])
  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const sourceNode = nodeById.get(edge.source)
        const targetNode = nodeById.get(edge.target)
        const displayLabel = getEdgeDisplayLabel(edge, nodeById, showInterfaceLabels, activeView)
        const handlePair =
          sourceNode && targetNode
            ? getEdgeHandleIds(sourceNode, targetNode)
            : { sourceHandle: 'right', targetHandle: 'left' }

        return {
          ...edge,
          sourceHandle: handlePair.sourceHandle,
          targetHandle: handlePair.targetHandle,
          style: {
            stroke: edge.id === selectedEdgeId ? '#b87416' : getEdgeColor(activeView),
            strokeDasharray: getEdgeDash(activeView),
            strokeWidth: edge.id === selectedEdgeId ? 3.2 : activeView === 'security' ? 2.8 : 2.2,
          },
          animated: activeView === 'logical',
          type: 'cable',
          data: {
            label: edge.data?.label ?? edge.label?.toString() ?? edge.id,
            sourcePortIndex: edge.data?.sourcePortIndex ?? 0,
            targetPortIndex: edge.data?.targetPortIndex ?? 0,
            activeView,
            displayLabel,
            showPortLabels: showInterfaceLabels,
            siblingOffset: siblingOffsets.get(edge.id) ?? 0,
            sourcePortName:
              sourceNode === undefined
                ? ''
                : getPortName(sourceNode, edge.data?.sourcePortIndex ?? 0),
            targetPortName:
              targetNode === undefined
                ? ''
                : getPortName(targetNode, edge.data?.targetPortIndex ?? 0),
          },
        }
      }),
    [activeView, edges, nodeById, selectedEdgeId, showInterfaceLabels, siblingOffsets],
  )
  const deployToolsInstalled =
    toolReport !== null &&
    DEPLOY_TOOL_NAMES.every((toolName) =>
      toolReport.tools.some((tool) => tool.name === toolName && tool.installed),
    )
  const activeDeviceConsole =
    activeConsoleTabId === 'app' ? null : deviceConsoles[activeConsoleTabId] ?? null
  const runtimeNodesById = useMemo(
    () => new Map((labStatus?.nodes ?? []).map((node) => [node.node_id, node])),
    [labStatus],
  )
  const canUndo = historyPast.length > 0
  const canRedo = historyFuture.length > 0
  const apiConfig = { baseUrl: apiBaseUrl, apiKey }
  const hasApiBaseUrl = apiBaseUrl.trim().length > 0

  useEffect(() => {
    window.localStorage.setItem('gemerotic-api-base-url', apiBaseUrl)
  }, [apiBaseUrl])

  useEffect(() => {
    window.localStorage.setItem('gemerotic-api-key', apiKey)
  }, [apiKey])

  useEffect(() => {
    if (remoteStateLoaded || !hasApiBaseUrl) {
      return
    }

    let cancelled = false
    const projectName = window.localStorage.getItem(PROJECT_NAME_STORAGE_KEY)
    if (projectName === null) {
      return
    }
    const storedProjectName = projectName

    async function hydrateProjectState() {
      try {
        const result = await getTopologyState(
          { baseUrl: apiBaseUrl, apiKey },
          storedProjectName,
        )
        if (cancelled) {
          return
        }
        if (result.ok && result.data.data !== undefined) {
          const localDraft = loadProjectDraft(storedProjectName)
          if (isProjectStateNewer(localDraft, result.data.data)) {
            appendConsole('Estado local conservado; servidor aun no tenia el ultimo cambio', 'idle')
            return
          }
          const restored = coerceProjectState(
            result.data.data,
            cloneSnapshot({ settings, nodes, edges, drawings }),
          )
          const cloned = cloneSnapshot(restored.snapshot)
          setSettings(cloned.settings)
          setNodes(cloned.nodes)
          setEdges(cloned.edges)
          setDrawings(cloned.drawings)
          setSelectedNodeId(null)
          setSelectedEdgeId(null)
          setSelectedDrawingId(null)
          setEditorNodeId(null)
          setDrawingEditorId(null)
          setPendingLinkSource(null)
          setPortPicker(null)
          setLinkDraft(null)
          setInteractionMode('select')
          setActiveView(restored.activeView)
          setHistoryPast([])
          setHistoryFuture([])
          window.localStorage.setItem(PROJECT_NAME_STORAGE_KEY, restored.projectName)
          saveProjectDraft(result.data.data)
          setOperationStatus('success')
          setOperationMessage('Estado guardado cargado')
          appendConsole('Estado guardado cargado desde el API', 'success')
          return
        }
        if (result.status !== 404) {
          const message = extractMessage(result.data, `HTTP ${result.status}`)
          setOperationStatus('error')
          setOperationMessage(message)
          appendConsole(message, 'error')
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Request failed'
          appendConsole(`No se pudo cargar estado guardado: ${message}`, 'error')
        }
      } finally {
        if (!cancelled) {
          setRemoteStateLoaded(true)
        }
      }
    }

    void hydrateProjectState()
    return () => {
      cancelled = true
    }
  }, [
    apiBaseUrl,
    apiKey,
    drawings,
    edges,
    hasApiBaseUrl,
    nodes,
    remoteStateLoaded,
    setDrawings,
    setEdges,
    setNodes,
    settings,
  ])

  function appendConsole(text: string, tone: OperationStatus = 'idle') {
    setConsoleEntries((current) => [
      ...current.slice(-59),
      {
        id: `${Date.now()}-${current.length}`,
        text,
        tone,
      },
    ])
  }

  function appendDeviceConsole(
    nodeId: string,
    text: string,
    tone: OperationStatus = 'idle',
  ) {
    const nodeLabel = nodeById.get(nodeId)?.data.label ?? nodeId
    setDeviceConsoles((current) => {
      const existing = current[nodeId] ?? {
        nodeId,
        label: nodeLabel,
        draft: '',
        entries: [],
      }
      return {
        ...current,
        [nodeId]: {
          ...existing,
          label: nodeLabel,
          entries: [
            ...existing.entries.slice(-59),
            {
              id: `${Date.now()}-${existing.entries.length}`,
              text,
              tone,
            },
          ],
        },
      }
    })
  }

  function openNodeConsole(nodeId: string) {
    const node = nodeById.get(nodeId)
    if (!node) {
      return
    }

    setDeviceConsoles((current) => ({
      ...current,
      [nodeId]:
        current[nodeId] ?? {
          nodeId,
          label: node.data.label,
          draft: '',
          entries: [
            {
              id: `console-${nodeId}-boot`,
              tone: 'idle',
              text:
                'Consola del runtime Linux del lab. Usa comandos allowlistados como ip link show, ip addr show, ping -c 1 <destino> o ip link set dev eth1 down.',
            },
          ],
        },
    }))
    setActiveConsoleTabId(nodeId)
    if (!runtimeNodesById.has(nodeId) && hasApiBaseUrl) {
      void inspectRuntimeLab()
    }
  }

  function updateDeviceConsoleDraft(nodeId: string, value: string) {
    setDeviceConsoles((current) => {
      const existing = current[nodeId]
      if (!existing) {
        return current
      }
      return {
        ...current,
        [nodeId]: {
          ...existing,
          draft: value,
        },
      }
    })
  }

  function appendRuntimeConsoleResult(
    nodeId: string,
    result: PipelineConsoleResultResponse,
  ) {
    const stdout = result.stdout_tail.trim()
    const stderr = result.stderr_tail.trim()
    if (stdout) {
      appendDeviceConsole(nodeId, stdout, result.exit_code === 0 ? 'success' : 'error')
    }
    if (stderr) {
      appendDeviceConsole(nodeId, stderr, 'error')
    }
    if (!stdout && !stderr) {
      appendDeviceConsole(
        nodeId,
        result.exit_code === 0 ? 'Comando completado sin salida' : 'Comando sin salida',
        result.exit_code === 0 ? 'success' : 'error',
      )
    }
  }

  function showActionRequired(message: string) {
    setOperationStatus('error')
    setOperationMessage(message)
    appendConsole(message, 'error')
  }

  function ensureApiBaseUrlConfigured(actionLabel: string): boolean {
    if (hasApiBaseUrl) {
      return true
    }
    showActionRequired(`Configura Base URL en Proyecto antes de ejecutar: ${actionLabel}.`)
    return false
  }

  function ensureProtectedApiConfigured(actionLabel: string): boolean {
    return ensureApiBaseUrlConfigured(actionLabel)
  }

  function pushHistorySnapshot() {
    const snapshot = cloneSnapshot({ settings, nodes, edges, drawings })
    setHistoryPast((previous) => [...previous.slice(-59), snapshot])
    setHistoryFuture([])
  }

  function restoreSnapshot(snapshot: CanvasHistoryState) {
    const cloned = cloneSnapshot(snapshot)
    setSettings(cloned.settings)
    setNodes(cloned.nodes)
    setEdges(cloned.edges)
    setDrawings(cloned.drawings)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setSelectedDrawingId(null)
    setEditorNodeId(null)
    setDrawingEditorId(null)
    setPendingLinkSource(null)
    setPortPicker(null)
    setLinkDraft(null)
    setDrawingEditorId(null)
    setInteractionMode('select')
  }

  function undo() {
    if (historyPast.length === 0) {
      return
    }
    const previous = historyPast[historyPast.length - 1]
    const current = cloneSnapshot({ settings, nodes, edges, drawings })
    setHistoryPast(historyPast.slice(0, -1))
    setHistoryFuture([current, ...historyFuture].slice(0, 60))
    restoreSnapshot(previous)
    appendConsole('Undo aplicado', 'success')
  }

  function redo() {
    if (historyFuture.length === 0) {
      return
    }
    const next = historyFuture[0]
    const current = cloneSnapshot({ settings, nodes, edges, drawings })
    setHistoryPast([...historyPast, current].slice(-60))
    setHistoryFuture(historyFuture.slice(1))
    restoreSnapshot(next)
    appendConsole('Redo aplicado', 'success')
  }

  function cancelTransientUi() {
    setPendingLinkSource(null)
    setPortPicker(null)
    setLinkDraft(null)
    setInteractionMode('select')
    appendConsole('Accion cancelada', 'idle')
  }

  function removeSelectedNode() {
    if (selectedNodeId === null) {
      return
    }
    pushHistorySnapshot()
    const removedLabel = nodeById.get(selectedNodeId)?.data.label ?? selectedNodeId
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNodeId))
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    )
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorNodeId(null)
    setPendingLinkSource((current) =>
      current?.nodeId === selectedNodeId ? null : current,
    )
    setPortPicker((current) =>
      current?.nodeId === selectedNodeId || current?.sourceEndpoint?.nodeId === selectedNodeId
        ? null
        : current,
    )
    setDeviceConsoles((current) => {
      const next = { ...current }
      delete next[selectedNodeId]
      return next
    })
    setActiveConsoleTabId((current) => (current === selectedNodeId ? 'app' : current))
    appendConsole(`Equipo eliminado: ${removedLabel}`, 'success')
  }

  function removeSelectedEdge() {
    if (selectedEdgeId === null) {
      return
    }
    pushHistorySnapshot()
    const removedLabel =
      edges.find((edge) => edge.id === selectedEdgeId)?.data?.label ?? selectedEdgeId
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId))
    setSelectedEdgeId(null)
    setLinkDraft(null)
    appendConsole(`Cable eliminado: ${removedLabel}`, 'success')
  }

  function removeSelectedDrawing() {
    if (selectedDrawingId === null) {
      return
    }
    pushHistorySnapshot()
    const removedLabel =
      drawings.find((drawing) => drawing.id === selectedDrawingId)?.data.label ??
      selectedDrawingId
    setDrawings((currentDrawings) =>
      currentDrawings.filter((drawing) => drawing.id !== selectedDrawingId),
    )
    setSelectedDrawingId(null)
    setDrawingEditorId(null)
    appendConsole(`Dibujo eliminado: ${removedLabel}`, 'success')
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
        if (selectedDrawingId) {
          event.preventDefault()
          removeSelectedDrawing()
          return
        }
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

  const handleCanvasNodesChange = (changes: NodeChange<CanvasNode>[]) => {
    const drawingIds = new Set(drawings.map((drawing) => drawing.id))
    const drawingChanges = changes.filter((change) =>
      drawingIds.has(getNodeChangeId(change)),
    ) as NodeChange<DrawingNodeModel>[]
    const assetChanges = changes.filter(
      (change) => !drawingIds.has(getNodeChangeId(change)),
    ) as NodeChange<BuilderNode>[]

    if (assetChanges.length > 0) {
      handleNodesChange(assetChanges)
    }
    if (drawingChanges.length > 0) {
      if (shouldRecordNodeChanges(drawingChanges)) {
        pushHistorySnapshot()
      }
      onDrawingsChange(drawingChanges)
      const removedSelectedDrawing = drawingChanges.some(
        (change) => change.type === 'remove' && change.id === selectedDrawingId,
      )
      if (removedSelectedDrawing) {
        setSelectedDrawingId(null)
        setDrawingEditorId(null)
      }
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

  const addAsset = (
    assetType: AssetType,
    position?: {
      x: number
      y: number
    },
  ) => {
    pushHistorySnapshot()
    const asset = getAssetDefinition(assetType)
    const node = createNodeFromAsset(asset, getNextAssetIndex(nodes, assetType), {
      x: position?.x ?? 180 + nodes.length * 34,
      y: position?.y ?? 140 + nodes.length * 28,
    })
    setNodes((currentNodes) => [...currentNodes, node])
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setSelectedDrawingId(null)
    setOperationStatus('success')
    setOperationMessage(`${asset.label} agregado`)
    appendConsole(`Equipo agregado: ${asset.label}`, 'success')
  }

  const addDrawing = (kind: DrawingKind) => {
    pushHistorySnapshot()
    const index = drawings.length + 1
    const viewportPosition = reactFlowInstance?.screenToFlowPosition({
      x: Math.min(window.innerWidth * 0.48, 720),
      y: 260,
    })
    const defaultSize =
      kind === 'text'
        ? { height: 58, width: 280 }
        : kind === 'ellipse'
          ? { height: 160, width: 220 }
          : { height: 190, width: 300 }
    const drawing = createDrawingNode(
      `drawing-${kind}-${Date.now()}`,
      kind,
      `${drawingKindLabels[kind]} ${index}`,
      activeView,
      {
        color: drawingPalette[index % drawingPalette.length],
        height: defaultSize.height,
        position: viewportPosition ?? {
          x: 180 + index * 28,
          y: 120 + index * 24,
        },
        purdueLevel: activeView === 'security' || kind === 'zone' ? 2 : undefined,
        securityLevel: activeView === 'security' || kind === 'zone' ? 'SL-2' : undefined,
        width: defaultSize.width,
      },
    )
    setDrawings((currentDrawings) => [...currentDrawings, drawing])
    setSelectedDrawingId(drawing.id)
    setDrawingEditorId(drawing.id)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorNodeId(null)
    appendConsole(`Dibujo agregado: ${drawing.data.label}`, 'success')
  }

  const updateDrawing = (
    drawingId: string,
    patch: Partial<DrawingNodeModel['data']>,
  ) => {
    pushHistorySnapshot()
    setDrawings((currentDrawings) =>
      currentDrawings.map((drawing) =>
        drawing.id === drawingId
          ? syncDrawingDimensions(drawing, {
              ...patch,
              height: clampDrawingSize(patch.height ?? drawing.data.height),
              width: clampDrawingSize(patch.width ?? drawing.data.width),
            })
          : drawing,
      ),
    )
  }

  const duplicateSelectedDrawing = () => {
    if (selectedDrawing === null) {
      return
    }
    pushHistorySnapshot()
    const width = clampDrawingSize(selectedDrawing.data.width)
    const height = clampDrawingSize(selectedDrawing.data.height)
    const duplicatedDrawing: DrawingNodeModel = {
      ...selectedDrawing,
      data: {
        ...stripDrawingRuntimeData(selectedDrawing.data),
        height,
        label: `${selectedDrawing.data.label} copia`,
        width,
      },
      id: `drawing-copy-${Date.now()}`,
      position: {
        x: selectedDrawing.position.x + 28,
        y: selectedDrawing.position.y + 28,
      },
      selected: false,
      style: {
        height,
        width,
      },
      zIndex: -10,
    }
    setDrawings((currentDrawings) => [...currentDrawings, duplicatedDrawing])
    setSelectedDrawingId(duplicatedDrawing.id)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setDrawingEditorId(duplicatedDrawing.id)
    appendConsole(`Dibujo duplicado: ${duplicatedDrawing.data.label}`, 'success')
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
        x: selectedNode.position.x + 46,
        y: selectedNode.position.y + 38,
      },
    )
    const duplicatedNode: BuilderNode = {
      ...node,
      data: {
        ...selectedNode.data,
        allowedProtocols: [...selectedNode.data.allowedProtocols],
        portConfigs: selectedNode.data.portConfigs.map((portConfig) => ({ ...portConfig })),
        label: `${selectedNode.data.label} copia`,
      },
    }
    setNodes((currentNodes) => [...currentNodes, duplicatedNode])
    setSelectedNodeId(duplicatedNode.id)
    setSelectedDrawingId(null)
    setEditorNodeId(duplicatedNode.id)
    appendConsole(`Equipo duplicado: ${duplicatedNode.data.label}`, 'success')
  }

  const updateSettingsWithHistory = (patch: Partial<TopologySettings>) => {
    pushHistorySnapshot()
    setSettings((currentSettings) => ({ ...currentSettings, ...patch }))
  }

  const updateEditorNode = (patch: Partial<BuilderNode['data']>) => {
    if (editorNodeId === null) {
      return
    }
    pushHistorySnapshot()
    setNodes((currentNodes) => updateNodeData(currentNodes, editorNodeId, patch))
  }

  const duplicateCurrentSelection = () => {
    if (selectedDrawing !== null) {
      duplicateSelectedDrawing()
      return
    }
    duplicateSelectedNode()
  }

  const updateEditorPort = (
    portIndex: number,
    patch: Partial<BuilderPortConfig>,
  ) => {
    if (editorNodeId === null) {
      return
    }
    pushHistorySnapshot()
    setNodes((currentNodes) => updatePortConfig(currentNodes, editorNodeId, portIndex, patch))
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

  const startLinkMode = () => {
    setInteractionMode((currentMode) => {
      const nextMode = currentMode === 'link' ? 'select' : 'link'
      setPendingLinkSource(null)
      setPortPicker(null)
      setLinkDraft(null)
      appendConsole(
        nextMode === 'link'
          ? 'Add Link activado: selecciona un equipo y despues un puerto de origen'
          : 'Modo seleccion activado',
        'success',
      )
      return nextMode
    })
  }

  const beginPortSelection = (
    node: BuilderNode,
    phase: 'source' | 'target',
    sourceEndpoint?: LinkEndpoint,
  ) => {
    const availableOptions = getAvailablePortOptions(
      node,
      edges,
      undefined,
      phase === 'target' ? sourceEndpoint?.nodeId : undefined,
    )

    if (availableOptions.length === 0) {
      appendConsole(`No hay puertos libres en ${node.data.label}`, 'error')
      setOperationStatus('error')
      setOperationMessage('No hay puertos libres disponibles')
      return
    }

    if (availableOptions.length === 1) {
      applyPortSelection(node, availableOptions[0].index, phase, sourceEndpoint)
      return
    }

    setPortPicker({
      phase,
      nodeId: node.id,
      sourceEndpoint,
    })
  }

  const createCableFromEndpoints = (sourceEndpoint: LinkEndpoint, targetEndpoint: LinkEndpoint) => {
    const sourceNode = nodeById.get(sourceEndpoint.nodeId)
    const targetNode = nodeById.get(targetEndpoint.nodeId)
    if (!sourceNode || !targetNode) {
      return
    }

    const draft: CableDraft = {
      sourceId: sourceEndpoint.nodeId,
      targetId: targetEndpoint.nodeId,
      label: buildCableLabel(
        sourceNode,
        sourceEndpoint.portIndex,
        targetNode,
        targetEndpoint.portIndex,
      ),
      sourcePortIndex: sourceEndpoint.portIndex,
      targetPortIndex: targetEndpoint.portIndex,
    }

    if (!validateCableDraft(draft, nodes, edges)) {
      setOperationStatus('error')
      setOperationMessage('Revisa puertos ocupados o enlaces duplicados')
      appendConsole('Error al crear cable: puertos ocupados o enlace duplicado', 'error')
      setPendingLinkSource(sourceEndpoint)
      setPortPicker(null)
      return
    }

    pushHistorySnapshot()
    const edgeId = `edge-${draft.sourceId}-${draft.targetId}-${Date.now()}`
    const edge = createBuilderEdge({
      id: edgeId,
      source: draft.sourceId,
      target: draft.targetId,
      label: draft.label,
      sourcePortIndex: draft.sourcePortIndex,
      targetPortIndex: draft.targetPortIndex,
    })
    setEdges((currentEdges) => [...currentEdges, edge])
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
    setEditorNodeId(null)
    setPendingLinkSource(null)
    setPortPicker(null)
    setLinkDraft(null)
    setOperationStatus('success')
    setOperationMessage(`Cable creado: ${draft.label}`)
    appendConsole(`Cable creado: ${draft.label}`, 'success')
  }

  const applyPortSelection = (
    node: BuilderNode,
    portIndex: number,
    phase: 'source' | 'target',
    sourceEndpoint?: LinkEndpoint,
  ) => {
    if (phase === 'source') {
      setPendingLinkSource({ nodeId: node.id, portIndex })
      setPortPicker(null)
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      appendConsole(`Origen: ${node.data.label}:${getPortName(node, portIndex)}`, 'success')
      appendConsole('Selecciona el equipo destino para completar el enlace', 'idle')
      return
    }

    if (sourceEndpoint === undefined) {
      return
    }

    createCableFromEndpoints(sourceEndpoint, {
      nodeId: node.id,
      portIndex,
    })
  }

  const handleNodeClick = (_: unknown, node: BuilderNode) => {
    if (interactionMode !== 'link') {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      setSelectedDrawingId(null)
      return
    }

    setSelectedEdgeId(null)
    if (pendingLinkSource === null) {
      beginPortSelection(node, 'source')
      return
    }

    if (pendingLinkSource.nodeId === node.id) {
      beginPortSelection(node, 'source')
      return
    }

    beginPortSelection(node, 'target', pendingLinkSource)
  }

  const handleNodeDoubleClick = (_: unknown, node: BuilderNode) => {
    setInteractionMode('select')
    setPendingLinkSource(null)
    setPortPicker(null)
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setEditorNodeId(node.id)
    setEditorTab(getEditorTabForView(activeView))
    appendConsole(`Editor abierto: ${node.data.label}`, 'success')
  }

  const handleCanvasNodeClick = (_: unknown, node: CanvasNode) => {
    if (node.type === 'drawing') {
      setSelectedDrawingId(node.id)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setEditorNodeId(null)
      return
    }
    handleNodeClick(_, node as BuilderNode)
  }

  const handleCanvasNodeDoubleClick = (_: unknown, node: CanvasNode) => {
    if (node.type === 'drawing') {
      setSelectedDrawingId(node.id)
      setDrawingEditorId(node.id)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setEditorNodeId(null)
      appendConsole(`Editor de dibujo abierto: ${node.data.label}`, 'success')
      return
    }
    handleNodeDoubleClick(_, node as BuilderNode)
  }

  const openCableEditor = (edge: BuilderEdge) => {
    setInteractionMode('select')
    setPendingLinkSource(null)
    setPortPicker(null)
    setSelectedNodeId(null)
    setSelectedDrawingId(null)
    setSelectedEdgeId(edge.id)
    setLinkDraft({
      id: edge.id,
      sourceId: edge.source,
      targetId: edge.target,
      label: edge.data?.label ?? edge.label?.toString() ?? edge.id,
      sourcePortIndex: edge.data?.sourcePortIndex ?? 0,
      targetPortIndex: edge.data?.targetPortIndex ?? 0,
    })
    appendConsole(`Editor de cable abierto: ${edge.data?.label ?? edge.id}`, 'success')
  }

  const saveCableDraft = () => {
    if (linkDraft === null) {
      return
    }
    if (!validateCableDraft(linkDraft, nodes, edges)) {
      setOperationStatus('error')
      setOperationMessage('Revisa puertos ocupados o enlaces duplicados')
      appendConsole('Error al guardar cable: puertos ocupados o enlace duplicado', 'error')
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
    appendConsole(`Cable guardado: ${linkDraft.label}`, 'success')
  }

  const removeCurrentSelection = () => {
    if (selectedDrawingId) {
      removeSelectedDrawing()
      return
    }
    if (selectedEdgeId) {
      removeSelectedEdge()
      return
    }
    if (selectedNodeId) {
      removeSelectedNode()
    }
  }

  const handleCatalogDragStart =
    (assetType: AssetType) => (event: ReactDragEvent<HTMLButtonElement>) => {
      event.dataTransfer.setData('application/gemerotic-asset', assetType)
      event.dataTransfer.effectAllowed = 'copy'
    }

  const handleWorkspaceDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleWorkspaceDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const assetType = event.dataTransfer.getData('application/gemerotic-asset') as AssetType
    if (!assetType || reactFlowInstance === null) {
      return
    }
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    addAsset(assetType, position)
  }

  const runOperation = async (
    operation: () => Promise<{ ok: boolean; status: number; data: unknown }>,
    successMessage: string,
  ) => {
    setOperationStatus('running')
    try {
      const result = await operation()
      if (!result.ok) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return
      }
      setOperationStatus('success')
      setOperationMessage(successMessage)
      appendConsole(successMessage, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
    }
  }

  const checkHealth = async () => {
    if (!ensureApiBaseUrlConfigured('Health')) {
      return
    }
    setOperationStatus('running')
    try {
      const result = await getHealth(apiConfig)
      setHealth(result.data)
      const message = result.ok
        ? `Health OK · NetBox ${result.data.checks.netbox_connected ? 'online' : 'offline'}`
        : `Health fallo · HTTP ${result.status}`
      setOperationStatus(result.ok ? 'success' : 'error')
      setOperationMessage(message)
      appendConsole(message, result.ok ? 'success' : 'error')
      if (result.ok) {
        void checkTools({ quiet: true })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
    }
  }

  const checkTools = async (
    options: { quiet?: boolean } = {},
  ): Promise<PipelineToolReportResponse | null> => {
    if (!ensureProtectedApiConfigured('Entorno del pipeline')) {
      return null
    }
    setOperationStatus('running')
    try {
      const result = await getPipelineTools(apiConfig)
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return null
      }
      setToolReport(result.data.data)
      const message = `${result.data.data.tools.filter((tool) => tool.installed).length}/${result.data.data.tools.length} herramientas detectadas`
      setOperationStatus('success')
      setOperationMessage(message)
      if (!options.quiet) {
        appendConsole(message, 'success')
      }
      return result.data.data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
      return null
    }
  }

  const bootstrap = () => {
    if (!ensureProtectedApiConfigured('Bootstrap NetBox')) {
      return
    }
    return runOperation(() => bootstrapNetBox(apiConfig), 'Bootstrap de NetBox completado')
  }

  const saveCurrentTopology =
    async (): Promise<TopologyProjectStateSaveResponse | null> => {
    if (!ensureProtectedApiConfigured('Guardar topologia')) {
      return null
    }
    setOperationStatus('running')
    try {
      const projectStatePayload = buildProjectStatePayload(
        cloneSnapshot({ settings, nodes, edges, drawings }),
        activeView,
        payload,
      )
      saveProjectDraft(projectStatePayload)
      const result = await saveTopologyState(
        apiConfig,
        projectStatePayload.project_name,
        projectStatePayload,
      )
      if (!result.ok || result.data.data === undefined) {
        const message = `Diseno guardado localmente; API pendiente: ${extractMessage(
          result.data,
          `HTTP ${result.status}`,
        )}`
        setOperationStatus('success')
        setOperationMessage(message)
        appendConsole(message, 'success')
        return null
      }

      const saveResult = result.data.data
      window.localStorage.setItem(PROJECT_NAME_STORAGE_KEY, saveResult.project_name)
      const message = buildSaveStatusMessage(saveResult)
      setOperationStatus('success')
      setOperationMessage(message)
      appendConsole(message, 'success')
      return saveResult
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Request failed'
      const message = `Diseno guardado localmente; API pendiente: ${detail}`
      setOperationStatus('success')
      setOperationMessage(message)
      appendConsole(message, 'success')
      return null
    }
  }

  const persistTopology = () => {
    return saveCurrentTopology()
  }

  const generateArtifacts = async () => {
    const savedTopology = await saveCurrentTopology()
    if (savedTopology === null) {
      return
    }
    const deployableTopologyName = getDeployableTopologyName(savedTopology)
    if (deployableTopologyName === null) {
      showActionRequired(
        'Diseno guardado, pero faltan datos validos para generar artefactos.',
      )
      return
    }
    setOperationStatus('running')
    try {
      const result = await generateSavedPipelineArtifacts(
        apiConfig,
        deployableTopologyName,
      )
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return
      }
      setPipelineArtifacts(result.data.data)
      setPipelineRun(null)
      setDataTab('artifacts')
      setShowDataBrowser(true)
      setOperationStatus('success')
      setOperationMessage(
        `${result.data.data.artifacts.length} artefactos generados desde el guardado`,
      )
      appendConsole(
        `${result.data.data.artifacts.length} artefactos generados desde el guardado`,
        'success',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
    }
  }

  const inspectRuntimeLab = async (
    topologyName = pipelineRun?.topology_name ?? payload.name,
  ): Promise<PipelineLabStatusResponse | null> => {
    if (!ensureProtectedApiConfigured('Inspeccionar lab')) {
      return null
    }
    setOperationStatus('running')
    try {
      const result = await getPipelineLabStatus(apiConfig, topologyName)
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return null
      }
      setLabStatus(result.data.data)
      const message = `${result.data.data.nodes.length} nodos del lab detectados`
      setOperationStatus('success')
      setOperationMessage(message)
      appendConsole(message, 'success')
      return result.data.data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
      return null
    }
  }

  const deployPipelineRun = async () => {
    const savedTopology = await saveCurrentTopology()
    if (savedTopology === null) {
      return
    }
    const deployableTopologyName = getDeployableTopologyName(savedTopology)
    if (deployableTopologyName === null) {
      showActionRequired(
        'Diseno guardado, pero faltan datos validos para desplegar el pipeline.',
      )
      return
    }
    const tools = await checkTools({ quiet: true })
    if (tools === null) {
      return
    }
    const missingTools = DEPLOY_TOOL_NAMES.filter(
      (toolName) => !tools.tools.some((tool) => tool.name === toolName && tool.installed),
    )
    if (missingTools.length > 0) {
      const message = `Faltan herramientas del pipeline: ${missingTools.join(', ')}`
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
      return
    }
    setOperationStatus('running')
    try {
      const result = await deploySavedPipeline(apiConfig, deployableTopologyName)
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return
      }
      setPipelineRun(result.data.data)
      setPipelineArtifacts({
        topology_name: result.data.data.topology_name,
        artifacts: result.data.data.artifacts,
      })
      setDataTab('run')
      setShowDataBrowser(true)
      setOperationStatus('success')
      setOperationMessage('Pipeline desplegado correctamente')
      appendConsole('Pipeline desplegado correctamente', 'success')
      await inspectRuntimeLab(result.data.data.topology_name)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
    }
  }

  const sendRuntimeCommand = async (nodeId: string, explicitCommand?: string) => {
    if (!ensureProtectedApiConfigured('Consola del runtime')) {
      return
    }
    const consoleState = deviceConsoles[nodeId]
    const command = (explicitCommand ?? consoleState?.draft ?? '').trim()
    if (!command) {
      return
    }

    appendDeviceConsole(nodeId, `$ ${command}`, 'running')
    updateDeviceConsoleDraft(nodeId, '')
    setConsoleBusyNodeId(nodeId)

    try {
      const result = await runPipelineConsoleCommand(
        apiConfig,
        labStatus?.topology_name ?? payload.name,
        nodeId,
        command,
      )
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        appendDeviceConsole(nodeId, message, 'error')
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return
      }

      const consoleResult = result.data.data
      appendRuntimeConsoleResult(nodeId, consoleResult)
      setOperationStatus(consoleResult.exit_code === 0 ? 'success' : 'error')
      setOperationMessage(
        consoleResult.exit_code === 0
          ? `Comando ejecutado en ${nodeId}`
          : `Comando con salida ${consoleResult.exit_code} en ${nodeId}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      appendDeviceConsole(nodeId, message, 'error')
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
    } finally {
      setConsoleBusyNodeId((current) => (current === nodeId ? null : current))
    }
  }

  const openSelectedNodeConsole = () => {
    if (selectedNodeId === null) {
      return
    }
    openNodeConsole(selectedNodeId)
  }

  const evaluateCompliance = async (
    options: { openDataBrowser?: boolean } = {},
  ): Promise<ComplianceReportResponse | null> => {
    if (!ensureProtectedApiConfigured('Evaluar compliance')) {
      return null
    }
    setOperationStatus('running')
    try {
      const result = await generateComplianceReport(apiConfig, payload)
      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        return null
      }

      setComplianceReport(result.data.data)
      if (options.openDataBrowser ?? true) {
        setDataTab('compliance')
        setShowDataBrowser(true)
      }
      setOperationStatus('success')
      setOperationMessage(
        `Compliance ${result.data.data.summary.overall_posture} · ${result.data.data.summary.failed_controls} fail · ${result.data.data.summary.warned_controls} warn`,
      )
      appendConsole(
        `Compliance ${result.data.data.summary.overall_posture} · cobertura ${result.data.data.summary.coverage_percent}%`,
        'success',
      )
      return result.data.data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
      return null
    }
  }

  const openComplianceAssistant = async () => {
    if (!ensureProtectedApiConfigured('Asistente de compliance')) {
      return
    }
    if (complianceReport === null) {
      const report = await evaluateCompliance({ openDataBrowser: false })
      if (report === null) {
        return
      }
    }
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          role: 'assistant',
          content:
            'Estoy listo para revisar zonas, conduits, niveles Purdue, activos críticos y hallazgos del informe.',
        },
      ])
    }
    setShowComplianceAssistant(true)
  }

  const sendComplianceQuestion = async () => {
    if (!ensureProtectedApiConfigured('Asistente de compliance')) {
      return
    }
    if (!chatDraft.trim()) {
      return
    }

    const userMessage: ComplianceChatMessage = {
      role: 'user',
      content: chatDraft.trim(),
    }
    const nextMessages = [...chatMessages, userMessage]
    setChatMessages(nextMessages)
    setChatDraft('')
    setChatBusy(true)
    try {
      const result = await chatWithComplianceAssistant(apiConfig, {
        topology: payload,
        messages: nextMessages,
      })

      if (!result.ok || result.data.data === undefined) {
        const message = extractMessage(result.data, `HTTP ${result.status}`)
        setOperationStatus('error')
        setOperationMessage(message)
        appendConsole(message, 'error')
        setChatMessages((current) => [
          ...current,
          { role: 'assistant', content: `No pude responder: ${message}` },
        ])
        return
      }

      const response: ComplianceChatResponse = result.data.data
      setComplianceReport(response.report)
      setChatMessages((current) => [
        ...current,
        { role: 'assistant', content: response.answer },
      ])
      setOperationStatus('success')
      setOperationMessage('Respuesta de compliance generada')
      appendConsole(
        `Asistente de compliance: ${response.cited_controls.join(', ') || 'sin control citado'}`,
        'success',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed'
      setOperationStatus('error')
      setOperationMessage(message)
      appendConsole(message, 'error')
      setChatMessages((current) => [
        ...current,
        { role: 'assistant', content: `No pude responder: ${message}` },
      ])
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <main className="app-shell" data-view={activeView}>
      <header className="chrome-header">
        <div className="menu-bar" role="menubar" aria-label="Barra de proyecto">
          <div className="menu-bar__menus">
            <span className="menu-bar__brand">GEMEROTIC</span>
            <button
              className="menu-bar__item"
              onClick={() => setShowProjectSettings(true)}
              type="button"
            >
              Proyecto
            </button>
            <button
              className="menu-bar__item"
              onClick={() => {
                setDataTab('topology')
                setShowDataBrowser(true)
              }}
              type="button"
            >
              Datos
            </button>
            <button className="menu-bar__item" onClick={() => void checkTools()} type="button">
              Entorno
            </button>
          </div>
          <div className="menu-bar__project">
            <strong>{settings.name}</strong>
            <span>
              {settings.siteName} / {settings.roomName}
            </span>
          </div>
        </div>

        <div className="top-toolbar" aria-label="Barra de herramientas principal">
          <div className="toolbar-group">
            <button
              aria-label="Deshacer"
              className="toolbar-button toolbar-button--icon"
              disabled={!canUndo}
              onClick={undo}
              title="Deshacer"
              type="button"
            >
              <Undo2 size={16} />
            </button>
            <button
              aria-label="Rehacer"
              className="toolbar-button toolbar-button--icon"
              disabled={!canRedo}
              onClick={redo}
              title="Rehacer"
              type="button"
            >
              <Redo2 size={16} />
            </button>
            <button
              aria-label="Duplicar seleccion"
              className="toolbar-button toolbar-button--icon"
              disabled={selectedNode === null && selectedDrawing === null}
              onClick={duplicateCurrentSelection}
              title="Duplicar seleccion"
              type="button"
            >
              <Copy size={16} />
            </button>
            <button
              aria-label="Eliminar seleccion"
              className="toolbar-button toolbar-button--icon"
              disabled={
                selectedNodeId === null &&
                selectedEdgeId === null &&
                selectedDrawingId === null
              }
              onClick={removeCurrentSelection}
              title="Eliminar seleccion"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="toolbar-group">
            <button
              aria-label="Add Link"
              className="toolbar-button toolbar-button--icon"
              data-active={interactionMode === 'link'}
              onClick={startLinkMode}
              title="Add Link"
              type="button"
            >
              <Cable size={16} />
            </button>
            <button
              aria-label="Mostrar etiquetas de interfaz"
              className="toolbar-button toolbar-button--icon"
              data-active={showInterfaceLabels}
              onClick={() => setShowInterfaceLabels((current) => !current)}
              title="Mostrar u ocultar etiquetas"
              type="button"
            >
              <Link2 size={16} />
            </button>
            <button
              aria-label="Añadir zona"
              className="toolbar-button toolbar-button--icon"
              onClick={() => addDrawing('zone')}
              title="Añadir zona"
              type="button"
            >
              <ShieldQuestion size={16} />
            </button>
            <button
              aria-label="Añadir rectangulo"
              className="toolbar-button toolbar-button--icon"
              onClick={() => addDrawing('rectangle')}
              title="Añadir rectangulo"
              type="button"
            >
              <Square size={16} />
            </button>
            <button
              aria-label="Añadir circulo"
              className="toolbar-button toolbar-button--icon"
              onClick={() => addDrawing('ellipse')}
              title="Añadir circulo"
              type="button"
            >
              <Circle size={16} />
            </button>
            <button
              aria-label="Añadir texto"
              className="toolbar-button toolbar-button--icon"
              onClick={() => addDrawing('text')}
              title="Añadir texto"
              type="button"
            >
              <Type size={16} />
            </button>
          </div>

          <div className="toolbar-group toolbar-group--view">
            {viewOptions.map((view) => (
              <button
                key={view.id}
                className="toolbar-button toolbar-button--segment"
                data-active={activeView === view.id}
                onClick={() => setActiveView(view.id)}
                type="button"
              >
                {view.label}
              </button>
            ))}
          </div>

          <div className="toolbar-group">
            <button
              aria-label="Comprobar health"
              className="toolbar-button toolbar-button--icon"
              onClick={checkHealth}
              title="Health"
              type="button"
            >
              <Activity size={16} />
            </button>
            <button
              aria-label="Bootstrap NetBox"
              className="toolbar-button toolbar-button--icon"
              onClick={bootstrap}
              title="Bootstrap NetBox"
              type="button"
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              aria-label="Generar artefactos"
              className="toolbar-button toolbar-button--icon"
              onClick={generateArtifacts}
              title="Generar artefactos"
              type="button"
            >
              <GitBranch size={16} />
            </button>
            <button
              aria-label="Desplegar pipeline"
              className="toolbar-button toolbar-button--icon"
              onClick={deployPipelineRun}
              title="Desplegar pipeline"
              type="button"
            >
              <Network size={16} />
            </button>
            <button
              aria-label="Inspeccionar lab"
              className="toolbar-button toolbar-button--icon"
              onClick={() => void inspectRuntimeLab()}
              title="Inspeccionar lab"
              type="button"
            >
              <TerminalSquare size={16} />
            </button>
            <button
              aria-label="Evaluar compliance"
              className="toolbar-button toolbar-button--icon"
              onClick={() => void evaluateCompliance()}
              title="Evaluar compliance"
              type="button"
            >
              <ShieldCheck size={16} />
            </button>
            <button
              aria-label="Abrir asistente de compliance"
              className="toolbar-button toolbar-button--icon"
              onClick={() => void openComplianceAssistant()}
              title="Asistente de compliance"
              type="button"
            >
              <MessageSquare size={16} />
            </button>
            <button
              aria-label="Persistir topologia"
              className="toolbar-button toolbar-button--icon toolbar-button--primary"
              onClick={persistTopology}
              title="Persistir topologia"
              type="button"
            >
              <Save size={16} />
            </button>
          </div>

          <div className="toolbar-group">
            <button
              aria-label="Abrir consola del nodo"
              className="toolbar-button toolbar-button--icon"
              disabled={selectedNode === null}
              onClick={openSelectedNodeConsole}
              title="Abrir consola del nodo"
              type="button"
            >
              <TerminalSquare size={16} />
            </button>
            <button
              aria-label="Configurar proyecto"
              className="toolbar-button toolbar-button--icon"
              onClick={() => setShowProjectSettings(true)}
              title="Configurar proyecto"
              type="button"
            >
              <Settings size={16} />
            </button>
            <button
              aria-label="Abrir datos"
              className="toolbar-button toolbar-button--icon"
              onClick={() => {
                setDataTab('topology')
                setShowDataBrowser(true)
              }}
              title="Abrir datos"
              type="button"
            >
              <Database size={16} />
            </button>
          </div>
        </div>
        <div className="workflow-strip" role="status" aria-live="polite">
          <div className="workflow-strip__chips">
            <WorkflowChip
              label="API"
              state={
                hasApiBaseUrl
                  ? operationStatus === 'running'
                    ? 'running'
                    : 'ready'
                  : 'missing'
              }
              value={apiBaseUrl.replace(/^https?:\/\//, '') || 'sin url'}
            />
            <WorkflowChip
              label="NetBox"
              state={
                health === null
                  ? 'unchecked'
                  : health.checks.netbox_connected
                    ? 'online'
                    : 'error'
              }
              value={health?.checks.netbox_connected ? 'online' : 'sin verificar'}
            />
            <WorkflowChip
              label="Pipeline"
              state={
                toolReport === null
                  ? 'unchecked'
                  : deployToolsInstalled
                    ? 'ready'
                    : 'partial'
              }
              value={
                toolReport === null
                  ? 'sin verificar'
                  : `${toolReport.tools.filter((tool) => tool.installed).length}/${
                      toolReport.tools.length
                    }`
              }
            />
            <WorkflowChip
              label="Lab"
              state={labStatus === null ? 'unchecked' : 'online'}
              value={labStatus === null ? 'sin runtime' : `${labStatus.nodes.length} nodos`}
            />
            <WorkflowChip
              label="Compliance"
              state={
                complianceReport === null
                  ? 'unchecked'
                  : complianceReport.summary.failed_controls > 0
                    ? 'error'
                    : complianceReport.summary.warned_controls > 0
                      ? 'partial'
                      : 'ready'
              }
              value={complianceReport?.summary.overall_posture ?? 'sin informe'}
            />
          </div>
          <p className="workflow-strip__message" data-tone={operationStatus}>
            {operationMessage}
          </p>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="devices-pane" aria-label="Devices toolbar">
          <div className="devices-categories">
            {assetGroups.map((group) => (
              <button
                key={group.id}
                className="devices-category"
                data-active={selectedDeviceGroup === group.id}
                onClick={() => setSelectedDeviceGroup(group.id)}
                title={group.label}
                type="button"
              >
                <CategoryGlyph groupId={group.id} />
              </button>
            ))}
            <button
              className="devices-category"
              data-active={interactionMode === 'link'}
              onClick={startLinkMode}
              title="Add Link"
              type="button"
            >
              <Cable size={18} />
            </button>
          </div>

          <div className="devices-list">
            <div className="devices-pane__header">
              <strong>
                {assetGroups.find((group) => group.id === selectedDeviceGroup)?.label ??
                  'All devices'}
              </strong>
              <small>Arrastra o haz clic para insertar</small>
            </div>

            <div className="site-card">
              <div>
                <span>Proyecto</span>
                <strong>{settings.name}</strong>
              </div>
              <div>
                <span>Rack activo</span>
                <strong>{settings.rackName}</strong>
              </div>
              <div>
                <span>Vista</span>
                <strong>{viewOptions.find((view) => view.id === activeView)?.label}</strong>
              </div>
            </div>

            <div className="device-catalog">
              {visibleAssets.map((asset) => (
                <button
                  className="device-catalog__item"
                  draggable
                  key={asset.assetType}
                  onDragStart={handleCatalogDragStart(asset.assetType)}
                  onClick={() => addAsset(asset.assetType)}
                  type="button"
                >
                  <EquipmentGlyph assetType={asset.assetType} size={34} />
                  <div>
                    <strong>{asset.label}</strong>
                    <small>
                      L{asset.purdueLevel} · {asset.portCount} puertos
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="workspace-pane" aria-label="GNS3 style workspace">
          <div
            className="workspace-canvas"
            data-view={activeView}
            data-link-mode={interactionMode === 'link'}
            onDragOver={handleWorkspaceDragOver}
            onDrop={handleWorkspaceDrop}
          >
            <ReactFlow
              defaultEdgeOptions={defaultEdgeOptions}
              edges={displayedEdges}
              edgesReconnectable={false}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              nodes={displayedCanvasNodes}
              nodesConnectable={false}
              nodeTypes={nodeTypes}
              onEdgesChange={handleEdgesChange}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id)
                setSelectedNodeId(null)
                setSelectedDrawingId(null)
                setEditorNodeId(null)
              }}
              onEdgeDoubleClick={(_, edge) => openCableEditor(edge as BuilderEdge)}
              onInit={setReactFlowInstance}
              onNodeClick={handleCanvasNodeClick}
              onNodeDoubleClick={handleCanvasNodeDoubleClick}
              onNodesChange={handleCanvasNodesChange}
              onPaneClick={() => {
                setSelectedEdgeId(null)
                setSelectedDrawingId(null)
                if (interactionMode !== 'link') {
                  setSelectedNodeId(null)
                }
              }}
            >
              <Background color="#b9c0c6" gap={26} size={1} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="workspace-statusbar" aria-live="polite">
            <span>
              <Factory size={13} />
              {settings.siteName}
            </span>
            <span>
              <Layers3 size={13} />
              {viewOptions.find((view) => view.id === activeView)?.label}
            </span>
            <span>
              <Cable size={13} />
              {interactionMode === 'link' ? 'Add Link' : 'Seleccion'}
            </span>
            <strong>
              {pendingLinkSource
                ? `Origen seleccionado: ${pendingLinkSourceNode?.data.label ?? pendingLinkSource.nodeId}:${pendingLinkSourceNode ? getPortName(pendingLinkSourceNode, pendingLinkSource.portIndex) : pendingLinkSource.portIndex}`
                : selectedDrawing
                  ? `Dibujo: ${selectedDrawing.data.label}`
                  : selectedEdge
                    ? `Cable: ${selectedEdge.data?.label ?? selectedEdge.id}`
                    : selectedNode
                      ? `Equipo: ${selectedNode.data.label}`
                      : `${topologySummary.assets} equipos · ${topologySummary.links} enlaces · ${topologySummary.interfaces} interfaces · ${operationMessage}`}
            </strong>
          </div>
        </section>

        <aside className="summary-pane" aria-label="Topology and server summary">
          <section className="dock-panel">
            <div className="dock-panel__header">
              <strong>Topology Summary</strong>
              <span>{topologySummary.assets} nodes</span>
            </div>
            <div className="dock-panel__body">
              <div className="summary-metrics">
                <Metric label="Devices" value={String(topologySummary.assets)} />
                <Metric label="Links" value={String(topologySummary.links)} />
                <Metric label="Zones" value={String(topologySummary.zones)} />
                <Metric label="View" value={activeView} />
              </div>

              <div className="summary-list">
                <div className="summary-list__header">Nodes</div>
                {nodes.map((node) => (
                  <button
                    key={node.id}
                    className="summary-list__item"
                    onClick={() => {
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                      setSelectedDrawingId(null)
                    }}
                    onDoubleClick={() => {
                      setEditorNodeId(node.id)
                      setEditorTab(getEditorTabForView(activeView))
                    }}
                    type="button"
                  >
                    <StatusDot tone={node.data.criticality === 'critical' ? 'error' : 'success'} />
                    <EquipmentGlyph assetType={node.data.assetType} size={26} />
                    <div>
                      <strong>{node.data.label}</strong>
                      <small>
                        {node.data.assetType.replace('_', ' ')} · VLAN {node.data.vlanId}
                      </small>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>

              <div className="summary-list">
                <div className="summary-list__header">Links</div>
                {edges.map((edge) => (
                  <button
                    key={edge.id}
                    className="summary-list__item"
                    onClick={() => {
                      setSelectedEdgeId(edge.id)
                      setSelectedNodeId(null)
                      setSelectedDrawingId(null)
                    }}
                    onDoubleClick={() => openCableEditor(edge)}
                    type="button"
                  >
                    <StatusDot tone="idle" />
                    <Cable size={16} />
                    <div>
                      <strong>{edge.data?.label ?? edge.id}</strong>
                      <small>{describeEdgePorts(edge, nodeById)}</small>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="dock-panel dock-panel--servers">
            <div className="dock-panel__header">
              <strong>Servers Summary</strong>
              <span>{deployToolsInstalled ? 'ready' : 'partial'}</span>
            </div>
            <div className="dock-panel__body">
              <div className="server-summary__list">
                <div className="server-summary__row">
                  <span>API</span>
                  <strong>{apiBaseUrl.replace(/^https?:\/\//, '')}</strong>
                </div>
                <div className="server-summary__row">
                  <span>NetBox</span>
                  <strong>{health?.checks.netbox_connected ? 'online' : 'unchecked'}</strong>
                </div>
                <div className="server-summary__row">
                  <span>Rate limit</span>
                  <strong>
                    {health?.checks.rate_limit_backend_connected ? 'online' : 'unchecked'}
                  </strong>
                </div>
                <div className="server-summary__row">
                  <span>Pipeline</span>
                  <strong>
                    {toolReport === null
                      ? 'unchecked'
                      : deployToolsInstalled
                        ? 'ready'
                      : 'partial'}
                  </strong>
                </div>
                <div className="server-summary__row">
                  <span>Lab runtime</span>
                  <strong>{labStatus ? `${labStatus.nodes.length} nodes` : 'unchecked'}</strong>
                </div>
                <div className="server-summary__row">
                  <span>Compliance</span>
                  <strong>{complianceReport?.summary.overall_posture ?? 'unchecked'}</strong>
                </div>
              </div>

              <div className="tool-grid">
                {(toolReport?.tools ?? []).map((tool) => (
                  <div className="tool-chip" data-installed={tool.installed} key={tool.name}>
                    <strong>{tool.name}</strong>
                    <span>{tool.installed ? 'OK' : 'Missing'}</span>
                    <small>{tool.path ?? tool.error ?? 'Not detected'}</small>
                  </div>
                ))}
                {toolReport === null ? (
                  <div className="tool-chip" data-installed="pending">
                    <strong>Environment</strong>
                    <span>Unchecked</span>
                    <small>Pulsa Entorno para inspeccionar el host</small>
                  </div>
                ) : null}
              </div>

              <div className="summary-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowProjectSettings(true)}
                  type="button"
                >
                  <Settings size={16} />
                  Proyecto
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setDataTab('topology')
                    setShowDataBrowser(true)
                  }}
                  type="button"
                >
                  <Database size={16} />
                  Datos
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void evaluateCompliance()}
                  type="button"
                >
                  <ShieldCheck size={16} />
                  Compliance
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void openComplianceAssistant()}
                  type="button"
                >
                  <MessageSquare size={16} />
                  Asistente
                </button>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <section className="console-pane" aria-label="GNS3 style console">
        <div className="console-pane__header">
          <div className="console-tabs" role="tablist" aria-label="Pestañas de consola">
            <button
              aria-selected={activeConsoleTabId === 'app'}
              className="console-tab"
              onClick={() => setActiveConsoleTabId('app')}
              role="tab"
              type="button"
            >
              <TerminalSquare size={14} />
              Workspace
            </button>
            {Object.values(deviceConsoles).map((consoleTab) => (
              <button
                key={consoleTab.nodeId}
                aria-selected={activeConsoleTabId === consoleTab.nodeId}
                className="console-tab"
                onClick={() => setActiveConsoleTabId(consoleTab.nodeId)}
                role="tab"
                type="button"
              >
                <EquipmentGlyph assetType={nodeById.get(consoleTab.nodeId)?.data.assetType ?? 'host'} size={18} />
                {consoleTab.label}
              </button>
            ))}
          </div>
          <span>
            {activeConsoleTabId === 'app'
              ? operationStatus
              : runtimeNodesById.get(activeConsoleTabId)?.state || 'runtime'}
          </span>
        </div>
        <div className="console-pane__body">
          {activeConsoleTabId === 'app' ? (
            consoleEntries.map((entry) => (
              <div className="console-line" data-tone={entry.tone} key={entry.id}>
                <span>{entry.tone.toUpperCase()}</span>
                <p>{entry.text}</p>
              </div>
            ))
          ) : activeDeviceConsole ? (
            <NodeConsolePane
              activeNode={nodeById.get(activeDeviceConsole.nodeId) ?? null}
              busy={consoleBusyNodeId === activeDeviceConsole.nodeId}
              consoleState={activeDeviceConsole}
              runtimeNode={runtimeNodesById.get(activeDeviceConsole.nodeId) ?? null}
              onDraftChange={updateDeviceConsoleDraft}
              onRunCommand={(command) => void sendRuntimeCommand(activeDeviceConsole.nodeId, command)}
            />
          ) : null}
        </div>
      </section>

      {editorNode ? (
        <NodeEditorModal
          editorNode={editorNode}
          editorTab={editorTab}
          onClose={() => setEditorNodeId(null)}
          onOpenConsole={() => openNodeConsole(editorNode.id)}
          onDuplicate={duplicateSelectedNode}
          onDelete={removeSelectedNode}
          onUpdatePort={updateEditorPort}
          onTabChange={setEditorTab}
          onUpdateNode={updateEditorNode}
          onChangeAssetType={changeSelectedAssetType}
        />
      ) : null}

      {editorDrawing ? (
        <DrawingEditorModal
          drawing={editorDrawing}
          onChange={(patch) => updateDrawing(editorDrawing.id, patch)}
          onClose={() => setDrawingEditorId(null)}
          onDelete={removeSelectedDrawing}
        />
      ) : null}

      {portPicker ? (
        <PortPickerModal
          edges={edges}
          node={nodeById.get(portPicker.nodeId) ?? null}
          onClose={() => setPortPicker(null)}
          onSelect={(portIndex) => {
            const node = nodeById.get(portPicker.nodeId)
            if (!node) {
              return
            }
            applyPortSelection(node, portIndex, portPicker.phase, portPicker.sourceEndpoint)
          }}
          phase={portPicker.phase}
          sourceEndpoint={portPicker.sourceEndpoint}
        />
      ) : null}

      {linkDraft ? (
        <CableEditorModal
          draft={linkDraft}
          edges={edges}
          nodeById={nodeById}
          onCancel={() => setLinkDraft(null)}
          onChange={setLinkDraft}
          onDelete={linkDraft.id ? removeSelectedEdge : undefined}
          onSave={saveCableDraft}
        />
      ) : null}

      {showProjectSettings ? (
        <ProjectSettingsModal
          apiBaseUrl={apiBaseUrl}
          apiKey={apiKey}
          onApiBaseUrlChange={setApiBaseUrl}
          onApiKeyChange={setApiKey}
          onClose={() => setShowProjectSettings(false)}
          onUpdateSettings={updateSettingsWithHistory}
          settings={settings}
        />
      ) : null}

      {showDataBrowser ? (
        <DataBrowserModal
          artifactText={artifactText}
          complianceReport={complianceReport}
          complianceText={complianceText}
          dataTab={dataTab}
          onClose={() => setShowDataBrowser(false)}
          onDataTabChange={setDataTab}
          payload={payload}
          payloadText={payloadText}
          pipelineArtifacts={pipelineArtifacts}
          pipelineRun={pipelineRun}
          pipelineRunText={pipelineRunText}
        />
      ) : null}

      {showComplianceAssistant ? (
        <ComplianceAssistantModal
          busy={chatBusy}
          chatDraft={chatDraft}
          chatMessages={chatMessages}
          complianceReport={complianceReport}
          onChatDraftChange={setChatDraft}
          onClose={() => setShowComplianceAssistant(false)}
          onSend={sendComplianceQuestion}
        />
      ) : null}
    </main>
  )
}

function getDefaultApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:8000'
  }

  const hostname = window.location.hostname
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000'
  }

  return `${window.location.protocol}//${hostname}:8000`
}

function CategoryGlyph({ groupId }: { groupId: string }) {
  if (groupId === 'network') {
    return <Network size={18} />
  }
  if (groupId === 'ot') {
    return <Factory size={18} />
  }
  if (groupId === 'compute') {
    return <Box size={18} />
  }
  if (groupId === 'security') {
    return <Settings size={18} />
  }
  return <Layers3 size={18} />
}

function StatusDot({ tone }: { tone: OperationStatus }) {
  return <span className="status-dot" data-tone={tone} aria-hidden="true" />
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function WorkflowChip({
  label,
  state,
  value,
}: {
  label: string
  state: WorkflowState
  value: string
}) {
  return (
    <div className="workflow-chip" data-state={state}>
      <span>{label}</span>
      <strong>{value}</strong>
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

function ProjectSettingsModal({
  apiBaseUrl,
  apiKey,
  onApiBaseUrlChange,
  onApiKeyChange,
  onClose,
  onUpdateSettings,
  settings,
}: {
  apiBaseUrl: string
  apiKey: string
  onApiBaseUrlChange: (value: string) => void
  onApiKeyChange: (value: string) => void
  onClose: () => void
  onUpdateSettings: (patch: Partial<TopologySettings>) => void
  settings: TopologySettings
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Project settings">
      <div className="modal-shell modal-shell--project">
        <div className="modal-header">
          <div className="modal-header__brand">
            <Settings size={18} />
            <div>
              <strong>Proyecto y conectividad</strong>
              <span>Configuracion del workspace y del backend</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section__header">
              <strong>Workspace</strong>
              <span>Identidad del laboratorio</span>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Nombre</span>
                <input
                  value={settings.name}
                  onChange={(event) => onUpdateSettings({ name: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Rack</span>
                <input
                  value={settings.rackName}
                  onChange={(event) => onUpdateSettings({ rackName: event.target.value })}
                />
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Sitio</span>
                <input
                  value={settings.siteName}
                  onChange={(event) => onUpdateSettings({ siteName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Sala</span>
                <input
                  value={settings.roomName}
                  onChange={(event) => onUpdateSettings({ roomName: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>Descripcion</span>
              <input
                value={settings.description}
                onChange={(event) => onUpdateSettings({ description: event.target.value })}
              />
            </label>
          </div>

          <div className="modal-section">
            <div className="modal-section__header">
              <strong>API</strong>
              <span>FastAPI, NetBox y pipeline</span>
            </div>
            <label className="field">
              <span>Base URL</span>
              <input value={apiBaseUrl} onChange={(event) => onApiBaseUrlChange(event.target.value)} />
            </label>
            <label className="field">
              <span>X-API-Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function DataBrowserModal({
  artifactText,
  complianceReport,
  complianceText,
  dataTab,
  onClose,
  onDataTabChange,
  payload,
  payloadText,
  pipelineArtifacts,
  pipelineRun,
  pipelineRunText,
}: {
  artifactText: string
  complianceReport: ComplianceReportResponse | null
  complianceText: string
  dataTab: DataTab
  onClose: () => void
  onDataTabChange: (tab: DataTab) => void
  payload: ReturnType<typeof buildTopologyPayload>
  payloadText: string
  pipelineArtifacts: PipelineArtifactsResponse | null
  pipelineRun: PipelineRunResponse | null
  pipelineRunText: string
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Data browser">
      <div className="modal-shell modal-shell--data">
        <div className="modal-header">
          <div className="modal-header__brand">
            <Database size={18} />
            <div>
              <strong>Navegador de datos</strong>
              <span>Payload y salidas del pipeline</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Data browser tabs">
          <button
            className="summary-tab"
            aria-selected={dataTab === 'topology'}
            onClick={() => onDataTabChange('topology')}
            role="tab"
            type="button"
          >
            <span>TopologyCreate</span>
          </button>
          <button
            className="summary-tab"
            aria-selected={dataTab === 'artifacts'}
            onClick={() => onDataTabChange('artifacts')}
            role="tab"
            type="button"
          >
            <span>Artefactos</span>
          </button>
          <button
            className="summary-tab"
            aria-selected={dataTab === 'run'}
            onClick={() => onDataTabChange('run')}
            role="tab"
            type="button"
          >
            <span>Ejecucion</span>
          </button>
          <button
            className="summary-tab"
            aria-selected={dataTab === 'compliance'}
            onClick={() => onDataTabChange('compliance')}
            role="tab"
            type="button"
          >
            <span>Compliance</span>
          </button>
        </div>

        <div className="modal-body">
          {dataTab === 'topology' ? (
            <DataDrawer
              label="TopologyCreate"
              meta={`${payload.devices.length} devices · ${payload.cables.length} cables`}
              value={payloadText}
            />
          ) : null}

          {dataTab === 'artifacts' ? (
            pipelineArtifacts ? (
              <DataDrawer
                label="Artifacts"
                meta={`${pipelineArtifacts.artifacts.length} files`}
                value={artifactText}
              />
            ) : (
              <div className="empty-state">
                <strong>Sin artefactos</strong>
                <span>Genera artefactos desde la toolbar para revisarlos aqui.</span>
              </div>
            )
          ) : null}

          {dataTab === 'run' ? (
            pipelineRun ? (
              <DataDrawer
                label="Run"
                meta={`${pipelineRun.commands.length} commands`}
                value={pipelineRunText}
              />
            ) : (
              <div className="empty-state">
                <strong>Sin ejecucion</strong>
                <span>El despliegue controlado aparecera aqui cuando el entorno este listo.</span>
              </div>
            )
          ) : null}

          {dataTab === 'compliance' ? (
            complianceReport ? (
              <DataDrawer
                label="Compliance"
                meta={`${complianceReport.summary.failed_controls} fail · ${complianceReport.summary.warned_controls} warn · ${complianceReport.summary.coverage_percent}% coverage`}
                value={complianceText}
              />
            ) : (
              <div className="empty-state">
                <strong>Sin informe</strong>
                <span>Evalua compliance desde la toolbar para revisar findings y cobertura.</span>
              </div>
            )
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function ComplianceAssistantModal({
  busy,
  chatDraft,
  chatMessages,
  complianceReport,
  onChatDraftChange,
  onClose,
  onSend,
}: {
  busy: boolean
  chatDraft: string
  chatMessages: ComplianceChatMessage[]
  complianceReport: ComplianceReportResponse | null
  onChatDraftChange: (value: string) => void
  onClose: () => void
  onSend: () => void
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Compliance assistant"
    >
      <div className="modal-shell modal-shell--assistant">
        <div className="modal-header">
          <div className="modal-header__brand">
            <ShieldQuestion size={18} />
            <div>
              <strong>Asistente de cumplimiento OT</strong>
              <span>Baseline NIS2 + IEC 62443 + ISO/IEC 27001</span>
            </div>
          </div>
          <button
            aria-label="Cerrar selector de puerto"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section__header">
              <strong>Resumen</strong>
              <span>Postura y cobertura actual</span>
            </div>
            {complianceReport ? (
              <div className="compliance-summary">
                <div className="compliance-pill" data-tone={complianceReport.summary.overall_posture}>
                  {complianceReport.summary.overall_posture}
                </div>
                <div className="compliance-stats">
                  <span>{complianceReport.summary.failed_controls} fail</span>
                  <span>{complianceReport.summary.warned_controls} warn</span>
                  <span>{complianceReport.summary.coverage_percent}% coverage</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <strong>Sin informe cargado</strong>
                <span>Abre este asistente tras evaluar compliance o deja que lo haga por ti.</span>
              </div>
            )}
          </div>

          {complianceReport ? (
            <div className="modal-section">
              <div className="modal-section__header">
                <strong>Findings principales</strong>
                <span>Controles más relevantes para la conversación</span>
              </div>
              <div className="compliance-findings">
                {complianceReport.findings.slice(0, 5).map((finding) => (
                  <div
                    className="compliance-finding"
                    data-status={finding.status}
                    key={finding.control_id}
                  >
                    <div className="compliance-finding__header">
                      <strong>{finding.control_id}</strong>
                      <span>{finding.status}</span>
                    </div>
                    <p>{finding.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="modal-section">
            <div className="modal-section__header">
              <strong>Chat</strong>
              <span>Pregunta por zonas, conduits, activos o remediaciones</span>
            </div>
            <div className="compliance-chat">
              {chatMessages.map((message, index) => (
                <div
                  className="compliance-chat__message"
                  data-role={message.role}
                  key={`${message.role}-${index}`}
                >
                  <strong>{message.role === 'assistant' ? 'Advisor' : 'You'}</strong>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
            <div className="compliance-chat__composer">
              <textarea
                onChange={(event) => onChatDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    onSend()
                  }
                }}
                placeholder="Ejemplo: Como debo conectar SCADA y PLC para que la segmentacion sea correcta?"
                rows={3}
                value={chatDraft}
              />
              <button className="secondary-button" disabled={busy} onClick={onSend} type="button">
                <SendHorizonal size={16} />
                {busy ? 'Pensando' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function NodeConsolePane({
  activeNode,
  busy,
  consoleState,
  runtimeNode,
  onDraftChange,
  onRunCommand,
}: {
  activeNode: BuilderNode | null
  busy: boolean
  consoleState: DeviceConsole
  runtimeNode: PipelineLabStatusResponse['nodes'][number] | null
  onDraftChange: (nodeId: string, value: string) => void
  onRunCommand: (command?: string) => void
}) {
  const quickCommands = ['hostname', 'ip link show', 'ip addr show', 'ip route show']

  return (
    <div className="node-console">
      <div className="node-console__meta">
        <span>{activeNode?.data.assetType.replace('_', ' ') ?? consoleState.nodeId}</span>
        <strong>
          {runtimeNode
            ? `${runtimeNode.container_name} · ${runtimeNode.state || runtimeNode.status || 'runtime'}`
            : 'Lab no desplegado o nodo no descubierto'}
        </strong>
      </div>

      <div className="node-console__quick-actions">
        {quickCommands.map((command) => (
          <button
            className="console-quick-button"
            disabled={runtimeNode === null || busy}
            key={command}
            onClick={() => onRunCommand(command)}
            type="button"
          >
            {command}
          </button>
        ))}
      </div>

      {runtimeNode === null ? (
        <div className="empty-state empty-state--compact">
          <strong>Runtime pendiente</strong>
          <span>
            Despliega el lab y luego usa Inspeccionar lab. En Step 10 la consola actúa
            sobre el runtime Linux actual de Containerlab, no sobre una CLI vendor.
          </span>
        </div>
      ) : null}

      <div className="node-console__stream">
        {consoleState.entries.map((entry) => (
          <div className="console-line" data-tone={entry.tone} key={entry.id}>
            <span>{entry.tone.toUpperCase()}</span>
            <p>{entry.text}</p>
          </div>
        ))}
      </div>

      <div className="node-console__composer">
        <input
          disabled={runtimeNode === null || busy}
          onChange={(event) => onDraftChange(consoleState.nodeId, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onRunCommand()
            }
          }}
          placeholder="ip link set dev eth1 down"
          value={consoleState.draft}
        />
        <button
          className="secondary-button"
          disabled={runtimeNode === null || busy || !consoleState.draft.trim()}
          onClick={() => onRunCommand()}
          type="button"
        >
          <SendHorizonal size={16} />
          {busy ? 'Ejecutando' : 'Run'}
        </button>
      </div>
    </div>
  )
}

function NodeEditorModal({
  editorNode,
  editorTab,
  onClose,
  onOpenConsole,
  onDuplicate,
  onDelete,
  onUpdatePort,
  onTabChange,
  onUpdateNode,
  onChangeAssetType,
}: {
  editorNode: BuilderNode
  editorTab: EditorTab
  onClose: () => void
  onOpenConsole: () => void
  onDuplicate: () => void
  onDelete: () => void
  onUpdatePort: (portIndex: number, patch: Partial<BuilderPortConfig>) => void
  onTabChange: (tab: EditorTab) => void
  onUpdateNode: (patch: Partial<BuilderNode['data']>) => void
  onChangeAssetType: (assetType: AssetType) => void
}) {
  const portRows = Array.from(
    { length: Math.max(editorNode.data.portCount, editorNode.data.portConfigs.length) },
    (_, index) => ({
      index,
      name: getPortName(editorNode, index),
      config: editorNode.data.portConfigs[index] ?? {
        enabled: true,
        mgmtOnly: false,
      },
    }),
  )

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Node editor">
      <div className="modal-shell">
        <div className="modal-header">
          <div className="modal-header__brand">
            <EquipmentGlyph assetType={editorNode.data.assetType} size={40} />
            <div>
              <strong>{editorNode.data.label}</strong>
              <span>{editorNode.data.assetType.replace('_', ' ')}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-tabs" role="tablist" aria-label="Node editor tabs">
          {[
            { id: 'equipment', label: 'Equipo' },
            { id: 'ports', label: 'Puertos' },
            { id: 'logical', label: 'Red' },
            { id: 'security', label: 'Seguridad' },
          ].map((tab) => (
            <button
              key={tab.id}
              className="summary-tab"
              aria-selected={editorTab === tab.id}
              onClick={() => onTabChange(tab.id as EditorTab)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="modal-body">
          {editorTab === 'equipment' ? (
            <>
              <label className="field">
                <span>Etiqueta</span>
                <input
                  value={editorNode.data.label}
                  onChange={(event) => onUpdateNode({ label: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Tipo de activo</span>
                <select
                  value={editorNode.data.assetType}
                  onChange={(event) => onChangeAssetType(event.target.value as AssetType)}
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
                    onChange={(event) => onUpdateNode({ manufacturer: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Modelo</span>
                  <input
                    value={editorNode.data.model ?? ''}
                    onChange={(event) => onUpdateNode({ model: event.target.value })}
                  />
                </label>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Firmware</span>
                  <input
                    value={editorNode.data.firmwareVersion ?? ''}
                    onChange={(event) => onUpdateNode({ firmwareVersion: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Serie</span>
                  <input
                    value={editorNode.data.serialNumber ?? ''}
                    onChange={(event) => onUpdateNode({ serialNumber: event.target.value })}
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
                    value={editorNode.data.rackPosition ?? ''}
                    onChange={(event) =>
                      onUpdateNode({
                        rackPosition: parseOptionalBoundedNumber(event.target.value, 1, 60),
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
                      onUpdateNode({
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
                  onChange={(event) => onUpdateNode({ portPrefix: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {editorTab === 'ports' ? (
            <div className="port-config-list">
              {portRows.map((port) => (
                <section className="port-config-card" key={`${editorNode.id}-${port.index}`}>
                  <div className="port-config-card__header">
                    <strong>{port.name}</strong>
                    <span>Puerto {port.index + 1}</span>
                  </div>
                  <div className="toggle-row">
                    <label>
                      <input
                        checked={port.config.enabled}
                        onChange={(event) =>
                          onUpdatePort(port.index, { enabled: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Enlace activo
                    </label>
                    <label>
                      <input
                        checked={port.config.mgmtOnly}
                        onChange={(event) =>
                          onUpdatePort(port.index, { mgmtOnly: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Solo gestion
                    </label>
                  </div>
                  <div className="field-grid">
                    <label className="field">
                      <span>IPv4</span>
                      <input
                        placeholder="192.168.10.10/24"
                        value={port.config.ipv4Address ?? ''}
                        onChange={(event) =>
                          onUpdatePort(port.index, { ipv4Address: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>IPv6</span>
                      <input
                        placeholder="2001:db8::10/64"
                        value={port.config.ipv6Address ?? ''}
                        onChange={(event) =>
                          onUpdatePort(port.index, { ipv6Address: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="field-grid">
                    <label className="field">
                      <span>MAC</span>
                      <input
                        placeholder="00:1A:2B:3C:4D:5E"
                        value={port.config.macAddress ?? ''}
                        onChange={(event) =>
                          onUpdatePort(port.index, { macAddress: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Descripcion</span>
                      <input
                        placeholder={`${editorNode.data.label} ${port.name}`}
                        value={port.config.description ?? ''}
                        onChange={(event) =>
                          onUpdatePort(port.index, { description: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {editorTab === 'logical' ? (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>VLAN ID</span>
                  <input
                    min="1"
                    max="4094"
                    type="number"
                    value={editorNode.data.vlanId}
                    onChange={(event) =>
                      onUpdateNode({
                        vlanId: parseBoundedNumber(event.target.value, 1, 1, 4094),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Nombre VLAN</span>
                  <input
                    value={editorNode.data.vlanName}
                    onChange={(event) => onUpdateNode({ vlanName: event.target.value })}
                  />
                </label>
              </div>
              <div className="empty-state empty-state--compact">
                <strong>Configuracion por puerto</strong>
                <span>
                  El direccionamiento, el estado administrativo y el modo de gestion se
                  ajustan en la pestaña Puertos para reflejar el runtime del lab.
                </span>
              </div>
            </>
          ) : null}

          {editorTab === 'security' ? (
            <>
              <label className="field">
                <span>Zona IEC 62443</span>
                <input
                  value={editorNode.data.zoneName}
                  onChange={(event) =>
                    onUpdateNode({
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
                      onUpdateNode({
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
                      onUpdateNode({
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
                    onUpdateNode({
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
                    onUpdateNode({
                      allowedProtocols: parseProtocols(event.target.value),
                    })
                  }
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onOpenConsole} type="button">
            <TerminalSquare size={16} />
            Consola
          </button>
          <button className="secondary-button" onClick={onDuplicate} type="button">
            <Copy size={16} />
            Duplicar
          </button>
          <button className="danger-button" onClick={onDelete} type="button">
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

function PortPickerModal({
  edges,
  node,
  onClose,
  onSelect,
  phase,
  sourceEndpoint,
}: {
  edges: BuilderEdge[]
  node: BuilderNode | null
  onClose: () => void
  onSelect: (portIndex: number) => void
  phase: 'source' | 'target'
  sourceEndpoint?: LinkEndpoint
}) {
  if (node === null) {
    return null
  }

  const options = getAvailablePortOptions(
    node,
    edges,
    undefined,
    phase === 'target' ? sourceEndpoint?.nodeId : undefined,
  )

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={
        phase === 'source' ? 'Seleccion de puerto de origen' : 'Seleccion de puerto de destino'
      }
    >
      <div className="modal-shell modal-shell--port-picker">
        <div className="modal-header">
          <div className="modal-header__brand">
            <Cable size={18} />
            <div>
              <strong>
                {phase === 'source' ? 'Selecciona puerto de origen' : 'Selecciona puerto de destino'}
              </strong>
              <span>{node.data.label}</span>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="port-picker">
            {options.map((option) => (
              <button
                key={`${node.id}-${option.index}`}
                className="port-picker__option"
                onClick={() => onSelect(option.index)}
                type="button"
              >
                <strong>{option.name}</strong>
                <span>{phase === 'source' ? 'origen' : 'destino'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DrawingEditorModal({
  drawing,
  onChange,
  onClose,
  onDelete,
}: {
  drawing: DrawingNodeModel
  onChange: (patch: Partial<DrawingNodeModel['data']>) => void
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Drawing editor">
      <div className="modal-shell modal-shell--drawing">
        <div className="modal-header">
          <div className="modal-header__brand">
            <Square size={18} />
            <div>
              <strong>Editar dibujo</strong>
              <span>{drawingKindLabels[drawing.data.kind]}</span>
            </div>
          </div>
          <button
            aria-label="Cerrar editor de dibujo"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Texto</span>
            <input
              value={drawing.data.label}
              onChange={(event) => onChange({ label: event.target.value })}
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Tipo</span>
              <select
                value={drawing.data.kind}
                onChange={(event) => onChange({ kind: event.target.value as DrawingKind })}
              >
                {Object.entries(drawingKindLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Vista</span>
              <select
                value={drawing.data.view}
                onChange={(event) => onChange({ view: event.target.value as TopologyView })}
              >
                {viewOptions.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Ancho</span>
              <input
                min="44"
                type="number"
                value={drawing.data.width}
                onChange={(event) => onChange({ width: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>Alto</span>
              <input
                min="44"
                type="number"
                value={drawing.data.height}
                onChange={(event) => onChange({ height: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="swatch-row" aria-label="Color del dibujo">
            {drawingPalette.map((color) => (
              <button
                aria-label={`Color ${color}`}
                className="swatch-button"
                data-active={drawing.data.color === color}
                key={color}
                onClick={() => onChange({ color })}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>

          {drawing.data.kind === 'zone' ? (
            <div className="field-grid">
              <label className="field">
                <span>Nivel Purdue</span>
                <select
                  value={drawing.data.purdueLevel ?? 2}
                  onChange={(event) =>
                    onChange({ purdueLevel: Number(event.target.value) as PurdueLevel })
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
                  value={drawing.data.securityLevel ?? 'SL-2'}
                  onChange={(event) =>
                    onChange({ securityLevel: event.target.value as SecurityLevel })
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
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="danger-button" onClick={onDelete} type="button">
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

function CableEditorModal({
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cable editor">
      <div className="modal-shell modal-shell--cable">
        <div className="modal-header">
          <div className="modal-header__brand">
            <Cable size={18} />
            <div>
              <strong>{draft.id ? 'Editar enlace' : 'Nuevo enlace'}</strong>
              <span>
                {sourceNode.data.label} ↔ {targetNode.data.label}
              </span>
            </div>
          </div>
          <button
            aria-label="Cerrar editor de cable"
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
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
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onSave} type="button">
            <Save size={16} />
            Guardar enlace
          </button>
          {onDelete ? (
            <button className="danger-button" onClick={onDelete} type="button">
              <Trash2 size={16} />
              Eliminar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function buildProjectStatePayload(
  snapshot: CanvasHistoryState,
  activeView: TopologyView,
  topology: unknown,
): TopologyProjectStatePayload {
  const projectName = slugify(snapshot.settings.name)
  return {
    project_name: projectName,
    version: 1,
    client_saved_at: new Date().toISOString(),
    settings: snapshot.settings,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    drawings: snapshot.drawings,
    active_view: activeView,
    topology,
  }
}

function createInitialAppState(): {
  activeView: TopologyView
  snapshot: CanvasHistoryState
} {
  const fallback = createDefaultSnapshot()
  const projectName = window.localStorage.getItem(PROJECT_NAME_STORAGE_KEY)
  const draft = projectName === null ? null : loadProjectDraft(projectName)
  if (draft === null) {
    return {
      activeView: 'physical',
      snapshot: fallback,
    }
  }

  const restored = coerceProjectState(draft, fallback)
  return {
    activeView: restored.activeView,
    snapshot: restored.snapshot,
  }
}

function createDefaultSnapshot(): CanvasHistoryState {
  const builderState = createInitialBuilderState()
  return {
    settings: builderState.settings,
    nodes: builderState.nodes,
    edges: builderState.edges,
    drawings: createInitialDrawingNodes(),
  }
}

function saveProjectDraft(projectState: TopologyProjectStatePayload): void {
  try {
    window.localStorage.setItem(PROJECT_NAME_STORAGE_KEY, projectState.project_name)
    window.localStorage.setItem(
      getProjectDraftStorageKey(projectState.project_name),
      JSON.stringify(projectState),
    )
  } catch {
    // El navegador puede bloquear localStorage; el API sigue siendo la fuente remota.
  }
}

function loadProjectDraft(projectName: string): TopologyProjectStatePayload | null {
  try {
    const raw = window.localStorage.getItem(getProjectDraftStorageKey(projectName))
    if (raw === null) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.project_name !== projectName) {
      return null
    }
    return parsed as TopologyProjectStatePayload
  } catch {
    return null
  }
}

function getProjectDraftStorageKey(projectName: string): string {
  return `${PROJECT_DRAFT_STORAGE_PREFIX}${projectName}`
}

function isProjectStateNewer(
  candidate: TopologyProjectStatePayload | null,
  baseline: TopologyProjectStatePayload,
): boolean {
  if (candidate === null) {
    return false
  }
  return getProjectStateTimestamp(candidate) > getProjectStateTimestamp(baseline)
}

function getProjectStateTimestamp(projectState: TopologyProjectStatePayload): number {
  const timestamp = projectState.client_saved_at ?? projectState.saved_at
  if (timestamp === undefined) {
    return 0
  }
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : 0
}

function coerceProjectState(
  projectState: TopologyProjectStatePayload,
  fallback: CanvasHistoryState,
): {
  activeView: TopologyView
  projectName: string
  snapshot: CanvasHistoryState
} {
  const settings = coerceTopologySettings(projectState.settings, fallback.settings)
  const candidate: CanvasHistoryState = {
    settings,
    nodes: Array.isArray(projectState.nodes)
      ? (projectState.nodes as BuilderNode[])
      : fallback.nodes,
    edges: Array.isArray(projectState.edges)
      ? (projectState.edges as BuilderEdge[])
      : fallback.edges,
    drawings: Array.isArray(projectState.drawings)
      ? (projectState.drawings as DrawingNodeModel[])
      : fallback.drawings,
  }

  try {
    return {
      activeView: isTopologyView(projectState.active_view)
        ? projectState.active_view
        : 'physical',
      projectName: slugify(settings.name || projectState.project_name),
      snapshot: cloneSnapshot(candidate),
    }
  } catch {
    return {
      activeView: 'physical',
      projectName: slugify(fallback.settings.name),
      snapshot: cloneSnapshot(fallback),
    }
  }
}

function coerceTopologySettings(
  rawSettings: unknown,
  fallback: TopologySettings,
): TopologySettings {
  if (!isRecord(rawSettings)) {
    return { ...fallback }
  }

  return {
    name: typeof rawSettings.name === 'string' ? rawSettings.name : fallback.name,
    description:
      typeof rawSettings.description === 'string'
        ? rawSettings.description
        : fallback.description,
    siteName:
      typeof rawSettings.siteName === 'string' ? rawSettings.siteName : fallback.siteName,
    roomName:
      typeof rawSettings.roomName === 'string' ? rawSettings.roomName : fallback.roomName,
    rackName:
      typeof rawSettings.rackName === 'string' ? rawSettings.rackName : fallback.rackName,
  }
}

function buildSaveStatusMessage(result: TopologyProjectStateSaveResponse): string {
  if (
    result.topology_validation.status === 'failed' &&
    result.netbox_sync.status === 'synchronized' &&
    result.netbox_sync.detail === 'Topology cleared from NetBox'
  ) {
    return 'Diseno vacio guardado; NetBox limpiado para esta topologia'
  }
  if (result.topology_validation.status === 'failed') {
    return `Diseno guardado; topologia pendiente: ${compactDetail(
      result.topology_validation.detail,
      'validation failed',
    )}`
  }
  if (result.netbox_sync.status === 'failed') {
    return `Diseno guardado; NetBox pendiente: ${compactDetail(
      result.netbox_sync.detail,
      'sync failed',
    )}`
  }
  if (result.netbox_sync.status === 'skipped') {
    return 'Diseno guardado; NetBox omitido hasta tener topologia valida'
  }
  return 'Diseno guardado y NetBox sincronizado'
}

function getDeployableTopologyName(
  result: TopologyProjectStateSaveResponse,
): string | null {
  if (result.topology_validation.status !== 'valid') {
    return null
  }
  return result.topology_name
}

function compactDetail(detail: string | null, fallback: string): string {
  const value = detail?.replace(/\s+/g, ' ').trim() || fallback
  return value.length > 180 ? `${value.slice(0, 177)}...` : value
}

function isTopologyView(value: unknown): value is TopologyView {
  return value === 'physical' || value === 'logical' || value === 'security'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function cloneSnapshot(snapshot: CanvasHistoryState): CanvasHistoryState {
  return {
    settings: { ...snapshot.settings },
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        allowedProtocols: [...node.data.allowedProtocols],
        portConfigs: node.data.portConfigs.map((portConfig) => ({ ...portConfig })),
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
    drawings: snapshot.drawings.map((drawing) => ({
      ...drawing,
      data: stripDrawingRuntimeData(drawing.data),
      position: { ...drawing.position },
      style: drawing.style ? { ...drawing.style } : undefined,
    })),
  }
}

function stripDrawingRuntimeData(
  data: DrawingNodeModel['data'],
): DrawingNodeModel['data'] {
  return {
    color: data.color,
    height: data.height,
    kind: data.kind,
    label: data.label,
    purdueLevel: data.purdueLevel,
    securityLevel: data.securityLevel,
    view: data.view,
    width: data.width,
  }
}

function syncDrawingDimensions(
  drawing: DrawingNodeModel,
  patch: Partial<DrawingNodeModel['data']>,
): DrawingNodeModel {
  const height = clampDrawingSize(patch.height ?? drawing.data.height)
  const width = clampDrawingSize(patch.width ?? drawing.data.width)
  return {
    ...drawing,
    data: {
      ...drawing.data,
      ...patch,
      height,
      width,
    },
    style: {
      ...(drawing.style ?? {}),
      height,
      width,
    },
    zIndex: -10,
  }
}

function shouldRecordNodeChanges<T extends CanvasNode>(changes: NodeChange<T>[]): boolean {
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

function getNodeChangeId<T extends CanvasNode>(change: NodeChange<T>): string {
  return 'id' in change ? change.id : change.item.id
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

function clampDrawingSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 120
  }
  return Math.max(44, Math.min(900, Math.round(value)))
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

function getAvailablePortOptions(
  node: BuilderNode,
  edges: BuilderEdge[],
  excludedEdgeId: string | undefined,
  disallowedNodeId?: string,
) {
  return buildPortOptions(node, edges, excludedEdgeId, 0).filter((option) => {
    if (option.disabled) {
      return false
    }
    if (disallowedNodeId === node.id) {
      return false
    }
    return true
  })
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
  sourcePortIndex: number,
  targetNode: BuilderNode,
  targetPortIndex: number,
): string {
  return `${sourceNode.data.label} ${getPortName(sourceNode, sourcePortIndex)} -> ${targetNode.data.label} ${getPortName(targetNode, targetPortIndex)}`
}

function describeEdgePorts(edge: BuilderEdge, nodeById: Map<string, BuilderNode>): string {
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
  if (!showInterfaceLabels) {
    return ''
  }

  if (view === 'security') {
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

function getEdgeColor(view: TopologyView): string {
  if (view === 'logical') {
    return '#0d7b74'
  }
  if (view === 'security') {
    return '#bf3434'
  }
  return '#5f6972'
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
