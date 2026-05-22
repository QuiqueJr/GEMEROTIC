export type APIConfig = {
  baseUrl: string
  apiKey?: string
}

type APIResult<T> = {
  ok: boolean
  status: number
  data: T
}

export type HealthResponse = {
  status: string
  app_name: string
  version: string
  checks: {
    netbox_connected: boolean
    rate_limit_backend_connected: boolean
  }
}

export type APIEnvelope<T = unknown> = {
  status: 'success' | 'error'
  message: string
  detail?: unknown
  data?: T
}

export type PipelineArtifact = {
  path: string
  stage:
    | 'topology'
    | 'inventory'
    | 'runtime'
    | 'containerlab'
    | 'ansible'
    | 'ansible_vars'
    | 'batfish'
    | 'opa'
    | 'metadata'
  content_type: string
  content: string
}

export type PipelineArtifactsResponse = {
  topology_name: string
  artifacts: PipelineArtifact[]
}

export type NetBoxSyncStatus = {
  status: 'synchronized' | 'draft_synchronized' | 'queued' | 'failed' | 'skipped'
  detail: string | null
  result?: unknown
}

export type TopologySaveResponse = {
  topology_name: string
  saved_at: string
  store_dir: string
  artifact_count: number
  netbox_sync: NetBoxSyncStatus
}

export type TopologyProjectStatePayload = {
  project_name: string
  version: number
  client_saved_at?: string
  saved_at?: string
  settings: unknown
  nodes: unknown[]
  edges: unknown[]
  drawings: unknown[]
  physical_layout?: unknown
  active_view: 'physical' | 'logical' | 'security'
  topology?: unknown
}

export type TopologyProjectStateSaveResponse = {
  project_name: string
  saved_at: string
  store_dir: string
  topology_name: string | null
  topology_save: TopologySaveResponse | null
  topology_validation: {
    status: 'valid' | 'failed' | 'skipped'
    detail: string | null
  }
  netbox_sync: NetBoxSyncStatus
  netbox_cleanup?: NetBoxSyncStatus
  pipeline_deploy?: NetBoxSyncStatus
  granular_store?: {
    project_name?: string
    revision?: number
    jobs_queued?: string[]
    deployment_status?: string
    netbox_status?: string
    status?: string
    detail?: string
  }
}

export type PipelineCommandResult = {
  name: string
  command: string[]
  exit_code: number
  stdout_tail: string
  stderr_tail: string
}

export type PipelineRunResponse = {
  topology_name: string
  bundle_dir: string
  artifacts: PipelineArtifact[]
  commands: PipelineCommandResult[]
}

export type PipelineToolStatus = {
  name: string
  installed: boolean
  path: string | null
  version: string | null
  error: string | null
}

export type PipelineToolReportResponse = {
  tools: PipelineToolStatus[]
}

export type PipelineLabNodeResponse = {
  node_id: string
  container_name: string
  container_id: string
  image: string
  kind: string
  state: string
  status: string
  ipv4_address: string
  ipv6_address: string
}

export type PipelineLabStatusResponse = {
  topology_name: string
  lab_path: string
  abs_lab_path: string
  deployed?: boolean
  detail?: string | null
  nodes: PipelineLabNodeResponse[]
}

export type PipelineConsoleResultResponse = {
  topology_name: string
  node_id: string
  container_name: string
  command: string[]
  exit_code: number
  stdout_tail: string
  stderr_tail: string
}

export type PipelineRunningConfigSyncResponse = {
  topology_name: string
  node_id: string
  container_name: string
  command: string[]
  running_config: string
  exit_code: number
  stdout_tail: string
  stderr_tail: string
  database_updated: boolean
}

export type PipelineTerminalSessionResponse = {
  topology_name: string
  node_id: string
  token: string
  expires_at: number
  ttl_seconds: number
}

export type RuntimePowerAction = 'start' | 'stop' | 'restart'

export type RuntimePowerResponse = {
  topology_name: string
  action: RuntimePowerAction
  node_id?: string
  container_name?: string
  node_count?: number
  exit_code?: string
  stdout_tail?: string
  stderr_tail?: string
  results?: RuntimePowerResponse[]
}

export type ProjectJob = {
  id: string
  project_name: string
  event_type: string
  entity_type: string | null
  entity_id: string | null
  revision: number
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  error: string | null
  created_at: string | null
  updated_at: string | null
}

export type ProjectJobsResponse = {
  project_name: string
  jobs: ProjectJob[]
}

export type ProjectCommandPayload = {
  command_type: string
  entity_id?: string
  entity_type?: string
  payload?: Record<string, unknown>
  expected_revision?: number
  idempotency_key?: string
}

export type ProjectCommandResponse = {
  project_name: string
  revision: number
  entity_type: string | null
  entity_id: string | null
  jobs_queued: string[]
}

export type ComplianceStatus = 'pass' | 'fail' | 'warn' | 'not_assessed'
export type ComplianceSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type CompliancePosture =
  | 'strong'
  | 'attention_required'
  | 'non_compliant'
  | 'partial'

