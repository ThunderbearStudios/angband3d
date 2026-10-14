/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
import{convertDriveUrlToDocsExport,getElementBasedOnSelector,getElementsByClassNameSelectors}from"../../util.js";import{getMessageView}from"../../message-view-touch-point-service.js";import{classifyFile}from"../../../acrobat-tools/classifyFile.js";function findFileSizeLabel(e){try{const t=e?.querySelectorAll?.("span")||[],s=Array.from(t).find(e=>{const t=e.textContent?.trim();return t&&/\b\d[\d.]*\s*(KB|MB|GB)\b/i.test(t)});if(s)return s.textContent.trim()}catch(e){}}function buildRecord(e,t,s,r,i){const n=e?.closest("a");if(!n)return null;const o=n.getAttribute("href");if(!o)return null;const a=getElementBasedOnSelector(n,"attachmentName","messageView"),l=a?.textContent?.trim();if(!l)return null;const c=["docs","sheets","slides"].find(t=>Array.isArray(i?.[t])&&i[t].some(t=>"string"==typeof t&&t&&e.src?.endsWith(t))),u=classifyFile({name:l,url:o,mimeTypeMap:r,driveUrlConverter:s?.updateDrivePDFUrl,googleNativeType:c}),m=findFileSizeLabel(n),d=`att-${t}`;n.setAttribute("data-acrobat-att-id",d),e?.setAttribute?.("data-acrobat-att-id",d);const p={attachmentId:d,name:u.name,extension:u.extension,mimeType:u.mimeType,fileSizeLabel:m,isPdf:u.isPdf,isSupported:u.isSupported,isDriveAsset:u.isDriveAsset};u.unsupportedReason&&(p.unsupportedReason=u.unsupportedReason);return{descriptor:p,resolved:{attachmentId:d,domATag:n,iconEl:e,url:u.url,name:u.name,mimeType:u.mimeType,isPdf:u.isPdf,isDriveAsset:u.isDriveAsset,isSupported:u.isSupported,googleNativeType:c}}}export function collectAttachments(e,t,s,r={}){if(!e)return[];const i=getElementsByClassNameSelectors(e,"attachmentIcon","messageView")||[],n=[],o=new Set;return i.forEach(e=>{const i=e?.closest("a");if(!i||o.has(i))return;o.add(i);const a=buildRecord(e,n.length,t,s,r);a&&n.push(a)}),n}export function getMessageViews(){return getMessageView()||[]}export function buildSummary(e){return{totalCount:e.length,unsupportedCount:e.filter(e=>!e.descriptor.isSupported).length}}export{convertDriveUrlToDocsExport};