import { useEffect, useState } from 'react'
import type { ExperimentData } from '../types/experiment'
import { EXPERIMENTS_DATA_URL } from '../config'

export function useExperimentData() {
  const [data, setData] = useState<ExperimentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(EXPERIMENTS_DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load experiment data (${res.status})`)
        return res.json()
      })
      .then((json: ExperimentData) => {
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
