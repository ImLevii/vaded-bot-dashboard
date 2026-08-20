// Re-exported from the rainlink adapter so existing `import type { QueueMetadata }
// from '../../types/QueueMetadata'` call sites keep working unchanged — see
// utils/music/rainlinkAdapter.ts for the field docs (skipConnectionEventRestore
// in particular).
export type { AdapterQueueMetadata as QueueMetadata } from '../utils/music/rainlinkAdapter'
