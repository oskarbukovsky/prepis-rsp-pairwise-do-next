'use client'

import { useState } from 'react'
import {
  AlertTriangle,
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

type Modal =
  | 'auth'
  | 'import'
  | 'export-model'
  | 'confirm-delete-model'
  | 'confirm-delete-set'
  | 'help'
  | null

type ImportMode = 'model' | 'scenarios'

const MAX_PARAMETERS = 100
const MAX_VALUES_PER_PARAM = 100

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
  {
    id: 2,
    name: 'Uživatelská registrace',
    parameters: [
      { id: 301, name: 'Typ účtu', values: ['Osobní', 'Firemní'] },
      { id: 302, name: 'Stát', values: ['Česko', 'Slovensko', 'Jiné'] },
    ],
    sets: [],
    activeSetId: null,
  },
]

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^\w\-_.()]/g, '') || 'export'
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function makeTests(parameters: Parameter[]) {
  if (parameters.length === 1) return parameters[0].values.map((value) => [value])
  const result: string[][] = []
  parameters[0].values.forEach((first, i) => {
    parameters[1].values.forEach((second, j) => {
      result.push([
        first,
        second,
        ...parameters.slice(2).map((parameter, index) => parameter.values[(i + j + index) % parameter.values.length]),
      ])
    })
  })
  return result.slice(0, 25)
}

/**
 * Validates parsed model structure and enforces DFR-01, DFR-03, DFR-16 limits (1..100 parameters, 1..100 values).
 */
function validateAndBuildModel(
  rawName: unknown,
  rawParameters: unknown
): { ok: true; model: Model } | { ok: false; error: string } {
  const modelName = typeof rawName === 'string' ? rawName.trim() : ''
  if (!modelName) {
    return {
      ok: false,
      error: 'Strukturální chyba: V souboru chybí platný neprázdný název modelu (atribut „name“ nebo pole „modelName“).',
    }
  }

  if (!Array.isArray(rawParameters)) {
    return {
      ok: false,
      error: 'Strukturální chyba: Soubor neobsahuje pole parametrů modelu („parameters“ / „<Parameters>“).',
    }
  }

  if (rawParameters.length === 0) {
    return {
      ok: false,
      error: 'Strukturální chyba: Model musí obsahovat alespoň 1 parametr (nalezeno 0 parametrů).',
    }
  }

  if (rawParameters.length > MAX_PARAMETERS) {
    return {
      ok: false,
      error: `Chyba limitu (DFR-16): Soubor obsahuje ${rawParameters.length} parametrů, čímž překračuje pevný limit ${MAX_PARAMETERS} parametrů na model. Import celého souboru byl zablokován.`,
    }
  }

  const seenParamNames = new Set<string>()
  const baseId = Date.now()
  const builtParams: Parameter[] = []

  for (let i = 0; i < rawParameters.length; i++) {
    const item = rawParameters[i]
    if (!item || typeof item !== 'object') {
      return {
        ok: false,
        error: `Strukturální chyba: Parametr na pozici #${i + 1} nemá platnou objektovou strukturu.`,
      }
    }

    const pObj = item as Record<string, unknown>
    const pName = typeof pObj.name === 'string' ? pObj.name.trim() : ''
    if (!pName) {
      return {
        ok: false,
        error: `Strukturální chyba: Parametr na pozici #${i + 1} má prázdný nebo chybějící název.`,
      }
    }

    if (seenParamNames.has(pName)) {
      return {
        ok: false,
        error: `Strukturální chyba (DFR-01): Duplicitní název parametru „${pName}“. Názvy parametrů v modelu musí být unikátní.`,
      }
    }
    seenParamNames.add(pName)

    const rawValues = Array.isArray(pObj.equivalenceClasses)
      ? pObj.equivalenceClasses
      : Array.isArray(pObj.values)
        ? pObj.values
        : null

    if (!rawValues) {
      return {
        ok: false,
        error: `Strukturální chyba: Parametr „${pName}“ neobsahuje seznam tříd ekvivalence („equivalenceClasses“ / „values“).`,
      }
    }

    if (rawValues.length === 0) {
      return {
        ok: false,
        error: `Strukturální chyba (DFR-01): Parametr „${pName}“ musí obsahovat alespoň 1 třídu ekvivalence.`,
      }
    }

    if (rawValues.length > MAX_VALUES_PER_PARAM) {
      return {
        ok: false,
        error: `Chyba limitu (DFR-16): Parametr „${pName}“ obsahuje ${rawValues.length} hodnot, čímž překračuje pevný limit ${MAX_VALUES_PER_PARAM} tříd ekvivalence na parametr. Import celého souboru byl zablokován.`,
      }
    }

    const seenValues = new Set<string>()
    const cleanValues: string[] = []

    for (let j = 0; j < rawValues.length; j++) {
      const val = rawValues[j]
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
        return {
          ok: false,
          error: `Strukturální chyba: Hodnota #${j + 1} u parametru „${pName}“ není platný textový řetězec.`,
        }
      }
      const trimmedVal = String(val).trim()
      if (!trimmedVal) {
        return {
          ok: false,
          error: `Strukturální chyba (DFR-01): Parametr „${pName}“ obsahuje prázdnou hodnotu třídy ekvivalence na pozici #${j + 1}.`,
        }
      }
      if (seenValues.has(trimmedVal)) {
        return {
          ok: false,
          error: `Strukturální chyba (DFR-01): Parametr „${pName}“ obsahuje duplicitní hodnotu „${trimmedVal}“.`,
        }
      }
      seenValues.add(trimmedVal)
      cleanValues.push(trimmedVal)
    }

    builtParams.push({
      id: baseId + i + 1,
      name: pName,
      values: cleanValues,
    })
  }

  return {
    ok: true,
    model: {
      id: baseId,
      name: modelName,
      parameters: builtParams,
      sets: [],
      activeSetId: null,
    },
  }
}

