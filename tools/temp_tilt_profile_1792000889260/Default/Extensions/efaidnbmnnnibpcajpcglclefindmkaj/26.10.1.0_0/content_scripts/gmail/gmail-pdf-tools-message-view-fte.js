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
const PDF_TOOLS_MESSAGE_VIEW_FTE_STORAGE_KEY="ac-gm-acrobat-tools-fte",PDF_TOOLS_MESSAGE_VIEW_FTE_CONTAINER_CLASS="acrobat-fte-tooltip-container-gmailAcrobatTools",PDF_TOOLS_CTA_CONTAINER_ID="pdf-tools-cta-container";class GmailPdfToolsMessageViewFte{id="GmailPdfToolsMessageViewFte";timeout=3e3;static GMAIL_DOMAINS=["mail.google.com"];constructor(){const t=window.location.hostname;if(!GmailPdfToolsMessageViewFte.GMAIL_DOMAINS.some(e=>t.includes(e)))return this.isEligible=async()=>!1,void(this.render=async()=>{});this.initPromise=this.loadServices()}async loadServices(){[this.fteUtils,this.gmailPdfToolsMessageViewFteService,this.state]=await Promise.all([import(chrome.runtime.getURL("content_scripts/utils/fte-utils.js")),import(chrome.runtime.getURL("content_scripts/gmail/gmail-pdf-tools-message-view-fte-service.js")),import(chrome.runtime.getURL("content_scripts/gmail/state.js"))])}async render(){await(this.gmailPdfToolsMessageViewFteService?.addFte?.()),GmailPdfToolsMessageViewFte.keepFteAlive()}static keepFteAlive(){const t=document.querySelector(`.${PDF_TOOLS_MESSAGE_VIEW_FTE_CONTAINER_CLASS}`);if(!t)return;let e=t.parentElement;if(!e)return;const i=new MutationObserver(()=>{if(t.isConnected)return;if(e?.isConnected)return void i.disconnect();const o=document.getElementById("pdf-tools-cta-container");o&&(o.appendChild(t),e=o)});i.observe(document.body,{childList:!0,subtree:!0})}async isEligible(){const t=await chrome.runtime.sendMessage({main_op:"touchpoint-init",touchpointId:"gmail-acrobat-tools"});if(!t?.enabled||!t?.enableFte)return!1;await this.initPromise;const e=this.state?.default,i=e?.gmailAcrobatToolsFteState?.ctaContainerForFTE;if(!i)return!1;const o=await(this.fteUtils?.initFteStateAndConfig?.("ac-gm-acrobat-tools-fte")),s=t?.fteConfig;return await(this.fteUtils?.shouldShowFteTooltip?.(s?.tooltip,o,t.enableFte))}}