import type { IntakeUpload } from "../contracts";
export function groupPages(upload:IntakeUpload,requestedGroupId?:string){const groupId=requestedGroupId??`document:${upload.documentId}`;return Object.freeze({groupId,pageCount:upload.pageCount,pages:Object.freeze(upload.pages.map(p=>Object.freeze({pageNumber:p.pageNumber,groupIndex:p.pageNumber-1})))})}
