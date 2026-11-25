'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FileCode2, FolderPlus, Layers, LogIn, LogOut, Plus, Save, SlidersHorizontal, Table2, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { ApiError, apiPost, readUsernameCookie, type ApiModel, type ApiSavedSet } from '@/lib/api'

type Parameter = { id: string; name: string; values: string[] }
type TestSet = { id: string; name: string; strength: number; tests: string[][] }
type Model = { id: string; name: string; parameters: Parameter[]; sets: TestSet[] }
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

  if (apiUnavailable) {
    return <main className="app-shell dark-mode"><section className="error-screen" role="alert"><div className="error-icon"><AlertTriangle size={30} /></div><h1>API není dostupné</h1><p>{message || 'Aplikace se nemůže spojit se službou. Zkontrolujte, zda API běží, a zkuste to znovu.'}</p><button className="primary-button" onClick={() => void loadModels(user)}>Zkusit znovu</button></section></main>
  }

  return <div className="app-shell dark-mode">
    <header className="topbar"><div className="brand-area"><div className="brand"><span className="brand-mark"><Layers size={15} /></span><strong>RSP Pairwise</strong><span className="prototype-label">Statický klient</span></div><span className="divider" /><div className="context-label"><span>ČVUT FEL PM2</span><span>/</span><strong>Webová alternativa ACTS 3.2</strong></div></div><div className="top-actions">{user ? <div className="user-badge logged"><UserCheck size={14} /><span>Uživatel: <strong>{user}</strong></span><button aria-label="Odhlásit se" onClick={() => void logout()}><LogOut size={14} /></button></div> : <div className="user-badge guest"><UserX size={14} /><span>Režim: <strong>Nepřihlášen</strong></span><button onClick={() => setModal(true)}><LogIn size={14} /> Přihlásit</button></div>}</div></header>
    <div className="app-body"><aside className="sidebar"><section className="sidebar-section models-section"><div className="section-heading"><span>Moje modely</span><FolderPlus size={16} /></div>{user && <form className="api-inline-form" onSubmit={createModel}><input aria-label="Název nového modelu" value={newModelName} onChange={(event) => setNewModelName(event.target.value)} placeholder="Název modelu" maxLength={256} /><button title="Vytvořit model"><Plus size={14} /></button></form>}<div className="model-list">{models.map((item) => <button key={item.id} className={`model-item ${item.name === selectedName ? 'active' : ''}`} onClick={() => { setSelectedName(item.name); setActiveSetName('') }}><span><FileCode2 size={14} /><span className="truncate">{item.name}</span></span><small>{item.parameters.length} p</small></button>)}{!loading && user && !models.length && <p className="empty-note">Zatím nemáte žádný model.</p>}{!user && <p className="empty-note">Pro načtení modelů se přihlaste.</p>}</div></section><section className="sidebar-section set-section"><div className="section-heading"><span>Uložené sady testů</span><span className="count-badge">{model.sets.length}</span></div><div className="set-list">{model.sets.map((item) => <div className={`set-item ${item.name === activeSetName ? 'active' : ''}`} key={item.id}><button className="api-set-select" onClick={() => void loadSet(item.name)}><span className="set-title"><strong>{item.name}</strong></span><span className="set-meta"><em>{item.strength}-way</em></span></button><button className="quiet-icon" aria-label={`Smazat sadu ${item.name}`} onClick={() => void deleteSet(item.name)}><Trash2 size={13} /></button></div>)}{!model.sets.length && <p className="empty-note">Žádné uložené sady.</p>}</div></section><footer className="sidebar-footer"><button className="delete-model" disabled={!model.name} onClick={() => void deleteModel()}><Trash2 size={14} />Smazat tento model</button></footer></aside>
      <main className="workspace"><section className="workspace-toolbar"><div className="model-title"><label htmlFor="model-name">Název modelu systému<input id="model-name" key={model.name} defaultValue={model.name} onBlur={(event) => void renameModel(event.target.value)} disabled={!model.name || !user} /></label><div className="parameter-count">Počet parametrů: <strong>{model.parameters.length} / 100</strong></div></div><div className="generator-panel"><label>Síla pokrytí (N-way)<select value={strength} disabled={isGenerating} onChange={(event) => { setStrength(Number(event.target.value)); setGenerationNotice('') }}>{[2,3,4,5,6].map((value) => <option key={value} value={value}>{value}-way</option>)}</select></label><label>Název nové sady<input value={newSetName} onChange={(event) => setNewSetName(event.target.value)} placeholder="např. Pairwise produkce" maxLength={256} /></label><button className="generate-button" disabled={isGenerating || !user || !model.name || !model.parameters.length || model.parameters.some((parameter) => !parameter.values.length)} aria-busy={isGenerating} onClick={() => void generateSet()}><Table2 size={14} />{isGenerating ? 'Generuji…' : 'Generovat a uložit sadu'}</button>{(generationNotice || generationProgress || isGenerating) && <div className="generation-feedback" role="status" aria-live="polite">{generationNotice && <span className="generation-warning">{generationNotice}</span>}{generationProgress && <span>{generationProgress}</span>}{workerActive && <button className="outline-button generation-cancel" type="button" onClick={cancelGeneration}>Zrušit výpočet</button>}</div>}</div></section>
        <div className="split-workspace"><section className="parameters-panel"><div className="panel-heading"><span><SlidersHorizontal size={16} />Parametry a třídy ekvivalence</span></div>{user && model.name && <form className="api-inline-form" onSubmit={createParameter}><input aria-label="Název nového parametru" value={newParameterName} onChange={(event) => setNewParameterName(event.target.value)} placeholder="Název parametru" maxLength={256} /><button title="Přidat parametr" disabled={model.parameters.length >= 100}><Plus size={14} /> Přidat</button></form>}<div className="parameters-list">{model.parameters.map((parameter) => <ParameterRow key={parameter.id} parameter={parameter} disabled={!user} onRename={(name) => void renameParameter(parameter.name, name)} onDelete={() => void deleteParameter(parameter.name)} onAdd={(value) => void addValue(parameter.name, value)} onRemove={(value) => void removeValue(parameter.name, value)} />)}{!model.parameters.length && <p className="empty-note">{loading ? 'Načítání dat…' : user ? 'Vyberte nebo vytvořte model.' : 'Po přihlášení se zobrazí vaše modely a parametry.'}</p>}</div></section>
        <section className="matrix-panel"><div className="panel-heading matrix-heading"><div className="matrix-title"><span><Table2 size={16} />{activeSet?.name ?? 'Vyberte uloženou sadu'}</span>{activeSet && <span className="blue-badge">{activeSet.strength}-way</span>}</div></div><div className="locked-banner"><span><Save size={12} />Sady se načítají a ukládají přes API.</span></div><div className="matrix-scroll"><div className="table-card"><table><thead><tr><th className="id-col">ID</th>{model.parameters.map((parameter) => <th key={parameter.id}>{parameter.name}</th>)}</tr></thead><tbody>{activeSet?.tests.length ? activeSet.tests.map((row, index) => <tr key={`${activeSet.id}-${index}`}><td className="id-col">{index + 1}</td>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td className="empty-matrix" colSpan={model.parameters.length + 1}>{activeSet ? 'Sada neobsahuje scénáře.' : 'Zatím není vybraná žádná sada scénářů.'}</td></tr>}</tbody></table></div></div></section></div></main></div>
    {message && <div className={`toast ${message.includes('API') || message.includes('chyba') ? 'error-toast' : ''}`} role="status"><Check size={15} /><span>{message}</span></div>}
    {modal && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><div className="dialog-header"><h2 id="auth-title"><LogIn size={16} />{registering ? 'Registrace' : 'Přihlášení'}</h2><button className="quiet-icon" onClick={() => setModal(false)} aria-label="Zavřít"><X size={16} /></button></div><p className="modal-description">Přihlášení a registrace probíhají přes API. Heslo se neposílá nikam jinam.</p><form className="api-auth-form" onSubmit={submitAuth}>{registering && <label>Uživatelské jméno<input required maxLength={128} value={username} onChange={(event) => setUsername(event.target.value)} /></label>}<label>E-mail<input required type="email" maxLength={256} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Heslo<input required type="password" minLength={registering ? 15 : undefined} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="modal-actions"><button className="primary-button" type="submit">{registering ? 'Zaregistrovat se' : 'Přihlásit se'}</button><button className="outline-button" type="button" onClick={() => setRegistering((value) => !value)}>{registering ? 'Mám účet' : 'Vytvořit účet'}</button></div></form></section></div>}
  </div>
}

