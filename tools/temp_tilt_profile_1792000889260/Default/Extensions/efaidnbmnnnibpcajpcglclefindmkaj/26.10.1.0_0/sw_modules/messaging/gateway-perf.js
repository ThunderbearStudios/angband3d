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
import{floodgate as t}from"../floodgate.js";import{loggingApi as e}from"../../common/loggingApi.js";import{CACHE_PURGE_SCHEME as r}from"../constant.js";import{PERF_INSTRUMENTATION_FLAG as o}from"./flag-ids.js";import{setEnabled as n,isEnabled as a,recordSample as i,drainSamples as f,now as s}from"./gateway-perf-core.js";let c=!1;const m=Math.random();async function p(){try{const e=await t.hasFlag(o,r.NO_CALL);n(!!e&&m<=function(){try{const{sampleRate:e}=JSON.parse(t.getFeatureMeta(o));if("number"==typeof e&&e>=0&&e<=1)return e}catch(t){}return 1}())}catch(t){n(!1)}}function u(t){if(a())try{e.info({message:"DCBrowserExt:Messaging:GatewayPerf",...t})}catch(t){}}export function startTiming(){return a()?s():void 0}export function endTiming(t,e){void 0!==t&&u({...e,delta:s()-t})}function g(){p(),f().forEach(u)}export function startGatewayPerf(){c||(c=!0,setTimeout(p,5e3),setInterval(g,1e4))}export function ingestRelayedSamples(t){a()&&Array.isArray(t)&&t.forEach(t=>i(t))}export function getPerfEnabledForRelay(){return a()}