export type ComplianceReference = {
  standard: 'IEC 62443' | 'NIS2' | 'ISO/IEC 27001'
  reference: string
  url: string
}

export type ComplianceFinding = {
  control_id: string
  standard: 'IEC 62443' | 'NIS2' | 'ISO/IEC 27001'
  title: string
  status: ComplianceStatus
  severity: ComplianceSeverity
  summary: string
  rationale: string
  affected_assets: string[]
  affected_zones: string[]
  evidence: Record<string, unknown>
  remediation: string[]
  references: ComplianceReference[]
}

export type ComplianceSummary = {
  overall_posture: CompliancePosture
  assessed_controls: number
  not_assessed_controls: number
  passed_controls: number
  warned_controls: number
  failed_controls: number
  coverage_percent: number
}

export type ComplianceReportResponse = {
  topology_name: string
  baseline: Array<'IEC 62443' | 'NIS2' | 'ISO/IEC 27001'>
  generated_at: string
  summary: ComplianceSummary
  findings: ComplianceFinding[]
}

export type ComplianceChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ComplianceChatResponse = {
  mode: 'local_advisor' | 'ollama_advisor' | 'scope_guard'
  scope_allowed: boolean
  answer: string
  cited_controls: string[]
  suggested_actions: string[]
  limitations: string[]
  report: ComplianceReportResponse
}

export async function getHealth(config: APIConfig): Promise<APIResult<HealthResponse>> {
  return requestJson<HealthResponse>(config, '/api/v1/health')
}

export async function bootstrapNetBox(
  config: APIConfig,
): Promise<APIResult<APIEnvelope>> {
  return requestJson<APIEnvelope>(config, '/api/v1/netbox/bootstrap', {
    method: 'POST',
    apiKeyRequired: true,
  })
}

export async function createTopology(
  config: APIConfig,
  payload: unknown,
): Promise<APIResult<APIEnvelope<TopologySaveResponse>>> {
  return requestJson<APIEnvelope<TopologySaveResponse>>(config, '/api/v1/topology', {
    method: 'POST',
    apiKeyRequired: true,
    body: payload,
  })
}

export async function getTopologyState(
  config: APIConfig,
  projectName: string,
): Promise<APIResult<APIEnvelope<TopologyProjectStatePayload>>> {
  return requestJson<APIEnvelope<TopologyProjectStatePayload>>(
    config,
    `/api/v1/topology/state/${encodeURIComponent(projectName)}`,
    {
      method: 'GET',
      apiKeyRequired: true,
    },
  )
}

