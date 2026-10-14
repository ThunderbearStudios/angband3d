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
import{dcLocalStorage as t}from"../common/local-storage.js";import{loggingApi as e}from"../common/loggingApi.js";import{floodgate as a}from"./floodgate.js";import{CACHE_PURGE_SCHEME as o}from"./constant.js";import{encodedStaleStorageKeys as r}from"../common/stale-storage-keys-data.js";const s="stale-keys-cleanup-complete",n=async a=>{const o=(({staleKeys:t})=>{const e=new Set(t||[]);return t=>e.has(t)})(JSON.parse(atob(r)));await t.init();const n=Object.keys(t.getAllItems()).filter(t=>o(t));n.length>0&&(await chrome.storage.local.remove(n),e.info({message:"Stale chrome.storage.local keys removed",count:n.length})),await t.setItem(s,a)};export const cleanupStaleStorageKeys=async()=>{try{if(!await a.hasFlag("dc-cv-cleanup-stale-storage",o.NO_CALL))return;await t.init();const e=await(async t=>{const e=await crypto.subtle.digest("SHA-256",(new TextEncoder).encode(t));return Array.from(new Uint8Array(e).slice(0,8),t=>t.toString(16).padStart(2,"0")).join("")})(r);if(t.getItem(s)===e)return;await n(e)}catch(t){e.error({message:"Stale storage key cleanup failed",error:t})}};