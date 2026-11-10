'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  Download,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileUp,
  FolderPlus,
  HelpCircle,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Play,
  Plus,
  Save,
  SlidersHorizontal,
  Sun,
  Table2,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  X,
} from 'lucide-react'

type Parameter = { id: number; name: string; values: string[] }
type TestSet = { id: number; name: string; strength: number; tests: string[][] }
type Model = { id: number; name: string; parameters: Parameter[]; sets: TestSet[]; activeSetId: number | null }

type Modal = 'auth' | 'import' | 'help' | null

const initialModels: Model[] = [
  {
    id: 1,
    name: 'E-shop Platba & Doprava',
    parameters: [
      { id: 101, name: 'Typ platby', values: ['Platební karta', 'Bankovní převod', 'Dobírka', 'Apple Pay'] },
      { id: 102, name: 'Měna', values: ['CZK', 'EUR', 'USD'] },
      { id: 103, name: 'Způsob doručení', values: ['Kurýr DPD', 'Zásilkovna', 'Osobní odběr'] },
    ],
    sets: [
      {
        id: 201,
        name: 'Sada 1 (Pairwise základ)',
        strength: 2,
        tests: [
          ['Platební karta', 'CZK', 'Kurýr DPD'], ['Bankovní převod', 'EUR', 'Kurýr DPD'], ['Dobírka', 'USD', 'Zásilkovna'],
          ['Apple Pay', 'CZK', 'Osobní odběr'], ['Platební karta', 'EUR', 'Zásilkovna'], ['Bankovní převod', 'USD', 'Osobní odběr'],
          ['Dobírka', 'CZK', 'Kurýr DPD'], ['Apple Pay', 'EUR', 'Kurýr DPD'], ['Platební karta', 'USD', 'Osobní odběr'],
          ['Bankovní převod', 'CZK', 'Zásilkovna'], ['Dobírka', 'EUR', 'Osobní odběr'], ['Apple Pay', 'USD', 'Zásilkovna'],
        ],
      },
      {
        id: 202,
        name: 'Sada 2 (3-way plné pokrytí)',
        strength: 3,
        tests: [
          ['Platební karta', 'CZK', 'Kurýr DPD'], ['Platební karta', 'CZK', 'Zásilkovna'], ['Platební karta', 'CZK', 'Osobní odběr'],
          ['Platební karta', 'EUR', 'Kurýr DPD'], ['Bankovní převod', 'CZK', 'Kurýr DPD'], ['Bankovní převod', 'EUR', 'Zásilkovna'],
          ['Dobírka', 'CZK', 'Osobní odběr'], ['Apple Pay', 'USD', 'Kurýr DPD'],
        ],
      },
    ],
    activeSetId: 201,
  },
  { id: 2, name: 'Uživatelská registrace', parameters: [{ id: 301, name: 'Typ účtu', values: ['Osobní', 'Firemní'] }, { id: 302, name: 'Stát', values: ['Česko', 'Slovensko', 'Jiné'] }], sets: [], activeSetId: null },
]

function makeTests(parameters: Parameter[]) {
  if (parameters.length === 1) return parameters[0].values.map((value) => [value])
  const result: string[][] = []
  parameters[0].values.forEach((first, i) => {
    parameters[1].values.forEach((second, j) => {
      result.push([first, second, ...parameters.slice(2).map((parameter, index) => parameter.values[(i + j + index) % parameter.values.length])])
    })
  })
  return result.slice(0, 25)
}

