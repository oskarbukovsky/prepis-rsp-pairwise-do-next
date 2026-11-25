'use client'

import { useState, type FormEvent } from 'react'
import { AlertTriangle, Check, FileCode2, FolderPlus, Layers, LogIn, LogOut, Plus, Save, SlidersHorizontal, Table2, Trash2, UserCheck, UserX, X } from 'lucide-react'

export type Parameter = { id: string; name: string; values: string[] }
export type TestSet = { id: string; name: string; strength: number; tests: string[][] }
export type Model = { id: string; name: string; parameters: Parameter[]; sets: TestSet[] }

export type PairwiseViewState = {
  models: Model[]
  selectedName: string
  activeSetName: string
  user: string | null
  apiUnavailable: boolean
  loading: boolean
  message: string
  modal: boolean
  registering: boolean
  username: string
  email: string
  password: string
  newModelName: string
  newParameterName: string
  newSetName: string
  strength: number
  isGenerating: boolean
  workerActive: boolean
  generationProgress: string
  generationNotice: string
  model: Model
  activeSet: TestSet | null
}

export type PairwiseViewActions = {
  retryApi: () => void
  logout: () => void
  openAuth: () => void
  closeAuth: () => void
  createModel: (event: FormEvent<HTMLFormElement>) => void
  selectModel: (name: string) => void
  loadSet: (name: string) => void
  deleteSet: (name: string) => void
  deleteModel: () => void
  renameModel: (name: string) => void
  changeStrength: (strength: number) => void
  changeNewSetName: (name: string) => void
  generateSet: () => void
  cancelGeneration: () => void
  createParameter: (event: FormEvent<HTMLFormElement>) => void
  renameParameter: (oldName: string, newName: string) => void
  deleteParameter: (name: string) => void
  addValue: (parameterName: string, value: string) => void
  removeValue: (parameterName: string, value: string) => void
  submitAuth: (event: FormEvent<HTMLFormElement>) => void
  toggleRegistration: () => void
  changeUsername: (username: string) => void
  changeEmail: (email: string) => void
  changePassword: (password: string) => void
  changeNewModelName: (name: string) => void
  changeNewParameterName: (name: string) => void
}

