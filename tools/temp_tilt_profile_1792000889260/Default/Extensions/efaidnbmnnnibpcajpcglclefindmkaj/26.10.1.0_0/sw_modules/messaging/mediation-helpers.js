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
import{classify as e}from"./sender-tier.js";import{CLASSIFIABLE_BUSES as t,FIXED_TIER_BUSES as r}from"./messaging-constants.js";export function validateSchema(e,t,r=""){const n=e??{},i=t??{},o=r?`${r}.`:"",d=Object.keys(n).find(e=>!Object.prototype.hasOwnProperty.call(i,e));if(void 0!==d)return{valid:!1,reason:`unexpected field: ${o}${d}`};const s=Object.entries(i).find(([e,t])=>{const r=n[e];if(void 0===r)return!!t.required;let i;return i=null===r?"null":Array.isArray(r)?"array":typeof r,i!==t.type});if(void 0!==s){const[e,t]=s;return{valid:!1,reason:void 0===n[e]?`missing required field: ${o}${e}`:`field ${o}${e} expected type ${t.type}`}}const a=Object.entries(i).filter(([e,t])=>"object"===t.type&&t.schema&&void 0!==n[e]).map(([e,t])=>validateSchema(n[e],t.schema,`${o}${e}`)).find(e=>!e.valid);return a||{valid:!0}}export function permit(e,t){return t.allowedSenderTiers.includes(e)}export function stripEnvelopeFields(e,t){if(!t||0===t.length)return e;const r={...e};return t.forEach(e=>delete r[e]),r}export function isEndpointPermitted(e,t){if(void 0===e||!t)return!0;return(Array.isArray(t)?t:[t]).includes(e)}export function describeTargetEndpoint(e){return e?Array.isArray(e)?e.join(" or "):e:"unknown"}export function evaluateContract(e,t,r,n,i){const o=permit(t,e),d=!isEndpointPermitted(i,e.targetEndpoint),s=o&&!d,a=s?validateSchema(stripEnvelopeFields(r,n),e.schema):{valid:!1},c=s&&a.valid;let p;return p=o?d?`endpoint mismatch: expected ${describeTargetEndpoint(e.targetEndpoint)}, got ${i}`:a.reason:"sender tier not permitted",{passes:c,reason:p}}export async function resolveTier(n,i){return t.includes(n)?e(i):void 0!==r[n]?r[n]:"unknown"}