const OPEN_KEY = 'aae:chart'

// localStorage can throw (private windows, blocked site data), so the chart simply defaults to open without it.
export function readChartOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'closed'
  } catch {
    return true
  }
}

export function storeChartOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed')
  } catch {
    // the choice just won't persist
  }
}