export function RspPairwiseView({ state, actions }: { state: PairwiseViewState; actions: PairwiseViewActions }) {
  const { models, selectedName, activeSetName, user, apiUnavailable, loading, message, modal, registering, username, email, password, newModelName, newParameterName, newSetName, strength, isGenerating, workerActive, generationProgress, generationNotice, model, activeSet } = state

  if (apiUnavailable) {
    return <main className="app-shell dark-mode"><section className="error-screen" role="alert"><div className="error-icon"><AlertTriangle size={30} /></div><h1>API není dostupné</h1><p>{message || 'Aplikace se nemůže spojit se službou. Zkontrolujte, zda API běží, a zkuste to znovu.'}</p><button className="primary-button" onClick={actions.retryApi}>Zkusit znovu</button></section></main>
  }

  return <div className="app-shell dark-mode">
    <header className="topbar">
      <div className="brand-area">
        <div className="brand"><span className="brand-mark"><Layers size={15} /></span><strong>RSP Pairwise</strong><span className="prototype-label">Statický klient</span></div>
        <span className="divider" />
        <div className="context-label"><span>ČVUT FEL PM2</span><span>/</span><strong>Webová alternativa ACTS 3.2</strong></div>
      </div>
      <div className="top-actions">
        {user ? <div className="user-badge logged"><UserCheck size={14} /><span>Uživatel: <strong>{user}</strong></span><button aria-label="Odhlásit se" onClick={actions.logout}><LogOut size={14} /></button></div> : <div className="user-badge guest"><UserX size={14} /><span>Režim: <strong>Nepřihlášen</strong></span><button onClick={actions.openAuth}><LogIn size={14} /> Přihlásit</button></div>}
      </div>
    </header>

    <div className="app-body">
      <aside className="sidebar">
        <section className="sidebar-section models-section">
          <div className="section-heading"><span>Moje modely</span><FolderPlus size={16} /></div>
          {user && <form className="api-inline-form" onSubmit={actions.createModel}><input aria-label="Název nového modelu" value={newModelName} onChange={(event) => actions.changeNewModelName(event.target.value)} placeholder="Název modelu" maxLength={256} /><button title="Vytvořit model"><Plus size={14} /></button></form>}
          <div className="model-list">
            {models.map((item) => <button key={item.id} className={`model-item ${item.name === selectedName ? 'active' : ''}`} onClick={() => actions.selectModel(item.name)}><span><FileCode2 size={14} /><span className="truncate">{item.name}</span></span><small>{item.parameters.length} p</small></button>)}
            {!loading && user && !models.length && <p className="empty-note">Zatím nemáte žádný model.</p>}
            {!user && <p className="empty-note">Pro načtení modelů se přihlaste.</p>}
          </div>
        </section>
        <section className="sidebar-section set-section">
          <div className="section-heading"><span>Uložené sady testů</span><span className="count-badge">{model.sets.length}</span></div>
          <div className="set-list">
            {model.sets.map((item) => <div className={`set-item ${item.name === activeSetName ? 'active' : ''}`} key={item.id}><button className="api-set-select" onClick={() => actions.loadSet(item.name)}><span className="set-title"><strong>{item.name}</strong></span><span className="set-meta"><em>{item.strength}-way</em></span></button><button className="quiet-icon" aria-label={`Smazat sadu ${item.name}`} onClick={() => actions.deleteSet(item.name)}><Trash2 size={13} /></button></div>)}
            {!model.sets.length && <p className="empty-note">Žádné uložené sady.</p>}
          </div>
        </section>
        <footer className="sidebar-footer"><button className="delete-model" disabled={!model.name} onClick={actions.deleteModel}><Trash2 size={14} />Smazat tento model</button></footer>
      </aside>

      <main className="workspace">
        <section className="workspace-toolbar">
          <div className="model-title">
            <label htmlFor="model-name">Název modelu systému<input id="model-name" key={model.name} defaultValue={model.name} onBlur={(event) => actions.renameModel(event.target.value)} disabled={!model.name || !user} /></label>
            <div className="parameter-count">Počet parametrů: <strong>{model.parameters.length} / 100</strong></div>
          </div>
          <div className="generator-panel">
            <label>Síla pokrytí (N-way)<select value={strength} disabled={isGenerating} onChange={(event) => actions.changeStrength(Number(event.target.value))}>{[2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}-way</option>)}</select></label>
            <label>Název nové sady<input value={newSetName} onChange={(event) => actions.changeNewSetName(event.target.value)} placeholder="např. Pairwise produkce" maxLength={256} /></label>
            <button className="generate-button" disabled={isGenerating || !user || !model.name || !model.parameters.length || model.parameters.some((parameter) => !parameter.values.length)} aria-busy={isGenerating} onClick={actions.generateSet}><Table2 size={14} />{isGenerating ? 'Generuji…' : 'Generovat a uložit sadu'}</button>
            {(generationNotice || generationProgress || isGenerating) && <div className="generation-feedback" role="status" aria-live="polite">{generationNotice && <span className="generation-warning">{generationNotice}</span>}{generationProgress && <span>{generationProgress}</span>}{workerActive && <button className="outline-button generation-cancel" type="button" onClick={actions.cancelGeneration}>Zrušit výpočet</button>}</div>}
          </div>
        </section>

        <div className="split-workspace">
          <section className="parameters-panel">
            <div className="panel-heading"><span><SlidersHorizontal size={16} />Parametry a třídy ekvivalence</span></div>
            {user && model.name && <form className="api-inline-form" onSubmit={actions.createParameter}><input aria-label="Název nového parametru" value={newParameterName} onChange={(event) => actions.changeNewParameterName(event.target.value)} placeholder="Název parametru" maxLength={256} /><button title="Přidat parametr" disabled={model.parameters.length >= 100}><Plus size={14} /> Přidat</button></form>}
            <div className="parameters-list">
              {model.parameters.map((parameter) => <ParameterRow key={parameter.id} parameter={parameter} disabled={!user} onRename={(name) => actions.renameParameter(parameter.name, name)} onDelete={() => actions.deleteParameter(parameter.name)} onAdd={(value) => actions.addValue(parameter.name, value)} onRemove={(value) => actions.removeValue(parameter.name, value)} />)}
              {!model.parameters.length && <p className="empty-note">{loading ? 'Načítání dat…' : user ? 'Vyberte nebo vytvořte model.' : 'Po přihlášení se zobrazí vaše modely a parametry.'}</p>}
            </div>
          </section>

          <section className="matrix-panel">
            <div className="panel-heading matrix-heading"><div className="matrix-title"><span><Table2 size={16} />{activeSet?.name ?? 'Vyberte uloženou sadu'}</span>{activeSet && <span className="blue-badge">{activeSet.strength}-way</span>}</div></div>
            <div className="locked-banner"><span><Save size={12} />Sady se načítají a ukládají přes API.</span></div>
            <div className="matrix-scroll"><div className="table-card"><table><thead><tr><th className="id-col">ID</th>{model.parameters.map((parameter) => <th key={parameter.id}>{parameter.name}</th>)}</tr></thead><tbody>{activeSet?.tests.length ? activeSet.tests.map((row, index) => <tr key={`${activeSet.id}-${index}`}><td className="id-col">{index + 1}</td>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td className="empty-matrix" colSpan={model.parameters.length + 1}>{activeSet ? 'Sada neobsahuje scénáře.' : 'Zatím není vybraná žádná sada scénářů.'}</td></tr>}</tbody></table></div></div>
          </section>
        </div>
      </main>
    </div>

    {message && <div className={`toast ${message.includes('API') || message.includes('chyba') ? 'error-toast' : ''}`} role="status"><Check size={15} /><span>{message}</span></div>}
    {modal && <div className="modal-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><div className="dialog-header"><h2 id="auth-title"><LogIn size={16} />{registering ? 'Registrace' : 'Přihlášení'}</h2><button className="quiet-icon" onClick={actions.closeAuth} aria-label="Zavřít"><X size={16} /></button></div><p className="modal-description">Přihlášení a registrace probíhají přes API. Heslo se neposílá nikam jinam.</p><form className="api-auth-form" onSubmit={actions.submitAuth}>{registering && <label>Uživatelské jméno<input required maxLength={128} value={username} onChange={(event) => actions.changeUsername(event.target.value)} /></label>}<label>E-mail<input required type="email" maxLength={256} autoComplete="email" value={email} onChange={(event) => actions.changeEmail(event.target.value)} /></label><label>Heslo<input required type="password" minLength={registering ? 15 : undefined} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(event) => actions.changePassword(event.target.value)} /></label><div className="modal-actions"><button className="primary-button" type="submit">{registering ? 'Zaregistrovat se' : 'Přihlásit se'}</button><button className="outline-button" type="button" onClick={actions.toggleRegistration}>{registering ? 'Mám účet' : 'Vytvořit účet'}</button></div></form></section></div>}
  </div>
}

function ParameterRow({ parameter, disabled, onRename, onDelete, onAdd, onRemove }: { parameter: Parameter; disabled: boolean; onRename: (name: string) => void; onDelete: () => void; onAdd: (value: string) => void; onRemove: (value: string) => void }) {
  const [value, setValue] = useState('')
  return <article className="parameter-card"><div className="parameter-head"><label className="parameter-name"><span>{parameter.name}</span><input aria-label={`Název parametru ${parameter.name}`} key={parameter.name} defaultValue={parameter.name} onBlur={(event) => onRename(event.target.value)} maxLength={256} disabled={disabled} /></label><div className="parameter-meta"><span>{parameter.values.length} hodnot</span><button className="quiet-icon" disabled={disabled} onClick={onDelete} aria-label={`Smazat parametr ${parameter.name}`}><Trash2 size={14} /></button></div></div><div className="value-tags">{parameter.values.map((item) => <span className="value-tag" key={item}>{item}<button disabled={disabled} onClick={() => onRemove(item)} aria-label={`Odebrat ${item}`}><X size={12} /></button></span>)}</div><form className="add-value" onSubmit={(event) => { event.preventDefault(); if (value) { onAdd(value); setValue('') } }}><input aria-label={`Nová hodnota pro ${parameter.name}`} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Nová hodnota…" maxLength={512} disabled={disabled || parameter.values.length >= 100} /><button disabled={disabled || parameter.values.length >= 100}><Plus size={13} /> Přidat</button></form></article>
}
