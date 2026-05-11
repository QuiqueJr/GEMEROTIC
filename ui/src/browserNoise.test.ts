import { describe, expect, it, vi } from 'vitest'

import {
  isBrowserExtensionAsyncResponseNoise,
  preventBrowserExtensionAsyncResponseNoise,
} from './browserNoise'

const extensionMessage =
  'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received'

describe('browserNoise', () => {
  it('identifica solo el ruido de respuesta asincrona de extensiones Chrome', () => {
    expect(
      isBrowserExtensionAsyncResponseNoise(new Error(extensionMessage)),
    ).toBe(true)
    expect(
      isBrowserExtensionAsyncResponseNoise({
        message: extensionMessage,
      }),
    ).toBe(true)
    expect(isBrowserExtensionAsyncResponseNoise('Network failed')).toBe(false)
    expect(
      isBrowserExtensionAsyncResponseNoise(new Error('Application runtime error')),
    ).toBe(false)
  })

  it('previene solo el evento ruidoso y deja pasar errores reales', () => {
    const preventDefault = vi.fn()
    const extensionEvent = {
      preventDefault,
      reason: new Error(extensionMessage),
    }

    expect(preventBrowserExtensionAsyncResponseNoise(extensionEvent)).toBe(true)
    expect(preventDefault).toHaveBeenCalledTimes(1)

    const realErrorPreventDefault = vi.fn()
    const realErrorEvent = {
      preventDefault: realErrorPreventDefault,
      reason: new Error('Cannot read properties of undefined'),
    }

    expect(preventBrowserExtensionAsyncResponseNoise(realErrorEvent)).toBe(false)
    expect(realErrorPreventDefault).not.toHaveBeenCalled()
  })
})
