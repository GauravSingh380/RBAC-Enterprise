// Helpers of the templates screen (pure, unit tested)
import type { ItemTemplate } from '../../../types/workspace'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

/** "Every Monday" · "Every weekday" · "Monthly on the 1st" */
export function describeRepeat(t: Pick<ItemTemplate, 'repeat' | 'repeatWeekday' | 'repeatMonthDay'>): string {
  switch (t.repeat) {
    case 'weekdays':
      return 'Every weekday'
    case 'weekly':
      return `Every ${WEEKDAYS[t.repeatWeekday ?? 1]}`
    case 'monthly':
      return `Monthly on the ${ordinal(t.repeatMonthDay ?? 1)}`
    default:
      return 'Never'
  }
}
