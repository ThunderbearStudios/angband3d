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
import{util as o}from"../../js/content-util.js";import{loggingApi as t}from"../../../common/loggingApi.js";import{analytics as e}from"../../../common/analytics.js";import{dcTabStorage as r}from"../tab-storage.js";const n="Error in Outlook Attachment Error Screen:";async function a(){try{e.event("DCBrowserExt:Viewer:Outlook:AttachmentErrorScreen:GoToOutlook:Clicked",{},{frequency:"always"});const o=r.getItem("outlookTabUrl"),{reactivated:t}=await chrome.runtime.sendMessage({main_op:"outlook-attachment-error-go-to-outlook",outlookTabUrl:o})||{};if(t)return;const n=(await chrome.tabs.getCurrent())?.id;if(!n)return;chrome.tabs.update(n,{url:o||"https://outlook.office.com/mail/"})}catch(o){t.error({message:n,error:"handleGoToOutlookClick"})}}!async function(){if(window.top===window.self)try{o.translateElements(".translate");const t=document.getElementById("goToOutlookBtn");t&&t.addEventListener("click",a),e.event("DCBrowserExt:Viewer:Outlook:AttachmentErrorScreen:Shown",{},{frequency:"always"})}catch(o){t.error({message:n,error:"initialize: Error in initialization"})}else window.location.replace("about:blank")}();