function parseModelFileContent(
  fileName: string,
  content: string
): { ok: true; model: Model } | { ok: false; error: string } {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.json')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Neplatný token'
      return {
        ok: false,
        error: `Syntaktická chyba (JSON): Soubor není platný JSON dokument (${detail}). Import byl zamítnut.`,
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'Strukturální chyba: Kořenový prvek JSON souboru musí být objekt s definicí modelu.',
      }
    }

    const obj = parsed as Record<string, unknown>
    const rawName = obj.modelName ?? obj.name
    const rawParams = obj.parameters
    return validateAndBuildModel(rawName, rawParams)
  }

  if (lower.endsWith('.xml')) {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(content, 'application/xml')
    const parserError = xmlDoc.querySelector('parsererror')
    if (parserError) {
      return {
        ok: false,
        error: 'Syntaktická chyba (XML): Soubor není syntakticky validní (well-formed) XML dokument. Zkontrolujte uzavření tagů a syntaxi.',
      }
    }

    const root = xmlDoc.documentElement
    if (!root || (root.tagName !== 'System' && root.tagName !== 'Model')) {
      return {
        ok: false,
        error: `Strukturální chyba (XML): Očekáván kořenový element <System name="...">, ale nalezen <${root?.tagName ?? 'neznámý'}>.`,
      }
    }

    const modelName = root.getAttribute('name') ?? root.querySelector(':scope > Name')?.textContent ?? ''
    const paramsContainer = root.querySelector(':scope > Parameters')
    if (!paramsContainer) {
      return {
        ok: false,
        error: 'Strukturální chyba (XML): V elementu <System> chybí povinná sekce <Parameters>.',
      }
    }

    const paramElements = Array.from(paramsContainer.children)
    if (paramElements.some((el) => el.tagName !== 'Parameter')) {
      return {
        ok: false,
        error: 'Strukturální chyba (XML): Sekce <Parameters> smí obsahovat pouze elementy <Parameter>.',
      }
    }

    const extractedParams = paramElements.map((paramEl) => {
      const pName = paramEl.getAttribute('name') ?? paramEl.querySelector(':scope > Name')?.textContent ?? ''
      const valuesContainer = paramEl.querySelector(':scope > values, :scope > Values')
      if (!valuesContainer) {
        return { name: pName, equivalenceClasses: null }
      }
      const valueElements = Array.from(valuesContainer.querySelectorAll(':scope > value, :scope > Value'))
      const values = valueElements.map((vEl) => vEl.textContent ?? '')
      return { name: pName, equivalenceClasses: values }
    })

    return validateAndBuildModel(modelName, extractedParams)
  }

  return {
    ok: false,
    error: 'Nepodporovaný formát souboru. Pro import modelu jsou povoleny pouze formáty .json a .xml (DFR-16).',
  }
}

function parseCsvLine(line: string): { ok: true; cells: string[] } | { ok: false; error: string } {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }

  if (inQuotes) {
    return { ok: false, error: 'Syntaktická chyba (CSV): Neuzavřené uvozovky v řádku CSV souboru.' }
  }
  cells.push(current.trim())
  return { ok: true, cells }
}

