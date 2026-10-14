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
import{loggingApi as e}from"../common/loggingApi.js";const n=new Map;function t(e,n,t,o,r){const c=new URLSearchParams({client_id:e,redirect_uri:n,response_type:"token id_token",scope:t,nonce:crypto.randomUUID()});return o&&c.set("prompt",o),r&&c.set("login_hint",r),`https://accounts.google.com/o/oauth2/v2/auth?${c}`}function o(e,n){return new Promise((t,o)=>{chrome.identity.launchWebAuthFlow({url:e,interactive:n},e=>{chrome.runtime.lastError?o(new Error(chrome.runtime.lastError.message)):e?t(e):o(new Error("No response URL from OAuth flow"))})})}function r(t,o){const{accessToken:r,idToken:c,expiresIn:s}=function(e){try{const n=new URL(e).hash.substring(1),t=new URLSearchParams(n);return{accessToken:t.get("access_token"),idToken:t.get("id_token"),expiresIn:parseInt(t.get("expires_in"),10)||null}}catch(e){return{accessToken:null,idToken:null,expiresIn:null}}}(t);if(!r)return null;const i=(c?function(n){try{const e=n.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),{email:t}=JSON.parse(atob(e));return{email:t}}catch(n){return e.error({message:"Google OAuth: Failed to decode id_token"}),{}}}(c).email:null)||o;if(!i)throw new Error("Could not determine account email from OAuth response");return function(e,t,o){n.set(e,{access_token:t,expires_at:Date.now()+1e3*(o||3600)})}(i,r,s),r}export function clearGoogleAccessToken(e){e&&n.delete(e)}export async function getGoogleAccessToken(e,c,s=null,i=!1){if(!e)throw new Error("clientId not provided");const a=chrome.identity.getRedirectURL(),u=s?n.get(s):null;if(!i&&u?.access_token&&Date.now()<u.expires_at-3e5)return u.access_token;if(!i&&s)try{const n=t(e,a,c,"none",s),i=r(await o(n,!1),s);if(i)return i}catch(e){}const l=t(e,a,c,"select_account",s),p=r(await o(l,!0),s);if(!p)throw new Error("No access_token in OAuth response");return p}