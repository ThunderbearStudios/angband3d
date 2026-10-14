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
import{floodgate as t}from"./floodgate.js";import{util as o}from"./util.js";import{checkUserLocaleEnabled as e,safeParseFeatureFlag as a}from"./gsuite/util.js";import{resolveInactiveTabChallenger as n}from"./direct-verb-inactive-tab-utils.js";async function i(i){const[r,l,s]=await Promise.all([t.hasFlag("dc-cv-gmail-convert-email-to-pdf"),t.hasFlag("dc-cv-gmail-convert-email-to-pdf-control"),t.hasFlag("dc-cv-gmail-email-to-pdf-inactive-tab")]);let c;r?c=a("dc-cv-gmail-convert-email-to-pdf"):l&&(c=a("dc-cv-gmail-convert-email-to-pdf-control"));const T=e(c?.enLocaleEnabled,c?.nonEnLocaleEnabled),g=c?.selectors,m=c?.fteConfig,v=c?.fteEnabled||!1,d=!o.isAcrobatTouchPointEnabled("acrobat-touch-point-in-gmail"),f=r&&!d&&T,p=!(!f||!s)&&await n("gmail");i({enableGmailConvertEmailToPdfTouchpoint:f,selectors:g,fteEnabled:v,fteConfig:m,fteToolTipStrings:{title:o.getTranslation("gmailConvertEmailToPDFFteTitle"),description:o.getTranslation("gmailConvertEmailToPDFFteDescription"),button:o.getTranslation("closeButton")},touchpointText:o.getTranslation("gmailConvertEmailToPDF"),tooltipText:o.getTranslation("gmailConvertEmailToPDFTooltip"),inactiveTabDirectVerbProcessingEnabled:p,convertingTouchPointText:o.getTranslation("convertingTouchPointText"),convertingTooltip:o.getTranslation("convertingTooltip"),convertToPdfToastMessage:o.getTranslation("convertToPdfToastMessage"),convertToPdfErrorToastMessage:o.getTranslation("convertToPdfErrorToastMessage"),convertToPdfTabCloseErrorToastMessage:o.getTranslation("convertToPdfTabCloseErrorToastMessage"),tryAgain:o.getTranslation("tryAgain")})}export{i as gmailConvertEmailPdfInit};