function parseScenariosFileContent(
  fileName: string,
  content: string,
  currentModel: Model
): { ok: true; testSet: TestSet; warning?: string } | { ok: false; error: string } {
  const lower = fileName.toLowerCase()
  const baseName = fileName.replace(/\.(csv|json|xml)$/i, '')

  let headers: string[] = []
  let rows: string[][] = []
  let strength = Math.min(2, Math.max(1, currentModel.parameters.length))
  let parsedSetName = baseName || `Importovaná sada (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`

  if (lower.endsWith('.json')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Neplatný token'
      return {
        ok: false,
        error: `Syntaktická chyba (JSON): Soubor scénářů není platný JSON dokument (${detail}).`,
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'Strukturální chyba (JSON): Kořenový prvek souboru scénářů musí být objekt.',
      }
    }

    const obj = parsed as Record<string, unknown>
    if (typeof obj.setName === 'string' && obj.setName.trim()) parsedSetName = obj.setName.trim()
    else if (typeof obj.set === 'string' && obj.set.trim()) parsedSetName = obj.set.trim()

    if (typeof obj.strength === 'number' && obj.strength >= 1 && obj.strength <= 6) {
      strength = obj.strength
    } else if (typeof obj.coverageStrength === 'string') {
      const match = obj.coverageStrength.match(/(\d+)/)
      if (match) strength = Math.min(6, Math.max(1, Number(match[1])))
    }

    if (Array.isArray(obj.tests)) {
      headers = Array.isArray(obj.parameters)
        ? obj.parameters.map((p) => String(p).trim())
        : currentModel.parameters.map((p) => p.name)
      for (let i = 0; i < obj.tests.length; i++) {
        const r = obj.tests[i]
        if (!Array.isArray(r)) {
          return { ok: false, error: `Strukturální chyba (JSON): Testovací scénář #${i + 1} v poli „tests“ není pole hodnot.` }
        }
        rows.push(r.map((cell) => String(cell)))
      }
    } else if (Array.isArray(obj.testCases)) {
      if (obj.testCases.length === 0) {
        return { ok: false, error: 'Strukturální chyba (JSON): Soubor scénářů neobsahuje žádné testovací případy.' }
      }
      headers = Array.isArray(obj.parameters)
        ? obj.parameters.map((p) => String(p).trim())
        : Object.keys(obj.testCases[0] as Record<string, unknown>)
      for (let i = 0; i < obj.testCases.length; i++) {
        const tc = obj.testCases[i]
        if (!tc || typeof tc !== 'object' || Array.isArray(tc)) {
          return { ok: false, error: `Strukturální chyba (JSON): Záznam #${i + 1} v „testCases“ není objekt.` }
        }
        const rec = tc as Record<string, unknown>
        rows.push(headers.map((h) => String(rec[h] ?? '')))
      }
    } else {
      return {
        ok: false,
        error: 'Strukturální chyba (JSON): Soubor scénářů musí obsahovat pole „tests“ nebo „testCases“.',
      }
    }
  } else if (lower.endsWith('.csv')) {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length < 2) {
      return {
        ok: false,
        error: 'Strukturální chyba (CSV): Soubor musí obsahovat hlavičku s názvy parametrů a alespoň 1 řádek scénáře.',
      }
    }

    const headerResult = parseCsvLine(lines[0])
    if (!headerResult.ok) return headerResult
    headers = headerResult.cells

    if (headers.some((h) => !h)) {
      return {
        ok: false,
        error: 'Strukturální chyba (CSV): Hlavička CSV obsahuje prázdný název sloupce (parametru).',
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const rowResult = parseCsvLine(lines[i])
      if (!rowResult.ok) return rowResult
      if (rowResult.cells.length !== headers.length) {
        return {
          ok: false,
          error: `Strukturální chyba (CSV): Řádek #${i + 1} má ${rowResult.cells.length} sloupců, ale hlavička definuje ${headers.length} parametrů.`,
        }
      }
      rows.push(rowResult.cells)
    }
  } else if (lower.endsWith('.xml')) {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(content, 'application/xml')
    if (xmlDoc.querySelector('parsererror')) {
      return {
        ok: false,
        error: 'Syntaktická chyba (XML): Soubor scénářů není syntakticky platný XML dokument.',
      }
    }

    const root = xmlDoc.documentElement
    if (!root || root.tagName !== 'TestSet') {
      return {
        ok: false,
        error: `Strukturální chyba (XML): Pro scénáře je očekáván kořenový element <TestSet>, nalezen <${root?.tagName ?? 'neznámý'}>.`,
      }
    }

    const attrName = root.getAttribute('name')?.trim()
    if (attrName) parsedSetName = attrName
    const attrStrength = root.getAttribute('strength')
    if (attrStrength) {
      const m = attrStrength.match(/(\d+)/)
      if (m) strength = Math.min(6, Math.max(1, Number(m[1])))
    }

    const paramEls = Array.from(root.querySelectorAll(':scope > Parameters > Parameter'))
    headers = paramEls.map((el) => (el.getAttribute('name') ?? el.textContent ?? '').trim()).filter(Boolean)

    const caseEls = Array.from(root.querySelectorAll(':scope > TestCases > TestCase'))
    if (caseEls.length === 0) {
      return {
        ok: false,
        error: 'Strukturální chyba (XML): Element <TestSet> neobsahuje žádné elementy <TestCase> v sekci <TestCases>.',
      }
    }

    for (let i = 0; i < caseEls.length; i++) {
      const valEls = Array.from(caseEls[i].querySelectorAll(':scope > Value'))
      if (headers.length === 0 && i === 0) {
        headers = valEls.map((v, idx) => v.getAttribute('parameter')?.trim() || `Parametr_${idx + 1}`)
      }
      if (valEls.length !== headers.length) {
        return {
          ok: false,
          error: `Strukturální chyba (XML): <TestCase> #${i + 1} obsahuje ${valEls.length} hodnot, ale očekáváno je ${headers.length}.`,
        }
      }
      rows.push(valEls.map((v) => (v.textContent ?? '').trim()))
    }
  } else {
    return {
      ok: false,
      error: 'Nepodporovaný formát souboru. Pro scénáře jsou povoleny formáty .csv, .json a .xml (DFR-17).',
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: 'Strukturální chyba: Soubor neobsahuje žádné testovací scénáře (0 řádků).',
    }
  }

  if (headers.length > MAX_PARAMETERS) {
    return {
      ok: false,
      error: `Chyba limitu: Soubor scénářů obsahuje ${headers.length} sloupců (maximum je ${MAX_PARAMETERS} parametrů).`,
    }
  }

  const modelParamNames = currentModel.parameters.map((p) => p.name)
  const columnsMatchModel =
    headers.length === modelParamNames.length && headers.every((h, idx) => h === modelParamNames[idx])

  return {
    ok: true,
    testSet: {
      id: Date.now(),
      name: parsedSetName,
      strength,
      tests: rows,
    },
    warning: columnsMatchModel
      ? undefined
      : 'Upozornění (UC-12): Hlavička importovaných scénářů se liší od parametrů aktuálního modelu (zobrazeno v prohlížecím režimu).',
  }
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
  const [calculating, setCalculating] = useState(false)

  // Import state (FileReader + syntactic/structural validation)
  const [importMode, setImportMode] = useState<ImportMode>('model')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Confirmation modal state for deleting a specific test set (DFR-06b / DFR-11)
  const [pendingDeleteSetId, setPendingDeleteSetId] = useState<number | null>(null)

  const model = models.find((item) => item.id === activeModelId) ?? models[0]
  const activeSet = model.sets.find((item) => item.id === model.activeSetId) ?? null
  const pendingDeleteSet = model.sets.find((item) => item.id === pendingDeleteSetId) ?? null

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 3400)
  }

  const updateModel = (updater: (current: Model) => Model) =>
    setModels((current) => current.map((item) => (item.id === activeModelId ? updater(item) : item)))

  const updateParameter = (parameterId: number, updater: (parameter: Parameter) => Parameter) =>
    updateModel((current) => ({
      ...current,
      parameters: current.parameters.map((parameter) =>
        parameter.id === parameterId ? updater(parameter) : parameter
      ),
    }))

  const createModel = () => {
    const id = Date.now()
    setModels((current) => [
      ...current,
      {
        id,
        name: `Nový model (${current.length + 1})`,
        parameters: [{ id: id + 1, name: 'Parametr_1', values: ['Hodnota A', 'Hodnota B'] }],
        sets: [],
        activeSetId: null,
      },
    ])
    setActiveModelId(id)
    notify('Nový model byl vytvořen.')
  }

  const generate = () => {
    if (model.parameters.length === 0) {
      notify('Chyba: Model musí obsahovat alespoň jeden parametr.')
      return
    }
    if (model.parameters.some((parameter) => parameter.values.length === 0)) {
      notify('Chyba: Každý parametr musí mít alespoň jednu hodnotu.')
      return
    }
    const requested = Number(strength)
    const effective = Math.min(requested, model.parameters.length)
    if (effective !== requested) notify(`Fallback: Síla byla upravena na ${effective}-way.`)
    setCalculating(true)
    window.setTimeout(() => {
      const id = Date.now()
      const name =
        setName.trim() ||
        `Sada ${effective}-way (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      updateModel((current) => ({
        ...current,
        sets: [...current.sets, { id, name, strength: effective, tests: makeTests(current.parameters) }],
        activeSetId: id,
      }))
      setSetName('')
      setCalculating(false)
      notify(`Vytvořena nová sada „${name}“.`)
    }, 650)
  }

  // 1. Export modelu (JSON a XML — DFR-15, UC-09, stejně jako v prototype.html)
  const exportModel = (format: 'json' | 'xml') => {
    if (!model.name.trim()) {
      notify('Chyba: Model musí mít neprázdný název před exportem.')
      return
    }
    if (model.parameters.length === 0) {
      notify('Chyba (UC-09): Model neobsahuje žádné parametry k exportu.')
      return
    }
    if (model.parameters.some((p) => !p.name.trim() || p.values.length === 0)) {
      notify('Chyba (UC-09): Všechny parametry musí mít název a alespoň 1 třídu ekvivalence.')
      return
    }

    const baseFilename = `${sanitizeFilename(model.name)}_model`

    if (format === 'json') {
      const jsonContent = JSON.stringify(
        {
          modelName: model.name,
          parameters: model.parameters.map((p) => ({
            name: p.name,
            equivalenceClasses: p.values,
          })),
        },
        null,
        2
      )
      triggerDownload(jsonContent, `${baseFilename}.json`, 'application/json;charset=utf-8')
      setModal(null)
      notify('Model byl úspěšně exportován jako JSON soubor.')
    } else {
      let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<System name="${escapeXml(model.name)}">\n  <Parameters>\n`
      model.parameters.forEach((p) => {
        xmlContent += `    <Parameter name="${escapeXml(p.name)}">\n      <values>\n`
        p.values.forEach((v) => {
          xmlContent += `        <value>${escapeXml(v)}</value>\n`
        })
        xmlContent += `      </values>\n    </Parameter>\n`
      })
      xmlContent += `  </Parameters>\n</System>`
      triggerDownload(xmlContent, `${baseFilename}.xml`, 'application/xml;charset=utf-8')
      setModal(null)
      notify('Model byl úspěšně exportován jako XML soubor.')
    }
  }

  // 2. Export scénářů (CSV, JSON a XML — DFR-15, UC-10 + požadavek ze 6. konzultace)
  const exportScenarios = (format: 'csv' | 'json' | 'xml') => {
    if (!activeSet || activeSet.tests.length === 0) {
      notify('Nejdříve vyberte nebo vygenerujte sadu testů.')
      return
    }

    const baseFilename = sanitizeFilename(activeSet.name)

    if (format === 'csv') {
      const header = model.parameters.map((p) => `"${p.name.replaceAll('"', '""')}"`).join(',')
      const rows = activeSet.tests.map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')
      )
      const content = [header, ...rows].join('\n')
      triggerDownload(content, `${baseFilename}.csv`, 'text/csv;charset=utf-8')
    } else if (format === 'json') {
      const content = JSON.stringify(
        {
          model: model.name,
          setName: activeSet.name,
          set: activeSet.name,
          strength: activeSet.strength,
          coverageStrength: `${activeSet.strength}-way`,
          parameters: model.parameters.map((p) => p.name),
          testCasesCount: activeSet.tests.length,
          tests: activeSet.tests,
          testCases: activeSet.tests.map((row) => {
            const obj: Record<string, string> = {}
            model.parameters.forEach((p, idx) => {
              obj[p.name] = row[idx] ?? ''
            })
            return obj
          }),
        },
        null,
        2
      )
      triggerDownload(content, `${baseFilename}.json`, 'application/json;charset=utf-8')
    } else {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
      xml += `<TestSet name="${escapeXml(activeSet.name)}" model="${escapeXml(model.name)}" strength="${activeSet.strength}-way" count="${activeSet.tests.length}">\n`
      xml += `  <Parameters>\n`
      model.parameters.forEach((p) => {
        xml += `    <Parameter name="${escapeXml(p.name)}" />\n`
      })
      xml += `  </Parameters>\n`
      xml += `  <TestCases>\n`
      activeSet.tests.forEach((row, rIdx) => {
        xml += `    <TestCase id="${rIdx + 1}">\n`
        row.forEach((cell, cIdx) => {
          const paramName = model.parameters[cIdx]?.name ?? `Parametr_${cIdx + 1}`
          xml += `      <Value parameter="${escapeXml(paramName)}">${escapeXml(cell)}</Value>\n`
        })
        xml += `    </TestCase>\n`
      })
      xml += `  </TestCases>\n</TestSet>`
      triggerDownload(xml, `${baseFilename}.xml`, 'application/xml;charset=utf-8')
    }

    notify(`Sada scénářů byla exportována do ${format.toUpperCase()}.`)
  }

  // 3. Reálný Import modelu a scénářů přes FileReader (DFR-16, DFR-17, UC-11, UC-12)
  const openImportModal = (mode: ImportMode) => {
    setImportMode(mode)
    setSelectedFile(null)
    setImportError(null)
    setModal('import')
  }

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file)
    setImportError(null)
  }

  const handleImportSubmit = () => {
    if (!selectedFile) {
      setImportError('Prosím vyberte soubor ze svého počítače před spuštěním importu.')
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      setImportError('Chyba čtení souboru: Soubor se nepodařilo načíst přes FileReader.')
    }
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : ''

      if (importMode === 'model') {
        const result = parseModelFileContent(selectedFile.name, content)
        if (!result.ok) {
          setImportError(result.error)
          return
        }
        setModels((current) => [...current, result.model])
        setActiveModelId(result.model.id)
        setSelectedFile(null)
        setImportError(null)
        setModal(null)
        notify(`Model „${result.model.name}“ (${result.model.parameters.length} parametrů) byl úspěšně naimportován.`)
      } else {
        const result = parseScenariosFileContent(selectedFile.name, content, model)
        if (!result.ok) {
          setImportError(result.error)
          return
        }
        updateModel((current) => ({
          ...current,
          sets: [...current.sets, result.testSet],
          activeSetId: result.testSet.id,
        }))
        setSelectedFile(null)
        setImportError(null)
        setModal(null)
        notify(
          result.warning ??
            `Sada scénářů „${result.testSet.name}“ (${result.testSet.tests.length} testů) byla úspěšně naimportována.`
        )
      }
    }
    reader.readAsText(selectedFile, 'UTF-8')
  }

  // 4. Nevratné smazání modelu a sady scénářů s povinným potvrzovacím oknem (DFR-06, DFR-06b, DFR-11)
  const confirmDeleteModel = () => {
    const deletedName = model.name
    const remaining = models.filter((item) => item.id !== activeModelId)
    if (remaining.length === 0) {
      const fallbackId = Date.now()
      const freshModel: Model = {
        id: fallbackId,
        name: 'Nový model (1)',
        parameters: [{ id: fallbackId + 1, name: 'Parametr_1', values: ['Hodnota A', 'Hodnota B'] }],
        sets: [],
        activeSetId: null,
      }
      setModels([freshModel])
      setActiveModelId(fallbackId)
    } else {
      setModels(remaining)
      setActiveModelId(remaining[0].id)
    }
    setModal(null)
    notify(`Model „${deletedName}“ i všechny jeho sady scénářů byly nevratně smazány.`)
  }

  const requestDeleteSet = (setId: number) => {
    setPendingDeleteSetId(setId)
    setModal('confirm-delete-set')
  }

  const confirmDeleteSet = () => {
    if (pendingDeleteSetId === null) return
    const targetName = pendingDeleteSet?.name ?? 'Sada'
    updateModel((current) => {
      const nextSets = current.sets.filter((s) => s.id !== pendingDeleteSetId)
      return {
        ...current,
        sets: nextSets,
        activeSetId:
          current.activeSetId === pendingDeleteSetId ? (nextSets[0]?.id ?? null) : current.activeSetId,
      }
    })
    setPendingDeleteSetId(null)
    setModal(null)
    notify(`Sada scénářů „${targetName}“ byla nevratně odstraněna.`)
  }

  const login = () => {
    setUser(loginEmail || 'jan.novak@fel.cvut.cz')
    setModal(null)
    notify('Přihlášení je připravené pro napojení na API.')
  }

  return (
    <div className={dark ? 'app-shell dark-mode' : 'app-shell light-mode'}>
      <header className="topbar">
        <div className="brand-area">
          <div className="brand">
            <span className="brand-mark">
              <Layers size={15} />
            </span>
            <strong>RSP Pairwise</strong>
            <span className="prototype-label">GUI Prototyp</span>
          </div>
          <span className="divider" />
          <div className="context-label">
            <span>ČVUT FEL PM2</span>
            <span>/</span>
            <strong>Webová alternativa ACTS 3.2</strong>
          </div>
        </div>
        <div className="top-actions">
          <div className="button-group import-actions">
            <button className="toolbar-button" onClick={() => openImportModal('model')}>
              <Upload size={14} />
              Import modelu
            </button>
            <button className="toolbar-button" onClick={() => setModal('export-model')}>
              <Download size={14} />
              Export modelu
            </button>
          </div>
          <button
            className="primary-button"
            onClick={() => notify(user ? 'Model připraven k uložení do API.' : 'Pro trvalé uložení se přihlaste.')}
          >
            <Save size={14} />
            Uložit model
          </button>
          <span className="divider" />
          <button className="icon-button" onClick={() => setDark((value) => !value)} title="Přepnout režim">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-button" onClick={() => setModal('help')} title="Nápověda">
            <HelpCircle size={16} />
          </button>
          <span className="divider" />
          {user ? (
            <div className="user-badge logged">
              <UserCheck size={14} />
              <span>
                Uživatel: <strong>{user}</strong>
              </span>
              <button
                aria-label="Odhlásit se"
                onClick={() => {
                  setUser(null)
                  notify('Byli jste odhlášeni.')
                }}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div className="user-badge guest">
              <UserX size={14} />
              <span>
                Režim: <strong>Host (v paměti)</strong>
              </span>
              <button onClick={() => setModal('auth')}>Přihlásit se</button>
            </div>
          )}
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <section className="sidebar-section models-section">
            <div className="section-heading">
              <span>Moje modely</span>
              <button className="quiet-icon" onClick={createModel} title="Vytvořit nový model">
                <FolderPlus size={16} />
              </button>
            </div>
            <div className="model-list">
              {models.map((item) => (
                <button
                  key={item.id}
                  className={`model-item ${item.id === activeModelId ? 'active' : ''}`}
                  onClick={() => setActiveModelId(item.id)}
                >
                  <span>
                    <FileCode2 size={14} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <small>{item.parameters.length} p</small>
                </button>
              ))}
            </div>
          </section>
          <section className="sidebar-section set-section">
            <div className="section-heading">
              <span>Uložené sady testů</span>
              <span className="count-badge">{model.sets.length}</span>
            </div>
            <div className="set-list">
              {model.sets.length === 0 ? (
                <p className="empty-note">Žádné vygenerované sady testů</p>
              ) : (
                model.sets.map((item) => (
                  <button
                    key={item.id}
                    className={`set-item ${item.id === model.activeSetId ? 'active' : ''}`}
                    onClick={() => updateModel((current) => ({ ...current, activeSetId: item.id }))}
                  >
                    <span className="set-title">
                      <strong>{item.name}</strong>
                      <Trash2
                        size={13}
                        onClick={(event) => {
                          event.stopPropagation()
                          requestDeleteSet(item.id)
                        }}
                      />
                    </span>
                    <span className="set-meta">
                      <em>{item.strength}-way</em>
                      <span>•</span>
                      <span>{item.tests.length} testů</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
          <footer className="sidebar-footer">
            <button className="delete-model" onClick={() => setModal('confirm-delete-model')}>
              <Trash2 size={14} />
              Smazat tento model
            </button>
            <span>DFR-06 Hard Delete</span>
          </footer>
        </aside>

        <main className="workspace">
          <section className="workspace-toolbar">
            <div className="model-title">
              <label htmlFor="model-name">
                Název modelu systému
                <input
                  id="model-name"
                  value={model.name}
                  onChange={(event) => updateModel((current) => ({ ...current, name: event.target.value }))}
                  onBlur={() => setModels((current) => [...current])}
                />
              </label>
              <div className="parameter-count">
                Počet parametrů: <strong>{model.parameters.length} / 100</strong>
              </div>
            </div>
            <div className="generator-panel">
              <label>
                Síla pokrytí (N-way)
                <select value={strength} onChange={(event) => setStrength(event.target.value)}>
                  <option value="2">2-way (Pairwise)</option>
                  <option value="3">3-way</option>
                  <option value="4">4-way</option>
                  <option value="5">5-way</option>
                  <option value="6">6-way</option>
                </select>
              </label>
              <label>
                Název nové sady
                <input
                  value={setName}
                  onChange={(event) => setSetName(event.target.value)}
                  placeholder="např. Sada Pairwise Produkce"
                />
              </label>
              <button className="generate-button" onClick={generate}>
                <Play size={14} fill="currentColor" />
                Generovat scénáře (IPOG)
              </button>
            </div>
          </section>

          <div className="split-workspace">
            <section className="parameters-panel">
              <div className="panel-heading">
                <span>
                  <SlidersHorizontal size={16} />
                  Parametry a Třídy ekvivalence
                </span>
                <button
                  className="outline-button"
                  onClick={() => {
                    if (model.parameters.length >= MAX_PARAMETERS) {
                      notify('Dosažen pevný limit 100 parametrů na model (DFR-03).')
                      return
                    }
                    updateModel((current) => ({
                      ...current,
                      parameters: [
                        ...current.parameters,
                        {
                          id: Date.now(),
                          name: `Parametr_${current.parameters.length + 1}`,
                          values: ['Hodnota A', 'Hodnota B'],
                        },
                      ],
                    }))
                    notify('Parametr byl přidán.')
                  }}
                >
                  <Plus size={14} />
                  Přidat parametr
                </button>
              </div>
              <div className="parameters-list">
                {model.parameters.map((parameter, index) => (
                  <ParameterCard
                    key={parameter.id}
                    parameter={parameter}
                    index={index}
                    onRename={(name) =>
                      updateParameter(parameter.id, (current) => ({ ...current, name: name.trim() || current.name }))
                    }
                    onDelete={() => {
                      if (model.parameters.length <= 1) {
                        notify('Model musí obsahovat alespoň jeden parametr.')
                        return
                      }
                      updateModel((current) => ({
                        ...current,
                        parameters: current.parameters.filter((item) => item.id !== parameter.id),
                      }))
                    }}
                    onAdd={(value) => {
                      const next = value.trim()
                      if (!next) return
                      if (parameter.values.includes(next)) {
                        notify('Tato hodnota již v parametru existuje (duplicita).')
                        return
                      }
                      if (parameter.values.length >= MAX_VALUES_PER_PARAM) {
                        notify('Dosažen pevný limit 100 tříd ekvivalence na parametr (DFR-03).')
                        return
                      }
                      updateParameter(parameter.id, (current) => ({ ...current, values: [...current.values, next] }))
                    }}
                    onRemove={(valueIndex) => {
                      if (parameter.values.length <= 1) {
                        notify('Parametr musí mít alespoň jednu třídu ekvivalence.')
                        return
                      }
                      updateParameter(parameter.id, (current) => ({
                        ...current,
                        values: current.values.filter((_, itemIndex) => itemIndex !== valueIndex),
                      }))
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="matrix-panel">
              <div className="panel-heading matrix-heading">
                <div className="matrix-title">
                  <span>
                    <Table2 size={16} />
                    {activeSet?.name ?? 'Žádná vybraná sada testů'}
                  </span>
                  <span className="blue-badge">{activeSet ? `${activeSet.strength}-way` : '0-way'}</span>
                  <span className="neutral-badge">{activeSet ? `${activeSet.tests.length} řádků` : '0 testů'}</span>
                </div>
                <div className="export-actions">
                  <button
                    className="small-button"
                    onClick={() => openImportModal('scenarios')}
                    title="Importovat sadu scénářů ze souboru (CSV, JSON, XML)"
                  >
                    <Upload size={14} />
                    Import
                  </button>
                  <span>Export scénářů:</span>
                  <button className="small-button" onClick={() => exportScenarios('csv')}>
                    <FileSpreadsheet size={14} />
                    CSV
                  </button>
                  <button className="small-button" onClick={() => exportScenarios('json')}>
                    <FileJson size={14} />
                    JSON
                  </button>
                  <button className="small-button" onClick={() => exportScenarios('xml')}>
                    <FileCode2 size={14} />
                    XML
                  </button>
                </div>
              </div>
              <div className="locked-banner">
                <span>
                  <Lock size={12} />
                  Vygenerované scénáře nelze ručně měnit (pouze prohlížet, exportovat nebo celou sadu smazat).
                </span>
                {activeSet && (
                  <button onClick={() => requestDeleteSet(activeSet.id)}>Smazat tuto sadu</button>
                )}
              </div>
              <div className="matrix-scroll">
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th className="id-col">ID</th>
                        {model.parameters.map((parameter) => (
                          <th key={parameter.id}>{parameter.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSet ? (
                        activeSet.tests.map((row, rowIndex) => (
                          <tr key={`${activeSet.id}-${rowIndex}`}>
                            <td className="id-col">{rowIndex + 1}</td>
                            {row.map((cell, cellIndex) => (
                              <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={model.parameters.length + 1} className="empty-matrix">
                            Spusťte výpočet IPOG tlačítkem výše pro vygenerování testovacích scénářů.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {calculating && (
        <div className="modal-backdrop">
          <div className="calculation-modal">
            <div className="loader-icon">
              <Play size={22} fill="currentColor" />
            </div>
            <h2>Výpočet algoritmu IPOG</h2>
            <p>Generování kombinací probíhá v neblokujícím Web Workeru na pozadí...</p>
            <div className="progress-track">
              <span />
            </div>
          </div>
        </div>
      )}

      {modal === 'auth' && (
        <ModalShell title="Přihlášení / Registrace" icon={<LogIn size={16} />} onClose={() => setModal(null)}>
          <p className="modal-description">
            Po přihlášení získáte možnost trvale ukládat modely a scénáře do PostgreSQL databáze.
          </p>
          <label>
            E-mail nebo uživatelské jméno
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
          </label>
          <label>
            Heslo
            <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="primary-button" onClick={login}>
              Přihlásit se
            </button>
            <button className="outline-button" onClick={() => setModal(null)}>
              Zrušit
            </button>
          </div>
        </ModalShell>
      )}

      {/* MODAL: Export modelu (JSON / XML — DFR-15, UC-09) */}
      {modal === 'export-model' && (
        <ModalShell title="Exportovat model do souboru" icon={<Download size={16} />} onClose={() => setModal(null)}>
          <p className="modal-description">
            Zvolte cílový formát pro export modelu <strong>„{model.name}“</strong> ({model.parameters.length} parametrů).
            Export modelu probíhá odděleně od testovacích scénářů (DFR-15).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <button
              className="outline-button"
              style={{ padding: '14px 12px', flexDirection: 'column', gap: 8 }}
              onClick={() => exportModel('json')}
            >
              <FileJson size={22} />
              <strong>Exportovat JSON</strong>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Strukturovaný formát .json</small>
            </button>
            <button
              className="outline-button"
              style={{ padding: '14px 12px', flexDirection: 'column', gap: 8 }}
              onClick={() => exportModel('xml')}
            >
              <FileCode2 size={22} />
              <strong>Exportovat XML</strong>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Kompatibilní s ACTS 3.2 (.xml)</small>
            </button>
          </div>
          <div className="modal-actions">
            <button className="outline-button" onClick={() => setModal(null)}>
              Zavřít
            </button>
          </div>
        </ModalShell>
      )}

      {/* MODAL: Reálný Import modelu a scénářů přes FileReader (DFR-16, DFR-17) */}
      {modal === 'import' && (
        <ModalShell
          title={importMode === 'model' ? 'Importovat model ze souboru' : 'Importovat testovací scénáře'}
          icon={<FileUp size={16} />}
          onClose={() => setModal(null)}
          wide
        >
          <div className="button-group" style={{ marginBottom: 12, width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <button
              className="toolbar-button"
              style={{
                justifyContent: 'center',
                background: importMode === 'model' ? 'rgba(79,70,229,.22)' : 'transparent',
                color: importMode === 'model' ? '#c7d2fe' : 'var(--text)',
              }}
              onClick={() => {
                setImportMode('model')
                setSelectedFile(null)
                setImportError(null)
              }}
            >
              <FileCode2 size={14} />
              Import modelu (JSON, XML)
            </button>
            <button
              className="toolbar-button"
              style={{
                justifyContent: 'center',
                background: importMode === 'scenarios' ? 'rgba(79,70,229,.22)' : 'transparent',
                color: importMode === 'scenarios' ? '#c7d2fe' : 'var(--text)',
              }}
              onClick={() => {
                setImportMode('scenarios')
                setSelectedFile(null)
                setImportError(null)
              }}
            >
              <Table2 size={14} />
              Import scénářů (CSV, JSON, XML)
            </button>
          </div>

          <p className="modal-description">
            {importMode === 'model' ? (
              <>
                Podporované formáty modelu: <strong>XML, JSON</strong>. Systém kontroluje syntaktickou validitu i
                strukturu modelu. Při překročení limitu <strong>100 parametrů</strong> nebo{' '}
                <strong>100 hodnot na parametr</strong> je celý import zablokován (DFR-16).
              </>
            ) : (
              <>
                Podporované formáty scénářů: <strong>CSV, JSON, XML</strong>. Načtená sada scénářů bude zvalidována a
                zobrazena v Read-Only tabulce u aktuálního modelu <strong>„{model.name}“</strong> (DFR-17).
              </>
            )}
          </p>

          <label className="drop-zone">
            <Upload size={28} />
            <span>{selectedFile ? selectedFile.name : 'Klikněte pro výběr souboru z počítače'}</span>
            <small>
              {importMode === 'model'
                ? 'nebo přetáhněte soubor .json / .xml sem'
                : 'nebo přetáhněte soubor .csv / .json / .xml sem'}
            </small>
            <input
              type="file"
              accept={importMode === 'model' ? '.json,.xml' : '.csv,.json,.xml'}
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </label>

          {importError && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 5,
                border: '1px solid #b91c1c',
                background: 'rgba(185, 28, 28, 0.16)',
                color: '#fca5a5',
                fontSize: 11,
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1, color: '#f87171' }} />
              <span>{importError}</span>
            </div>
          )}

          <div className="modal-actions">
            <button className="primary-button" onClick={handleImportSubmit} disabled={!selectedFile}>
              {importMode === 'model' ? 'Načíst a zvalidovat model' : 'Načíst a zvalidovat scénáře'}
            </button>
            <button className="outline-button" onClick={() => setModal(null)}>
              Zavřít
            </button>
          </div>
        </ModalShell>
      )}

      {/* MODAL: Povinné potvrzení před nevratným smazáním modelu (DFR-06 / DFR-11, UC-08) */}
      {modal === 'confirm-delete-model' && (
        <ModalShell
          title="Potvrzení nevratného smazání modelu"
          icon={<AlertTriangle size={16} />}
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            Opravdu chcete nevratně odstranit model <strong>„{model.name}“</strong> ({model.parameters.length}{' '}
            parametrů) včetně všech jeho <strong>{model.sets.length} uložených sad testovacích scénářů</strong>?
          </p>
          <p className="modal-description" style={{ color: '#fca5a5', marginBottom: 0 }}>
            Tato akce je nevratná (Hard Delete dle DFR-06, systém neobsahuje koš).
          </p>
          <div className="modal-actions">
            <button className="danger-button" onClick={confirmDeleteModel}>
              <Trash2 size={14} />
              Smazat nevratně
            </button>
            <button className="outline-button" onClick={() => setModal(null)}>
              Zrušit
            </button>
          </div>
        </ModalShell>
      )}

      {/* MODAL: Povinné potvrzení před smazáním sady scénářů (DFR-06b / DFR-11, UC-07) */}
      {modal === 'confirm-delete-set' && (
        <ModalShell
          title="Potvrzení smazání sady scénářů"
          icon={<AlertTriangle size={16} />}
          onClose={() => {
            setPendingDeleteSetId(null)
            setModal(null)
          }}
        >
          <p className="modal-description">
            Opravdu chcete nevratně smazat sadu testovacích scénářů{' '}
            <strong>„{pendingDeleteSet?.name ?? 'Vybraná sada'}“</strong> (
            {pendingDeleteSet ? `${pendingDeleteSet.strength}-way, ${pendingDeleteSet.tests.length} testů` : ''})?
          </p>
          <p className="modal-description" style={{ marginBottom: 0 }}>
            Samotný model <strong>„{model.name}“</strong> i ostatní sady scénářů zůstanou zachovány (DFR-06b).
          </p>
          <div className="modal-actions">
            <button className="danger-button" onClick={confirmDeleteSet}>
              <Trash2 size={14} />
              Smazat sadu
            </button>
            <button
              className="outline-button"
              onClick={() => {
                setPendingDeleteSetId(null)
                setModal(null)
              }}
            >
              Zrušit
            </button>
          </div>
        </ModalShell>
      )}

      {modal === 'help' && (
        <ModalShell title="Nápověda k ovládání aplikace" icon={<HelpCircle size={16} />} onClose={() => setModal(null)} wide>
          <div className="help-list">
            <article>
              <strong>Co je to Třída ekvivalence?</strong>
              <p>Každý parametr se skládá z tříd ekvivalence, které reprezentují vstupy systému.</p>
            </article>
            <article>
              <strong>Síla pokrytí (N-way) a Fallback</strong>
              <p>
                Při 2-way testování generátor pokryje všechny dvojice hodnot. Vyšší síla než počet parametrů se
                automaticky sníží.
              </p>
            </article>
            <article>
              <strong>Pravidla a limity</strong>
              <p>
                Maximálně 100 parametrů na model a 100 tříd ekvivalence na parametr. Export a import modelu (JSON, XML)
                probíhá odděleně od exportu a importu scénářů (CSV, JSON, XML).
              </p>
            </article>
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => setModal(null)}>
              Rozumím
            </button>
          </div>
        </ModalShell>
      )}

      {toast && (
        <div className="toast">
          <Check size={15} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

function ParameterCard({
  parameter,
  index,
  onRename,
  onDelete,
  onAdd,
  onRemove,
}: {
  parameter: Parameter
  index: number
  onRename: (value: string) => void
  onDelete: () => void
  onAdd: (value: string) => void
  onRemove: (index: number) => void
}) {
  const [value, setValue] = useState('')
  return (
    <article className="parameter-card">
      <div className="parameter-head">
        <div className="parameter-name">
          <span>#{index + 1}</span>
          <input value={parameter.name} onChange={(event) => onRename(event.target.value)} />
        </div>
        <div className="parameter-meta">
          <span>{parameter.values.length} / 100 hodnot</span>
          <button className="quiet-icon" onClick={onDelete} title="Smazat parametr">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="value-tags">
        {parameter.values.map((item, valueIndex) => (
          <span className="value-tag" key={`${item}-${valueIndex}`}>
            {item}
            <button onClick={() => onRemove(valueIndex)} aria-label={`Odebrat ${item}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="add-value">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              onAdd(value)
              setValue('')
            }
          }}
          placeholder="Nová třída ekvivalence (hodnota)..."
        />
        <button
          onClick={() => {
            onAdd(value)
            setValue('')
          }}
        >
          + Přidat
        </button>
      </div>
    </article>
  )
}

function ModalShell({
  title,
  icon,
  onClose,
  children,
  wide = false,
}: {
  title: string
  icon: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`dialog ${wide ? 'wide' : ''}`}>
        <div className="dialog-header">
          <h2>
            {icon}
            {title}
          </h2>
          <button className="quiet-icon" onClick={onClose} aria-label="Zavřít">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