export function RspPairwise() {
  const [models, setModels] = useState(initialModels)
  const [activeModelId, setActiveModelId] = useState(1)
  const [modal, setModal] = useState<Modal>(null)
  const [dark, setDark] = useState(true)
  const [user, setUser] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [strength, setStrength] = useState('2')
  const [setName, setSetName] = useState('')
  const [loginEmail, setLoginEmail] = useState('jan.novak@fel.cvut.cz')
  const [loginPassword, setLoginPassword] = useState('secret123')
  const [importFileName, setImportFileName] = useState('')
  const [calculating, setCalculating] = useState(false)

  const model = models.find((item) => item.id === activeModelId) ?? models[0]
  const activeSet = model.sets.find((item) => item.id === model.activeSetId) ?? null
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2800) }
  const updateModel = (updater: (current: Model) => Model) => setModels((current) => current.map((item) => item.id === activeModelId ? updater(item) : item))

  const updateParameter = (parameterId: number, updater: (parameter: Parameter) => Parameter) => updateModel((current) => ({ ...current, parameters: current.parameters.map((parameter) => parameter.id === parameterId ? updater(parameter) : parameter) }))

  const createModel = () => {
    const id = Date.now()
    setModels((current) => [...current, { id, name: `Nový model (${current.length + 1})`, parameters: [{ id: id + 1, name: 'Parametr_1', values: ['Hodnota A', 'Hodnota B'] }], sets: [], activeSetId: null }])
    setActiveModelId(id)
    notify('Nový model byl vytvořen.')
  }

  const generate = () => {
    if (model.parameters.some((parameter) => parameter.values.length === 0)) { notify('Chyba: Každý parametr musí mít alespoň jednu hodnotu.'); return }
    const requested = Number(strength)
    const effective = Math.min(requested, model.parameters.length)
    if (effective !== requested) notify(`Fallback: Síla byla upravena na ${effective}-way.`)
    setCalculating(true)
    window.setTimeout(() => {
      const id = Date.now()
      const name = setName.trim() || `Sada ${effective}-way (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      updateModel((current) => ({ ...current, sets: [...current.sets, { id, name, strength: effective, tests: makeTests(current.parameters) }], activeSetId: id }))
      setSetName('')
      setCalculating(false)
      notify(`Vytvořena nová sada „${name}“.`)
    }, 650)
  }

  const exportScenarios = (format: 'csv' | 'json') => {
    if (!activeSet) { notify('Nejdříve vyberte nebo vygenerujte sadu testů.'); return }
    const content = format === 'json'
      ? JSON.stringify({ model: model.name, set: activeSet.name, strength: activeSet.strength, tests: activeSet.tests }, null, 2)
      : [model.parameters.map((parameter) => parameter.name).join(','), ...activeSet.tests.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))].join('\n')
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `${activeSet.name}.${format}`; link.click(); URL.revokeObjectURL(url)
    notify(`Export ${format.toUpperCase()} byl připraven.`)
  }

  const deleteModel = () => {
    if (models.length === 1) { notify('Alespoň jeden model musí zůstat.'); return }
    const next = models.filter((item) => item.id !== activeModelId)
    setModels(next); setActiveModelId(next[0].id); notify('Model byl odstraněn.')
  }

  const importDemo = () => { setModal(null); setActiveModelId(1); notify('Ukázkový model E-shop byl načten.') }

  const login = () => { setUser(loginEmail || 'jan.novak@fel.cvut.cz'); setModal(null); notify('Přihlášení je připravené pro napojení na API.') }

  return (
    <div className={dark ? 'app-shell dark-mode' : 'app-shell light-mode'}>
      <header className="topbar">
        <div className="brand-area">
          <div className="brand"><span className="brand-mark"><Layers size={15} /></span><strong>RSP Pairwise</strong><span className="prototype-label">GUI Prototyp</span></div>
          <span className="divider" />
          <div className="context-label"><span>ČVUT FEL PM2</span><span>/</span><strong>Webová alternativa ACTS 3.2</strong></div>
        </div>
        <div className="top-actions">
          <div className="button-group import-actions"><button className="toolbar-button" onClick={() => setModal('import')}><Upload size={14} />Import modelu</button><button className="toolbar-button" onClick={() => notify('Export modelu bude napojen na API.') }><Download size={14} />Export modelu</button></div>
          <button className="primary-button" onClick={() => notify(user ? 'Model připraven k uložení do API.' : 'Pro trvalé uložení se přihlaste.')}><Save size={14} />Uložit model</button>
          <span className="divider" />
          <button className="icon-button" onClick={() => setDark((value) => !value)} title="Přepnout režim">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button className="icon-button" onClick={() => setModal('help')} title="Nápověda"><HelpCircle size={16} /></button>
          <span className="divider" />
          {user ? <div className="user-badge logged"><UserCheck size={14} /><span>Uživatel: <strong>{user}</strong></span><button aria-label="Odhlásit se" onClick={() => { setUser(null); notify('Byli jste odhlášeni.') }}><LogOut size={14} /></button></div> : <div className="user-badge guest"><UserX size={14} /><span>Režim: <strong>Host (v paměti)</strong></span><button onClick={() => setModal('auth')}>Přihlásit se</button></div>}
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <section className="sidebar-section models-section"><div className="section-heading"><span>Moje modely</span><button className="quiet-icon" onClick={createModel} title="Vytvořit nový model"><FolderPlus size={16} /></button></div><div className="model-list">{models.map((item) => <button key={item.id} className={`model-item ${item.id === activeModelId ? 'active' : ''}`} onClick={() => setActiveModelId(item.id)}><span><FileCode2 size={14} /><span className="truncate">{item.name}</span></span><small>{item.parameters.length} p</small></button>)}</div></section>
          <section className="sidebar-section set-section"><div className="section-heading"><span>Uložené sady testů</span><span className="count-badge">{model.sets.length}</span></div><div className="set-list">{model.sets.length === 0 ? <p className="empty-note">Žádné vygenerované sady testů</p> : model.sets.map((item) => <button key={item.id} className={`set-item ${item.id === model.activeSetId ? 'active' : ''}`} onClick={() => updateModel((current) => ({ ...current, activeSetId: item.id }))}><span className="set-title"><strong>{item.name}</strong><Trash2 size={13} onClick={(event) => { event.stopPropagation(); updateModel((current) => ({ ...current, sets: current.sets.filter((set) => set.id !== item.id), activeSetId: current.activeSetId === item.id ? (current.sets.find((set) => set.id !== item.id)?.id ?? null) : current.activeSetId })); notify('Sada byla odstraněna.') }} /></span><span className="set-meta"><em>{item.strength}-way</em><span>•</span><span>{item.tests.length} testů</span></span></button>)}</div></section>
          <footer className="sidebar-footer"><button className="delete-model" onClick={deleteModel}><Trash2 size={14} />Smazat tento model</button><span>DFR-06 Hard Delete</span></footer>
        </aside>

        <main className="workspace">
          <section className="workspace-toolbar"><div className="model-title"><label htmlFor="model-name">Název modelu systému</label><input id="model-name" value={model.name} onChange={(event) => updateModel((current) => ({ ...current, name: event.target.value }))} onBlur={() => setModels((current) => [...current])} /><div className="parameter-count">Počet parametrů: <strong>{model.parameters.length} / 100</strong></div></div><div className="generator-panel"><label>Síla pokrytí (N-way)<select value={strength} onChange={(event) => setStrength(event.target.value)}><option value="2">2-way (Pairwise)</option><option value="3">3-way</option><option value="4">4-way</option><option value="5">5-way</option><option value="6">6-way</option></select></label><label>Název nové sady<input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="např. Sada Pairwise Produkce" /></label><button className="generate-button" onClick={generate}><Play size={14} fill="currentColor" />Generovat scénáře (IPOG)</button></div></section>
          <div className="split-workspace">
            <section className="parameters-panel"><div className="panel-heading"><span><SlidersHorizontal size={16} />Parametry a Třídy ekvivalence</span><button className="outline-button" onClick={() => { if (model.parameters.length >= 100) { notify('Dosažen limit 100 parametrů.'); return } updateModel((current) => ({ ...current, parameters: [...current.parameters, { id: Date.now(), name: `Parametr_${current.parameters.length + 1}`, values: ['Hodnota A', 'Hodnota B'] }] })); notify('Parametr byl přidán.') }}><Plus size={14} />Přidat parametr</button></div><div className="parameters-list">{model.parameters.map((parameter, index) => <ParameterCard key={parameter.id} parameter={parameter} index={index} onRename={(name) => updateParameter(parameter.id, (current) => ({ ...current, name: name.trim() || current.name }))} onDelete={() => { if (model.parameters.length <= 1) { notify('Model musí obsahovat alespoň jeden parametr.'); return } updateModel((current) => ({ ...current, parameters: current.parameters.filter((item) => item.id !== parameter.id) })) }} onAdd={(value) => { const next = value.trim(); if (!next) return; if (parameter.values.includes(next)) { notify('Tato hodnota již existuje.'); return } if (parameter.values.length >= 100) { notify('Dosažen limit 100 hodnot.'); return } updateParameter(parameter.id, (current) => ({ ...current, values: [...current.values, next] })) }} onRemove={(valueIndex) => { if (parameter.values.length <= 1) { notify('Parametr musí mít alespoň jednu hodnotu.'); return } updateParameter(parameter.id, (current) => ({ ...current, values: current.values.filter((_, itemIndex) => itemIndex !== valueIndex) })) }} />)}</div></section>
            <section className="matrix-panel"><div className="panel-heading matrix-heading"><div className="matrix-title"><span><Table2 size={16} />{activeSet?.name ?? 'Žádná vybraná sada testů'}</span><span className="blue-badge">{activeSet ? `${activeSet.strength}-way` : '0-way'}</span><span className="neutral-badge">{activeSet ? `${activeSet.tests.length} řádků` : '0 testů'}</span></div><div className="export-actions"><span>Export scénářů:</span><button className="small-button" onClick={() => exportScenarios('csv')}><FileSpreadsheet size={14} />CSV</button><button className="small-button" onClick={() => exportScenarios('json')}><FileJson size={14} />JSON</button></div></div><div className="locked-banner"><span><Lock size={12} />Vygenerované scénáře nelze ručně měnit (pouze prohlížet, exportovat nebo celou sadu smazat).</span>{activeSet && <button onClick={() => { updateModel((current) => ({ ...current, sets: current.sets.filter((item) => item.id !== activeSet.id), activeSetId: current.sets.find((item) => item.id !== activeSet.id)?.id ?? null })); notify('Aktivní sada byla odstraněna.') }}>Smazat tuto sadu</button>}</div><div className="matrix-scroll"><div className="table-card"><table><thead><tr><th className="id-col">ID</th>{model.parameters.map((parameter) => <th key={parameter.id}>{parameter.name}</th>)}</tr></thead><tbody>{activeSet ? activeSet.tests.map((row, rowIndex) => <tr key={`${activeSet.id}-${rowIndex}`}><td className="id-col">{rowIndex + 1}</td>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}</tr>) : <tr><td colSpan={model.parameters.length + 1} className="empty-matrix">Spusťte výpočet IPOG tlačítkem výše pro vygenerování testovacích scénářů.</td></tr>}</tbody></table></div></div></section>
          </div>
        </main>
      </div>

      {calculating && <div className="modal-backdrop"><div className="calculation-modal"><div className="loader-icon"><Play size={22} fill="currentColor" /></div><h2>Výpočet algoritmu IPOG</h2><p>Generování kombinací probíhá v neblokujícím Web Workeru na pozadí...</p><div className="progress-track"><span /></div></div></div>}
      {modal === 'auth' && <ModalShell title="Přihlášení / Registrace" icon={<LogIn size={16} />} onClose={() => setModal(null)}><p className="modal-description">Po přihlášení získáte možnost trvale ukládat modely a scénáře do PostgreSQL databáze.</p><label>E-mail nebo uživatelské jméno<input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label><label>Heslo<input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label><div className="modal-actions"><button className="primary-button" onClick={login}>Přihlásit se</button><button className="outline-button" onClick={() => setModal(null)}>Zrušit</button></div></ModalShell>}
      {modal === 'import' && <ModalShell title="Importovat model ze souboru" icon={<FileUp size={16} />} onClose={() => setModal(null)}><p className="modal-description">Podporované formáty: <strong>XML, JSON</strong>. Soubor nesmí obsahovat více než 100 parametrů.</p><label className="drop-zone"><Upload size={28} /><span>{importFileName || 'Klikněte pro výběr souboru'}</span><small>nebo přetáhněte model.json / model.xml sem</small><input type="file" accept=".json,.xml" onChange={(event) => setImportFileName(event.target.files?.[0]?.name ?? '')} /></label><div className="modal-actions"><button className="primary-button" onClick={importDemo}>Nahrát ukázkový model</button><button className="outline-button" onClick={() => setModal(null)}>Zavřít</button></div></ModalShell>}
      {modal === 'help' && <ModalShell title="Nápověda k ovládání aplikace" icon={<HelpCircle size={16} />} onClose={() => setModal(null)} wide><div className="help-list"><article><strong>Co je to Třída ekvivalence?</strong><p>Každý parametr se skládá z tříd ekvivalence, které reprezentují vstupy systému.</p></article><article><strong>Síla pokrytí (N-way) a Fallback</strong><p>Při 2-way testování generátor pokryje všechny dvojice hodnot. Vyšší síla než počet parametrů se automaticky sníží.</p></article><article><strong>Pravidla a limity</strong><p>Maximálně 100 parametrů na model a 100 tříd ekvivalence na parametr. Export a import modelu probíhá odděleně od exportu scénářů.</p></article></div><div className="modal-actions"><button className="primary-button" onClick={() => setModal(null)}>Rozumím</button></div></ModalShell>}
      {toast && <div className="toast"><Check size={15} /><span>{toast}</span></div>}
    </div>
  )
}

function ParameterCard({ parameter, index, onRename, onDelete, onAdd, onRemove }: { parameter: Parameter; index: number; onRename: (value: string) => void; onDelete: () => void; onAdd: (value: string) => void; onRemove: (index: number) => void }) {
  const [value, setValue] = useState('')
  return <article className="parameter-card"><div className="parameter-head"><div className="parameter-name"><span>#{index + 1}</span><input value={parameter.name} onChange={(event) => onRename(event.target.value)} /></div><div className="parameter-meta"><span>{parameter.values.length} / 100 hodnot</span><button className="quiet-icon" onClick={onDelete} title="Smazat parametr"><Trash2 size={14} /></button></div></div><div className="value-tags">{parameter.values.map((item, valueIndex) => <span className="value-tag" key={`${item}-${valueIndex}`}>{item}<button onClick={() => onRemove(valueIndex)} aria-label={`Odebrat ${item}`}><X size={12} /></button></span>)}</div><div className="add-value"><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { onAdd(value); setValue('') } }} placeholder="Nová třída ekvivalence (hodnota)..." /><button onClick={() => { onAdd(value); setValue('') }}>+ Přidat</button></div></article>
}

function ModalShell({ title, icon, onClose, children, wide = false }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}><div className={`dialog ${wide ? 'wide' : ''}`}><div className="dialog-header"><h2>{icon}{title}</h2><button className="quiet-icon" onClick={onClose} aria-label="Zavřít"><X size={16} /></button></div>{children}</div></div>
}
