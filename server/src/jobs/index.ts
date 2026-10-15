// Importing this file registers every job handler with the worker.
// Add new handlers here (each module calls defineJob(...) when imported).
import '../modules/email/email.service.js';
import '../modules/notifications/notification-jobs.js';
import '../modules/insights/insights-report.js';
import '../modules/templates/templates.service.js';
import '../modules/trash/trash.service.js';

export { drainJobs, runDueSchedules, startWorker, stopWorker } from './worker.js';
export { enqueue } from './queue.js';
