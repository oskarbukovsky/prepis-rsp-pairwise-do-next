const MAX_ROWS = 100_000
const MAX_COVERED_INTERACTIONS = 1_000_000
const MAX_RESULT_BYTES = 7_000_000

function combinations(count, size) {
  const result = []
  const current = []

  function visit(start) {
    if (current.length === size) {
      result.push([...current])
      return
    }

    for (let index = start; index <= count - (size - current.length); index += 1) {
      current.push(index)
      visit(index + 1)
      current.pop()
    }
  }

  visit(0)
  return result
}

function interactionKey(row, subset, nextColumn) {
  return `${subset.join(',')}:${subset.map((column) => row[column]).join(',')}:${row[nextColumn]}`
}

function estimateJsonBytes(rows, parameters) {
  const valueBytes = new Map()
  const encoder = new TextEncoder()
  for (const parameter of parameters) {
    for (const value of parameter.values) {
      if (!valueBytes.has(value)) valueBytes.set(value, encoder.encode(JSON.stringify(value)).byteLength)
    }
  }

  let bytes = 2
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (rowIndex > 0) bytes += 1
    bytes += 2
    for (let column = 0; column < rows[rowIndex].length; column += 1) {
      if (column > 0) bytes += 1
      bytes += valueBytes.get(rows[rowIndex][column]) ?? 0
      if (bytes > MAX_RESULT_BYTES) return bytes
    }
  }
  return bytes
}

export async function generateIpog(parameters, strength, onProgress = () => {}) {
  if (!Array.isArray(parameters) || !parameters.length) {
    throw new Error('Model musí obsahovat alespoň jeden parametr.')
  }
  if (!Number.isInteger(strength) || strength < 1 || strength > 6 || strength > parameters.length) {
    throw new Error('Síla IPOG musí být celé číslo od 1 do 6 a nesmí převyšovat počet parametrů.')
  }
  if (parameters.some((parameter) => !Array.isArray(parameter.values) || !parameter.values.length)) {
    throw new Error('Každý parametr musí mít alespoň jednu hodnotu.')
  }

  const initialRowsCount = parameters.slice(0, strength).reduce((count, parameter) => count * parameter.values.length, 1)
  if (initialRowsCount > MAX_ROWS) {
    throw new Error('Počáteční kombinace přesahují limit 100 000 řádků. Snižte sílu pokrytí nebo počet hodnot.')
  }

  let rows = [[]]
  for (let column = 0; column < strength; column += 1) {
    rows = rows.flatMap((row) => parameters[column].values.map((_, valueIndex) => [...row, valueIndex]))
  }

  for (let column = strength; column < parameters.length; column += 1) {
    const subsets = combinations(column, strength - 1)
    const covered = new Set()

    function markCovered(row) {
      for (const subset of subsets) {
        const key = interactionKey(row, subset, column)
        if (!covered.has(key)) {
          if (covered.size >= MAX_COVERED_INTERACTIONS) {
            throw new Error('Výpočet překročil bezpečnostní limit kombinací. Zkuste nižší sílu pokrytí nebo méně parametrů.')
          }
          covered.add(key)
        }
      }
    }

    function score(row) {
      let total = 0
      for (const subset of subsets) {
        if (subset.some((previousColumn) => row[previousColumn] < 0)) continue
        if (!covered.has(interactionKey(row, subset, column))) total += 1
      }
      return total
    }

    function fillUnassigned(row) {
      for (let previousColumn = 0; previousColumn < column; previousColumn += 1) {
        if (row[previousColumn] >= 0) continue
        let bestValue = 0
        let bestScore = -1
        for (let valueIndex = 0; valueIndex < parameters[previousColumn].values.length; valueIndex += 1) {
          row[previousColumn] = valueIndex
          const candidateScore = score(row)
          if (candidateScore > bestScore) {
            bestScore = candidateScore
            bestValue = valueIndex
          }
        }
        row[previousColumn] = bestValue
      }
    }

    for (const row of rows) {
      let bestValue = 0
      let bestScore = -1
      for (let valueIndex = 0; valueIndex < parameters[column].values.length; valueIndex += 1) {
        row[column] = valueIndex
        const candidateScore = score(row)
        if (candidateScore > bestScore) {
          bestScore = candidateScore
          bestValue = valueIndex
        }
      }
      row[column] = bestValue
      markCovered(row)
    }

    for (const subset of subsets) {
      const assignment = new Array(subset.length).fill(0)

      function visitAssignments(depth) {
        if (depth < subset.length) {
          const previousColumn = subset[depth]
          for (let valueIndex = 0; valueIndex < parameters[previousColumn].values.length; valueIndex += 1) {
            assignment[depth] = valueIndex
            visitAssignments(depth + 1)
          }
          return
        }

        for (let newValue = 0; newValue < parameters[column].values.length; newValue += 1) {
          const row = new Array(column + 1).fill(-1)
          subset.forEach((previousColumn, index) => { row[previousColumn] = assignment[index] })
          row[column] = newValue
          if (covered.has(interactionKey(row, subset, column))) continue
          if (rows.length >= MAX_ROWS) {
            throw new Error('Výsledek přesahuje limit 100 000 řádků. Zkuste nižší sílu pokrytí nebo méně parametrů.')
          }
          fillUnassigned(row)
          rows.push(row)
          markCovered(row)
        }
      }

      visitAssignments(0)
    }

    onProgress({ parameterIndex: column + 1, parameterCount: parameters.length })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const tests = rows.map((row) => row.map((valueIndex, column) => parameters[column].values[valueIndex]))
  if (estimateJsonBytes(tests, parameters) > MAX_RESULT_BYTES) {
    throw new Error('Vygenerovaná sada je příliš velká pro uložení. Snižte počet parametrů nebo hodnot.')
  }
  return tests
}
