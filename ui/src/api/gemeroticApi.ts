type APIConfig = {
  baseUrl: string
  apiKey: string
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
  stage: 'containerlab' | 'ansible' | 'batfish' | 'opa' | 'metadata'
  content_type: string
  content: string
}

export type PipelineArtifactsResponse = {
  topology_name: string
  artifacts: PipelineArtifact[]
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
): Promise<APIResult<APIEnvelope>> {
  return requestJson<APIEnvelope>(config, '/api/v1/topology', {
    method: 'POST',
    apiKeyRequired: true,
    body: payload,
  })
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
    method?: 'GET' | 'POST'
    apiKeyRequired?: boolean
    body?: unknown
  } = {},
): Promise<APIResult<T>> {
  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (options.apiKeyRequired) {
    headers.set('X-API-Key', config.apiKey)
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
