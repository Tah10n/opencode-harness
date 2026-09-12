import {classifyStatus} from './status-core.mjs';export function needsAuthRefresh(status){return classifyStatus(status).refreshAuth;}
