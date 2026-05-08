import { useEffect, useState } from 'react'
import type { DashboardData } from '../types/dashboard'

const DASHBOARD_DATA_URL = '/data/dashboard.json'

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(DASHBOARD_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load dashboard data (${res.status})`)
        return res.json()
      })
      .then((json: DashboardData) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, error }
}
