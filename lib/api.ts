export type ApiModel = {
  m_name: string
  parameters: Array<{ p_name: string; values: string[] }>
  sets: Array<{ name: string; n_way: number }>
}

export type ApiSavedSet = {
  name: string
  n_way: number
  data_json: { parameters: string[]; tests: string[][] }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const API_ADDRESS = '/api'

export async function apiPost<T>(route: string, body: Record<string, unknown> = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_ADDRESS}/${route}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Nepodařilo se spojit s API. Zkontrolujte dostupnost služby a zkuste to znovu.', 0)
  }

  const text = await response.text()
  let payload: unknown = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `API vrátilo chybu ${response.status}.`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

export function readUsernameCookie(): string | null {
  if (typeof document === 'undefined') return null
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('username='))
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.slice('username='.length)) || null
  } catch {
    return null
  }
}