function ParameterRow({ parameter, disabled, onRename, onDelete, onAdd, onRemove }: { parameter: Parameter; disabled: boolean; onRename: (name: string) => void; onDelete: () => void; onAdd: (value: string) => void; onRemove: (value: string) => void }) {
  const [value, setValue] = useState('')
  return <article className="parameter-card"><div className="parameter-head"><label className="parameter-name"><span>{parameter.name}</span><input aria-label={`Název parametru ${parameter.name}`} key={parameter.name} defaultValue={parameter.name} onBlur={(event) => onRename(event.target.value)} maxLength={256} disabled={disabled} /></label><div className="parameter-meta"><span>{parameter.values.length} hodnot</span><button className="quiet-icon" disabled={disabled} onClick={onDelete} aria-label={`Smazat parametr ${parameter.name}`}><Trash2 size={14} /></button></div></div><div className="value-tags">{parameter.values.map((item) => <span className="value-tag" key={item}>{item}<button disabled={disabled} onClick={() => onRemove(item)} aria-label={`Odebrat ${item}`}><X size={12} /></button></span>)}</div><form className="add-value" onSubmit={(event) => { event.preventDefault(); if (value) { onAdd(value); setValue('') } }}><input aria-label={`Nová hodnota pro ${parameter.name}`} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Nová hodnota…" maxLength={512} disabled={disabled || parameter.values.length >= 100} /><button disabled={disabled || parameter.values.length >= 100}><Plus size={13} /> Přidat</button></form></article>
}
