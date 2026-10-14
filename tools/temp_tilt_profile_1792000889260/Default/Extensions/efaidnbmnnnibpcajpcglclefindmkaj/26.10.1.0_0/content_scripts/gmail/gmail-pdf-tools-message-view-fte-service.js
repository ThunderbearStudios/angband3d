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
import{sendAnalytics,sendErrorLog}from"../utils/util.js";import{createFteTooltip,addFteCloseButtonListener,updateFteToolTipCoolDown}from"../utils/fte-utils.js";import state from"./state.js";const SOURCE="gmail_chrome",GMAIL_PDF_TOOLS_MESSAGE_VIEW_WORKFLOW="gmail_acrobat_tools_dialog",MESSAGE_VIEW_FTE_STORAGE_KEY="ac-gm-acrobat-tools-fte",FTE_TYPE="gmailAcrobatTools",ALWAYS_THROTTLE_CONFIG={frequency:"always"};export const addFte=async()=>{try{const o=state?.gmailAcrobatToolsFteState?.ctaContainerForFTE;if(!o)return;const t=state?.gmailAcrobatToolsConfig,e=t?.fteTooltipStrings||{},a=createFteTooltip({title:e.title,description:e.description,button:e.button},FTE_TYPE),s=()=>{a.remove(),a.clickOutsideHandler&&document.removeEventListener("click",a.clickOutsideHandler,!0),a.keydownHandler&&document.removeEventListener("keydown",a.keydownHandler,!0)};a.clickOutsideHandler=o=>{a.contains(o.target)||(s(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Dismissed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]))},a.keydownHandler=t=>{const e=("Enter"===t.key||" "===t.key)&&"pdf-tools-button-shadow-host"===t.target?.id&&o.contains(t.target);("Escape"===t.key||e)&&(s(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Dismissed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]))},addFteCloseButtonListener(a,{fteType:FTE_TYPE,onClose:()=>{s(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Closed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]])},sendErrorLog:sendErrorLog}),document.addEventListener("click",a.clickOutsideHandler,!0),document.addEventListener("keydown",a.keydownHandler,!0),o.appendChild(a),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Shown",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]),await updateFteToolTipCoolDown(t?.fteConfig?.tooltip,"ac-gm-acrobat-tools-fte")}catch(o){sendErrorLog("GmailPdfToolsMessageViewFte","Failure in adding FTE to PDF tools message view")}finally{state?.gmailAcrobatToolsFteState&&(state.gmailAcrobatToolsFteState.ctaContainerForFTE=null)}};