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
import{dcLocalStorage as e}from"../../common/local-storage.js";import{checkForImsSidCookie as o}from"../../common/util.js";import{largeBlobStorage as n}from"../../common/large-blob-storage.js";import t from"../../libs/lottie-light-esm.js";import{isGenAiRoute as r,getSidePanelTabId as s}from"./sidePanelUtil.js";export const hideTrefoilLoader=()=>{document.querySelector(".loader-container")?.classList.add("hidden")};export const showTrefoilLoader=()=>{const e=document.querySelector(".loader-container");document.getElementById("lottie-animation")?.classList.remove("hidden"),e.classList.remove("hidden"),t.loadAnimation({container:document.getElementById("lottie-animation"),renderer:"svg",loop:!0,autoplay:!0,path:chrome.runtime.getURL("/resources/SidePanel/TrefoilLoader-NoPad.json")})};export const supportsPanelTourPositioning=e=>"function"==typeof e?.supports&&e.supports("anchor-name","--panel-tour-support-check")&&e.supports("position-try-fallbacks","flip-block");export const isPanelTourEligible=({isHomeOnboardingEnabled:e,isSidePanelHomeEnabled:o,isHomeRoute:n,homeOnboardingTourShown:t,supportsPanelTourPositioning:r})=>{const s=!0===o||"true"===o,i=[void 0,null,"",!1,"false"].includes(t);return!0===e&&s&&!0===n&&!0===r&&i};export const shouldLogPanelTourUnsupportedBrowser=e=>!0!==e.supportsPanelTourPositioning&&isPanelTourEligible({...e,supportsPanelTourPositioning:!0});export const getGenAiPrerenderState=async(t,i)=>{if(!r(t))return null;const a=await(async()=>{try{const e=s();if(!Number.isFinite(e))return!1;const o=await chrome.tabs.sendMessage(e,{main_op:"hasPendingInitialQuestion"});return!!o?.hasPendingInitialQuestion}catch{return!1}})();if(a)return{showPreRendered:!1,ssrHtml:null,hasPendingPrompt:a};const l=!await o(),d=e.getItem("enableCSSSRForAnon"),u=e.getItem("enableCSSSRForSignedIn"),m=l?!!d:!!u,c=l?"anonGenAISSRHtml":"signedInGenAISSRHtml",p=await n.getItem(c);return{showPreRendered:m&&!!p,ssrHtml:p}};export const shouldShowTrefoilLoader=e=>!e?.showPreRendered;