export async function saveTopologyState(
  config: APIConfig,
  projectName: string,
  payload: TopologyProjectStatePayload,
): Promise<APIResult<APIEnvelope<TopologyProjectStateSaveResponse>>> {
  return requestJson<APIEnvelope<TopologyProjectStateSaveResponse>>(
    config,
    `/api/v1/topology/state/${encodeURIComponent(projectName)}`,
    {
      method: 'PUT',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

export async function generatePipelineArtifacts(
  config: APIConfig,
  payload: unknown,
): Promise<APIResult<APIEnvelope<PipelineArtifactsResponse>>> {
  return requestJson<APIEnvelope<PipelineArtifactsResponse>>(
    config,
    '/api/v1/pipeline/artifacts',
    {
      method: 'POST',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

export async function generateSavedPipelineArtifacts(
  config: APIConfig,
  topologyName: string,
): Promise<APIResult<APIEnvelope<PipelineArtifactsResponse>>> {
  return requestJson<APIEnvelope<PipelineArtifactsResponse>>(
    config,
    `/api/v1/pipeline/artifacts/${encodeURIComponent(topologyName)}`,
    {
      method: 'POST',
      apiKeyRequired: true,
    },
  )
}

export async function getPipelineTools(
  config: APIConfig,
): Promise<APIResult<APIEnvelope<PipelineToolReportResponse>>> {
  return requestJson<APIEnvelope<PipelineToolReportResponse>>(
    config,
    '/api/v1/pipeline/tools',
    {
      method: 'GET',
      apiKeyRequired: true,
    },
  )
}

export async function deployPipeline(
  config: APIConfig,
  payload: unknown,
): Promise<APIResult<APIEnvelope<PipelineRunResponse>>> {
  return requestJson<APIEnvelope<PipelineRunResponse>>(
    config,
    '/api/v1/pipeline/deploy',
    {
      method: 'POST',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

export async function deploySavedPipeline(
  config: APIConfig,
  topologyName: string,
): Promise<APIResult<APIEnvelope<PipelineRunResponse>>> {
  return requestJson<APIEnvelope<PipelineRunResponse>>(
    config,
    `/api/v1/pipeline/deploy/${encodeURIComponent(topologyName)}`,
    {
      method: 'POST',
      apiKeyRequired: true,
    },
  )
}

export async function getPipelineLabStatus(
  config: APIConfig,
  topologyName: string,
): Promise<APIResult<APIEnvelope<PipelineLabStatusResponse>>> {
  return requestJson<APIEnvelope<PipelineLabStatusResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}`,
    {
      method: 'GET',
      apiKeyRequired: true,
    },
  )
}

export async function runPipelineConsoleCommand(
  config: APIConfig,
  topologyName: string,
  nodeId: string,
  command: string,
): Promise<APIResult<APIEnvelope<PipelineConsoleResultResponse>>> {
  return requestJson<APIEnvelope<PipelineConsoleResultResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/nodes/${encodeURIComponent(nodeId)}/console`,
    {
      method: 'POST',
      apiKeyRequired: true,
      body: { command },
    },
  )
}

export function buildTerminalWebSocketUrl(
  config: APIConfig,
  topologyName: string,
  nodeId: string,
  terminalToken?: string,
): string {
  const baseUrl = new URL(config.baseUrl.replace(/\/$/, ''))
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/nodes/${encodeURIComponent(nodeId)}/terminal`
  baseUrl.search = ''
  const token = terminalToken?.trim() ?? ''
  if (token) {
    baseUrl.searchParams.set('terminal_token', token)
  }
  return baseUrl.toString()
}

export async function createTerminalSession(
  config: APIConfig,
  topologyName: string,
  nodeId: string,
): Promise<APIResult<APIEnvelope<PipelineTerminalSessionResponse>>> {
  return requestJson<APIEnvelope<PipelineTerminalSessionResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/nodes/${encodeURIComponent(nodeId)}/terminal/session`,
    {
      method: 'POST',
      apiKeyRequired: true,
    },
  )
}

export async function syncRunningConfig(
  config: APIConfig,
  topologyName: string,
  nodeId: string,
): Promise<APIResult<APIEnvelope<PipelineRunningConfigSyncResponse>>> {
  return requestJson<APIEnvelope<PipelineRunningConfigSyncResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/nodes/${encodeURIComponent(nodeId)}/running-config/sync`,
    {
      method: 'POST',
      apiKeyRequired: true,
    },
  )
}

export async function applyProjectCommand(
  config: APIConfig,
  projectName: string,
  payload: ProjectCommandPayload,
): Promise<APIResult<APIEnvelope<ProjectCommandResponse>>> {
  return requestJson<APIEnvelope<ProjectCommandResponse>>(
    config,
    `/api/v1/projects/${encodeURIComponent(projectName)}/commands`,
    {
      method: 'POST',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

export async function getProjectJobs(
  config: APIConfig,
  projectName: string,
): Promise<APIResult<APIEnvelope<ProjectJobsResponse>>> {
  return requestJson<APIEnvelope<ProjectJobsResponse>>(
    config,
    `/api/v1/projects/${encodeURIComponent(projectName)}/jobs`,
    {
      method: 'GET',
      apiKeyRequired: true,
    },
  )
}

export async function controlPipelineNodePower(
  config: APIConfig,
  topologyName: string,
  nodeId: string,
  action: RuntimePowerAction,
): Promise<APIResult<APIEnvelope<RuntimePowerResponse>>> {
  return requestJson<APIEnvelope<RuntimePowerResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/nodes/${encodeURIComponent(nodeId)}/power`,
    {
      method: 'POST',
      apiKeyRequired: true,
      body: { action },
    },
  )
}

export async function controlPipelineLabPower(
  config: APIConfig,
  topologyName: string,
  action: RuntimePowerAction,
): Promise<APIResult<APIEnvelope<RuntimePowerResponse>>> {
  return requestJson<APIEnvelope<RuntimePowerResponse>>(
    config,
    `/api/v1/pipeline/labs/${encodeURIComponent(topologyName)}/power`,
    {
      method: 'POST',
      apiKeyRequired: true,
      body: { action },
    },
  )
}

export async function generateComplianceReport(
  config: APIConfig,
  payload: unknown,
): Promise<APIResult<APIEnvelope<ComplianceReportResponse>>> {
  return requestJson<APIEnvelope<ComplianceReportResponse>>(
    config,
    '/api/v1/compliance/report',
    {
      method: 'POST',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

export async function chatWithComplianceAssistant(
  config: APIConfig,
  payload: {
    topology: unknown
    messages: ComplianceChatMessage[]
  },
): Promise<APIResult<APIEnvelope<ComplianceChatResponse>>> {
  return requestJson<APIEnvelope<ComplianceChatResponse>>(
    config,
    '/api/v1/compliance/chat',
    {
      method: 'POST',
      apiKeyRequired: true,
      body: payload,
    },
  )
}

async function requestJson<T>(
  config: APIConfig,
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT'
    apiKeyRequired?: boolean
    body?: unknown
  } = {},
): Promise<APIResult<T>> {
  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  const apiKey = config.apiKey?.trim() ?? ''
  if (options.apiKeyRequired && apiKey) {
    headers.set('X-API-Key', apiKey)
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const data = (await response.json()) as T
  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}
