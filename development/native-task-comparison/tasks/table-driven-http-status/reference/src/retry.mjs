import {classifyStatus} from './status-core.mjs';export function isRetryable(status){return classifyStatus(status).retryable;}
