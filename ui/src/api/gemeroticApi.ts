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

export type APIEnvelope = {
  status: 'success' | 'error'
  message: string
  detail?: unknown
  data?: unknown
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
