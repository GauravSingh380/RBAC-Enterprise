// A random id for this browser tab, sent as X-Client-Id with every API call.
// Realtime events carry the id of the tab that caused them, so a tab can skip
// re-fetching data it just changed itself (it already has the result).
import { uuid } from './uuid'

export const CLIENT_ID = uuid()
