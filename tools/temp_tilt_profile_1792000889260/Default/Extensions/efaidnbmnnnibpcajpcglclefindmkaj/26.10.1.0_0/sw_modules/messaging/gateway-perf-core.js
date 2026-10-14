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
let e=!1,n=[];export function setEnabled(t){e=!!t,e||(n=[])}export function isEnabled(){return e}export function now(){return"undefined"!=typeof performance&&"function"==typeof performance.now?performance.now():Date.now()}export function recordSample(t){if(!e||!t||"object"!=typeof t)return;const{bus:o,op:r,decision:i,path:p,delta:u}=t;"number"==typeof u&&Number.isFinite(u)&&(n.length>=500&&n.shift(),n.push({bus:o,op:r,decision:i,path:p,delta:u}))}export function startTiming(){return e?now():void 0}export function endTiming(e,n){void 0!==e&&recordSample({...n,delta:now()-e})}export function drainSamples(){const e=n;return n=[],e}export function resetForTests(){e=!1,n=[]}