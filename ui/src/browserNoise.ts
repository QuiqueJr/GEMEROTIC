const chromeAsyncResponseClosedMessage =
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'

type PreventableBrowserEvent = {
  error?: unknown
  message?: unknown
  preventDefault: () => void
  reason?: unknown
}

export function isBrowserExtensionAsyncResponseNoise(value: unknown): boolean {
  const message = getMessage(value)
  return message.includes(chromeAsyncResponseClosedMessage)
}

export function preventBrowserExtensionAsyncResponseNoise(
  event: PreventableBrowserEvent,
): boolean {
  const isNoise =
    isBrowserExtensionAsyncResponseNoise(event.reason) ||
    isBrowserExtensionAsyncResponseNoise(event.error) ||
    isBrowserExtensionAsyncResponseNoise(event.message)

  if (!isNoise) {
    return false
  }

  event.preventDefault()
  return true
}

export function installBrowserExtensionNoiseGuard(
  browserWindow: Window = window,
): () => void {
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    preventBrowserExtensionAsyncResponseNoise(event)
  }
  const onError = (event: ErrorEvent) => {
    preventBrowserExtensionAsyncResponseNoise(event)
  }

  browserWindow.addEventListener('unhandledrejection', onUnhandledRejection)
  browserWindow.addEventListener('error', onError)

  return () => {
    browserWindow.removeEventListener('unhandledrejection', onUnhandledRejection)
    browserWindow.removeEventListener('error', onError)
  }
}

function getMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message
  }
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value) && typeof value.message === 'string') {
    return value.message
  }
  return ''
}

function isRecord(value: unknown): value is { message?: unknown } {
  return typeof value === 'object' && value !== null
}
