'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiPost, readUsernameCookie, type ApiModel, type ApiSavedSet } from '@/lib/api'
import { RspPairwiseView, type Model, type Parameter } from './rsp-pairwise-view'
type IpogWorkerMessage =
  | { type: 'progress'; parameterIndex: number; parameterCount: number }
  | { type: 'complete'; tests: string[][] }
  | { type: 'error'; message: string }

const emptyModel = (name = ''): Model => ({ id: name, name, parameters: [], sets: [] })

function isUnavailable(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500)
}

export function RspPairwiseApi() {
  const [models, setModels] = useState<Model[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [activeSetName, setActiveSetName] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [modal, setModal] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [newParameterName, setNewParameterName] = useState('')
  const [newSetName, setNewSetName] = useState('')
  const [strength, setStrength] = useState(2)
  const [isGenerating, setIsGenerating] = useState(false)
  const [workerActive, setWorkerActive] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('')
  const [generationNotice, setGenerationNotice] = useState('')
  const workerRef = useRef<Worker | null>(null)
  const generationTimerRef = useRef<number | null>(null)
  const cancelGenerationRef = useRef<(() => void) | null>(null)

  const model = useMemo(() => models.find((item) => item.name === selectedName) ?? emptyModel(), [models, selectedName])
  const activeSet = model.sets.find((item) => item.name === activeSetName) ?? null

  const showError = useCallback((error: unknown) => {
    if (isUnavailable(error)) setApiUnavailable(true)
    setMessage(error instanceof Error ? error.message : 'Požadavek se nepodařilo dokončit.')
  }, [])

  const loadModels = useCallback(async (signedInUser = readUsernameCookie()) => {
    setLoading(true)
    try {
      const result = await apiPost<{ models: string[] }>('models/get')
      const loaded = await Promise.all(result.models.map(async (name) => {
        const details = await apiPost<ApiModel>('model/get', { m_name: name })
        return {
          id: name,
          name,
          parameters: details.parameters.map((parameter) => ({ id: `${name}/${parameter.p_name}`, name: parameter.p_name, values: parameter.values })),
          sets: details.sets.map((saved) => ({ id: `${name}/${saved.name}`, name: saved.name, strength: saved.n_way, tests: [] })),
        }
      }))
      setModels(loaded)
      setSelectedName((current) => loaded.some((item) => item.name === current) ? current : loaded[0]?.name ?? '')
      setActiveSetName('')
      setUser(signedInUser)
      setApiUnavailable(false)
      setMessage('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setModels([])
        setSelectedName('')
        setUser(null)
        setApiUnavailable(false)
        setMessage('')
      } else {
        if (error instanceof ApiError && error.status === 404) setApiUnavailable(true)
        showError(error)
      }
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => () => {
    cancelGenerationRef.current?.()
  }, [])

  async function perform<T>(operation: () => Promise<T>, success?: string) {
    try {
      const result = await operation()
      setMessage(success ?? '')
      if (success) window.setTimeout(() => setMessage(''), 3000)
      setApiUnavailable(false)
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null)
        setModels([])
        setSelectedName('')
      }
      showError(error)
      return null
    }
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault()
    const body = registering ? { username, email, passwd: password } : { email, passwd: password }
    const result = await perform(() => apiPost<Record<string, never>>(registering ? 'register' : 'login', body))
    if (result !== null) {
      const signedInUser = readUsernameCookie() ?? (registering ? username.trim() : email.trim().toLowerCase())
      setUser(signedInUser)
      setModal(false)
      setPassword('')
      await loadModels(signedInUser)
    }
  }

  async function logout() {
    const result = await perform(() => apiPost<Record<string, never>>('logout'))
    if (result !== null) {
      setUser(null)
      setModels([])
      setSelectedName('')
      setMessage('Odhlášení proběhlo.')
    }
  }

  async function createModel(event: React.FormEvent) {
    event.preventDefault()
    const name = newModelName.trim()
    if (!name) return
    const result = await perform(() => apiPost('model/create', { m_name: name }), 'Model byl vytvořen.')
    if (result !== null) {
      setNewModelName('')
      await loadModels(user)
      setSelectedName(name)
    }
  }

  async function renameModel(name: string) {
    const nextName = name.trim()
    if (!nextName || nextName === model.name) return
    const result = await perform(() => apiPost('model/rename', { m_name: model.name, m_new_name: nextName }), 'Název modelu byl uložen.')
    if (result !== null) {
      setSelectedName(nextName)
      await loadModels(user)
      setSelectedName(nextName)
    }
  }

  async function deleteModel() {
    if (!model.name || !window.confirm(`Opravdu smazat model „${model.name}“?`)) return
    const result = await perform(() => apiPost('model/destroy', { m_name: model.name }), 'Model byl smazán.')
    if (result !== null) await loadModels(user)
  }

  async function createParameter(event: React.FormEvent) {
    event.preventDefault()
    const name = newParameterName.trim()
    if (!name || !model.name) return
    const result = await perform(() => apiPost('model/param/create', { m_name: model.name, p_name: name }), 'Parametr byl přidán.')
    if (result !== null) {
      setNewParameterName('')
      await loadModels(user)
    }
  }

  async function renameParameter(oldName: string, nextName: string) {
    const next = nextName.trim()
    if (!next || next === oldName) return
    const result = await perform(() => apiPost('model/param/rename', { m_name: model.name, p_name: oldName, p_new_name: next }), 'Název parametru byl uložen.')
    if (result !== null) await loadModels(user)
  }

  async function deleteParameter(parameterName: string) {
    if (!window.confirm(`Opravdu smazat parametr „${parameterName}“?`)) return
    const result = await perform(() => apiPost('model/param/destroy', { m_name: model.name, p_name: parameterName }), 'Parametr byl smazán.')
    if (result !== null) await loadModels(user)
  }

  async function addValue(parameterName: string, value: string) {
    if (!model.name) return
    const result = await perform(() => apiPost('model/param/value/add', { m_name: model.name, p_name: parameterName, value }), 'Hodnota byla přidána.')
    if (result !== null) await loadModels(user)
  }

  async function removeValue(parameterName: string, value: string) {
    const result = await perform(() => apiPost('model/param/value/remove', { m_name: model.name, p_name: parameterName, value }), 'Hodnota byla odebrána.')
    if (result !== null) await loadModels(user)
  }

  function runIpogWorker(parameters: Parameter[], coverage: number) {
    return new Promise<string[][]>((resolve, reject) => {
      const worker = new Worker('/ipog.worker.mjs', { type: 'module' })
      workerRef.current = worker
      setWorkerActive(true)

      const cleanup = () => {
        if (generationTimerRef.current !== null) window.clearTimeout(generationTimerRef.current)
        generationTimerRef.current = null
        worker.terminate()
        if (workerRef.current === worker) workerRef.current = null
        cancelGenerationRef.current = null
        setWorkerActive(false)
      }

      const fail = (error: Error) => {
        cleanup()
        reject(error)
      }

      cancelGenerationRef.current = () => fail(new DOMException('Výpočet byl zrušen.', 'AbortError'))
      generationTimerRef.current = window.setTimeout(() => {
        fail(new Error('Výpočet překročil limit 60 sekund. Worker byl ukončen; zkuste nižší sílu pokrytí.'))
      }, 60_000)

      worker.onmessage = (event: MessageEvent<IpogWorkerMessage>) => {
        const response = event.data
        if (response.type === 'progress') {
          setGenerationProgress(`IPOG: parametr ${response.parameterIndex} z ${response.parameterCount}`)
        } else if (response.type === 'complete') {
          cleanup()
          resolve(response.tests)
        } else {
          fail(new Error(response.message))
        }
      }

      worker.onerror = (event) => {
        event.preventDefault()
        fail(new Error(event.message || 'IPOG worker se nepodařilo spustit.'))
      }

      try {
        worker.postMessage({
          parameters: parameters.map(({ values }) => ({ values })),
          strength: coverage,
        })
      } catch (error) {
        fail(error instanceof Error ? error : new Error('IPOG worker se nepodařilo spustit.'))
      }
    })
  }

  function cancelGeneration() {
    cancelGenerationRef.current?.()
    setGenerationProgress('')
    setMessage('Výpočet byl zrušen.')
  }

  async function generateSet() {
    if (!model.name || !model.parameters.length || isGenerating) return
    const effectiveStrength = Math.min(strength, model.parameters.length)
    const setName = newSetName.trim() || `Sada ${effectiveStrength}-way`
    const parameters = model.parameters.map((item) => item.name)
    setIsGenerating(true)
    setGenerationNotice(effectiveStrength < strength
      ? `Síla pokrytí byla automaticky upravena z ${strength}-way na ${effectiveStrength}-way, protože model má jen ${parameters.length} parametrů.`
      : '')
    setGenerationProgress('Připravuji IPOG…')

    try {
      const tests = await runIpogWorker(model.parameters, effectiveStrength)
      setGenerationProgress('Ukládám vygenerovanou sadu…')
      const result = await perform(() => apiPost('model/set/save', {
        m_name: model.name,
        name: setName,
        n_way: effectiveStrength,
        data_json: { parameters, tests },
      }), 'Vygenerovaná sada byla uložena.')
      if (result !== null) {
        setNewSetName('')
        await loadModels(user)
        setActiveSetName(setName)
        await loadSet(setName)
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) showError(error)
    } finally {
      setIsGenerating(false)
      setWorkerActive(false)
      setGenerationProgress('')
    }
  }

  async function loadSet(name: string) {
    setActiveSetName(name)
    const saved = await perform(() => apiPost<ApiSavedSet>('model/set/get', { m_name: model.name, name }))
    if (saved) {
      const tests = saved.data_json?.tests ?? []
      setModels((current) => current.map((item) => item.name === model.name ? {
        ...item,
        sets: item.sets.map((entry) => entry.name === name ? { ...entry, tests, strength: saved.n_way } : entry),
      } : item))
    }
  }

  async function deleteSet(name: string) {
    if (!window.confirm(`Opravdu smazat sadu „${name}“?`)) return
    const result = await perform(() => apiPost('model/set/erase', { m_name: model.name, name }), 'Sada byla smazána.')
    if (result !== null) {
      if (activeSetName === name) setActiveSetName('')
      await loadModels(user)
    }
  }

  return <RspPairwiseView
    state={{ models, selectedName, activeSetName, user, apiUnavailable, loading, message, modal, registering, username, email, password, newModelName, newParameterName, newSetName, strength, isGenerating, workerActive, generationProgress, generationNotice, model, activeSet }}
    actions={{
      retryApi: () => { void loadModels(user) },
      logout: () => { void logout() },
      openAuth: () => setModal(true),
      closeAuth: () => setModal(false),
      createModel: (event) => { void createModel(event) },
      selectModel: (name) => { setSelectedName(name); setActiveSetName('') },
      loadSet: (name) => { void loadSet(name) },
      deleteSet: (name) => { void deleteSet(name) },
      deleteModel: () => { void deleteModel() },
      renameModel: (name) => { void renameModel(name) },
      changeStrength: (value) => { setStrength(value); setGenerationNotice('') },
      changeNewSetName: setNewSetName,
      generateSet: () => { void generateSet() },
      cancelGeneration,
      createParameter: (event) => { void createParameter(event) },
      renameParameter: (oldName, newName) => { void renameParameter(oldName, newName) },
      deleteParameter: (name) => { void deleteParameter(name) },
      addValue: (parameterName, value) => { void addValue(parameterName, value) },
      removeValue: (parameterName, value) => { void removeValue(parameterName, value) },
      submitAuth: (event) => { void submitAuth(event) },
      toggleRegistration: () => setRegistering((value) => !value),
      changeUsername: setUsername,
      changeEmail: setEmail,
      changePassword: setPassword,
      changeNewModelName: setNewModelName,
      changeNewParameterName: setNewParameterName,
    }}
  />
}
