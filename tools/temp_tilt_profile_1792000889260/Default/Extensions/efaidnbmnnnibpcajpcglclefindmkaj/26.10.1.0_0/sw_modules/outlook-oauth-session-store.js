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
import{OUTLOOK_DOMAINS as t}from"./outlook-module.js";import{dcSessionStorage as e}from"../common/local-storage.js";import{util as n}from"./util.js";const o="outlookOAuthTokenCache";function r(){let t=Promise.resolve();return e=>{const n=t.then(e,e);return t=n.catch(()=>{}),n}}const i=r(),a=r(),s=t.map(t=>t.replace(/\/\*$/,"")),c="outlookTabEmailPins";function u(t){return"number"==typeof t&&t>Date.now()+6e4}export function isOutlookOAuthOrigin(t){if(!t?.tab?.id)return!1;const e=t?.url?new URL(t.url).origin:null;return Boolean(e&&s.includes(e))}function l(t){return n.stringToSHA256(t)}export async function pinOutlookTabEmail(t,n){if(!t||!n)return;const o=await l(n);await a(async()=>{const n=e.getItem(c)||{};n[t]=o,await e.setItem(c,n)})}export async function clearOutlookTabEmailPin(t){await a(async()=>{const n=e.getItem(c)||{};t in n&&(delete n[t],await e.setItem(c,n))})}export async function isAllowedOutlookOAuthSender(t,n){if(!isOutlookOAuthOrigin(t)||!n)return!1;return(e.getItem(c)||{})[t.tab.id]===await l(n)}function f(t){const e={};return Object.entries(t).forEach(([t,n])=>{(u(n?.refreshTokenExpiresAt)||u(n?.accessTokenExpiresAt)||u(n?.nvTokenExpiresAt))&&(e[t]=n)}),e}async function m(t){if(!t)return null;return(e.getItem(o)||{})[await l(t)]||null}async function p(t,{accessToken:n,accessTokenExpiresAt:r,refreshToken:a,refreshTokenExpiresAt:s,clientMeta:c}={}){if(!t)return;const u=await l(t);await i(async()=>{const t=f(e.getItem(o)||{}),i={...t[u]||{}};n?.ciphertext&&(i.accessToken=n,i.accessTokenExpiresAt=r),a?.ciphertext&&(i.refreshToken=a,i.refreshTokenExpiresAt=s),c&&"object"==typeof c&&(i.clientMeta={...i.clientMeta,...c}),t[u]=i,await e.setItem(o,t)})}async function k(t){if(!t)return null;const n=e.getItem(o)||{};return n[await l(t)]?.nvTokenExpiresAt??null}async function T(t,n){if(!t)return;const r=await l(t);await i(async()=>{const t=f(e.getItem(o)||{});t[r]={...t[r]||{},nvTokenExpiresAt:n},await e.setItem(o,t)})}export{m as getOutlookOAuthEntry,p as saveOutlookOAuthTokenData,k as getNvTokenExpiry,T as saveNvTokenExpiry};