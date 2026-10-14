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
import{resolveMode as e}from"./op-migration-state.js";import{loggingApi as n}from"../../common/loggingApi.js";import{mediate as t}from"./mediation-pipeline.js";import{startGatewayPerf as i,startTiming as r,endTiming as s}from"./gateway-perf.js";import{wrapRuntimeMessageListener as o,wrapPortMessageListener as a}from"./message-gateway-core.js";function p(e){n.warn({message:"DCBrowserExt:Messaging:Rejected",...e})}function m(n){return t({...n,resolveModeFn:e,reportRejectionFn:p})}i();export function wrapRuntimeMessageListener(e,n,{mediateFn:t=m,endpoint:i,envelopeFields:a}={}){return o(e,n,{mediateFn:t,endpoint:i,reportRejectionFn:p,startTiming:r,endTiming:s,envelopeFields:a})}export function registerRuntimeMessageHandler(e,n,{endpoint:t,mediateFn:i=m,envelopeFields:r}={}){const s={mediateFn:i,endpoint:t,envelopeFields:r};chrome.runtime.onMessage.addListener(wrapRuntimeMessageListener(e,n,s))}export function registerExternalMessageHandler(e,n,{endpoint:t,wrapListener:i}={}){const r=wrapRuntimeMessageListener(e,n,{mediateFn:m,endpoint:t});chrome.runtime.onMessageExternal.addListener(i?i(r):r)}export function wrapPortMessageListener(e,n,{mediateFn:t=m,endpoint:i}={}){return a(e,n,{mediateFn:t,endpoint:i,reportRejectionFn:p,startTiming:r,endTiming:s})}export function registerPortMessageHandler(e,n,t,{endpoint:i}={}){const r={mediateFn:m,endpoint:i};e.onMessage.addListener(wrapPortMessageListener(n,t,r))}