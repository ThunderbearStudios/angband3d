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
import e from"../../libs/readability.js";import{SIDE_PANEL_HASH_ROUTES as t}from"../../common/constant.js";import{sendErrorLog as n}from"../../content_scripts/utils/util.js";const{Readability:r,isProbablyReaderable:o}=e;export const getSidePanelTabId=()=>parseInt(new URLSearchParams(window.location.search).get("tabId"),10);export const sendMessageWithTab=(e,t)=>chrome.runtime.sendMessage({...e,tab:{id:t}});export const createSendAnalytics=e=>t=>{t&&sendMessageWithTab({main_op:"analytics",analytics:[t]},e)};export const logPanelTourUnsupportedBrowser=()=>{chrome.runtime.sendMessage({main_op:"log-info",log:{message:"PanelTourUnsupportedBrowser"}})};export const getExtensionPinnedState=async()=>{try{const{isOnToolbar:e}=await chrome.action.getUserSettings();return"boolean"!=typeof e?(n("Chrome returned an invalid extension pin state"),null):e}catch(e){return n("Failed to read extension pin state",e?.toString?.()??"Unknown error"),null}};function s(e){return e.clientHeight>0&&e.clientWidth>0}async function a(e,t=!0){const n=()=>o(e,{visibilityChecker:t?s:void 0});if(n())return!0;const r=(await chrome.runtime.sendMessage({type:"get_sidepanel_state"})).isOpen?1500:5e3;return new Promise(e=>{const t=setInterval(()=>{n()&&(clearInterval(t),clearTimeout(o),e(!0))},300),o=setTimeout(()=>{clearInterval(t),e(!1)},r)})}function i(e){try{const t=e.cloneNode(!0),n=new r(t).parse();return!!n&&n.textContent.trim().length>=140}catch{return!1}}async function c(e){const t=(new DOMParser).parseFromString(e,"text/html");if(await a(t,!1)){return new r(t).parse().content}return e}export const isGenAiRoute=e=>e.startsWith(t.SIDE_PANEL);export const isHomeShellRoute=e=>!isGenAiRoute(e);export function connectSidePanelPort(e,t){const n=chrome.runtime.connect({name:`sidepanel_${e}_${t}`}),r=setInterval(()=>{try{n.postMessage({action:"keep_alive"})}catch{clearInterval(r)}},2e4);return n.onDisconnect.addListener(()=>clearInterval(r)),n}export{a as isProbablyReaderableAsync,i as isFullParseReaderable,c as getReadableContent};