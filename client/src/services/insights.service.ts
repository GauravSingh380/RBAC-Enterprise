// Organization insights (permission insights.view)
import { api, saveBlob } from '../lib/api'
import type { Insights } from '../types/insights'

export const insightsService = {
  get: (days: 7 | 30 | 90) => api.get<Insights>('/insights', { days }),
  /** CSV download (opens in Excel) */
  exportCsv: async (section: 'projects' | 'workload', days: number) => {
    const blob = await api.blob(`/insights/export/${section}`, { days })
    saveBlob(blob, `insights-${section}-${new Date().toISOString().slice(0, 10)}.csv`)
  },
  sendMeWeeklyReport: () => api.post<{ sent: number }>('/insights/weekly-report/send-me'),
}
