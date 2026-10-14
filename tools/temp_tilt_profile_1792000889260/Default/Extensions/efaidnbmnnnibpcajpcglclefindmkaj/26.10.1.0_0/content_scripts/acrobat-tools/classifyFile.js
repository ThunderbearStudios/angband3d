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
import{convertDriveUrlToDocsExport,getMimeTypeFromAttachmentName,updateDrivePDFUrl}from"../gmail/util.js";const GOOGLE_NATIVE_TYPES={docs:{path:"document",extension:".docx"},sheets:{path:"spreadsheets",extension:".xlsx"},slides:{path:"presentation",extension:".pptx"}};function isGoogleDriveUrl(e){try{const t=new URL(e);return"https:"===t.protocol&&("drive.google.com"===t.hostname||"docs.google.com"===t.hostname)}catch(e){return!1}}export function getGoogleNativeExportUrl(e,t){const o=GOOGLE_NATIVE_TYPES[t];if(!o||!isGoogleDriveUrl(e))return"";const n=new URL(e),r=n.pathname.match(/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/);return"docs.google.com"===n.hostname&&r&&r[1]!==o.path?"":convertDriveUrlToDocsExport(e,o.path,o.extension.slice(1))}export function getExtension(e){if(!e)return"";const t=e.lastIndexOf(".");return t>=0?e.slice(t).toLowerCase():""}export function classifyFile({name:e,url:t,mimeTypeMap:o,driveUrlConverter:n,googleNativeType:r}){let s=t||"";const i=isGoogleDriveUrl(s),p=i&&GOOGLE_NATIVE_TYPES[r];let l=getExtension(e);const a=!p&&(".pdf"===l||s.includes("mime=application%2Fpdf")||/\.pdf(?:$|[?#/])/i.test(s));let c,m=null,u=!1,d=e;if(p){l=p.extension,getExtension(e)!==l&&(d+=l),m=getMimeTypeFromAttachmentName(d,o||{});const t=getGoogleNativeExportUrl(s,r);u=Boolean(m&&t),t&&(s=t),u||(c="unsupported-file-type")}else a?(m="application/pdf",l=".pdf",u=!0,i&&(s=(n||updateDrivePDFUrl)(s)||s)):(m=getMimeTypeFromAttachmentName(e,o||{}),m?u=!0:c="unsupported-file-type");const g={name:d,extension:l,mimeType:m,isPdf:a,isSupported:u,isDriveAsset:i,url:s};return c&&(g.unsupportedReason=c),g}