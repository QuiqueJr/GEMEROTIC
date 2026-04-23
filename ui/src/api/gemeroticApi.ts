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
