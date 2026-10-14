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
import{loggingApi as t}from"../../common/loggingApi.js";import{common as e}from"../common.js";import{floodgate as r}from"../floodgate.js";import{forceResetService as o}from"../force-reset-service.js";import a from"../CacheStore.js";import{CACHE_PURGE_SCHEME as s}from"../constant.js";import{busFlagId as n,MASTER_ENABLE_FLAG as i}from"./flag-ids.js";import{busOpManifests as c}from"./op-manifest.default.js";import{MODE as f}from"./messaging-constants.js";const m="op-manifest",l=new a;let u=null;async function p(){const t=new AbortController,r=setTimeout(()=>t.abort(),5e3);let o;try{if(o=await fetch(e.getOpManifestUrl(),{signal:t.signal}),!o.ok)throw new Error(`HTTP ${o.status}`);const r=await o.json();if(!r||"object"!=typeof r||Array.isArray(r))throw new Error("op-manifest: unexpected shape");return r}finally{clearTimeout(r)}}export async function getBusManifest(e){let r;u||(u=async function(){let e;o.executeFeature(m,async()=>{const t=await p();return await l.set(m,t),t}).catch(e=>t.error({message:"[op-manifest] refresh error",error:e?.message}));try{e=await l.get(m)}catch{e=null}if(e)return e;try{const t=await p();return await l.set(m,t),t}catch{return c}}(),setTimeout(()=>{u=null},9e5));try{r=await u}catch{u=null,r=c}return r[e]??{}}export async function resolveMode(t,e){const[o,a]=await Promise.all([r.hasFlag(i,s.NO_CALL),r.hasFlag(n(t),s.NO_CALL)]);if(!o||!a)return f.UNMIGRATED;const c=(await getBusManifest(t))[e];return c===f.DARK_LAUNCH||c===f.ENFORCE?c:f.UNMIGRATED}export function resetManifestCacheForTests(){u=null}