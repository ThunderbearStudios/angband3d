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
import{floodgate as e}from"./floodgate.js";import{dcLocalStorage as t}from"../common/local-storage.js";import{setExperimentCodeForAnalytics as o,removeExperimentCodeForAnalytics as r}from"../common/experimentUtils.js";import{checkUserLocaleEnabled as i,safeParseFeatureFlag as n}from"./gsuite/util.js";import{CACHE_PURGE_SCHEME as s}from"./constant.js";const m="dc-cv-lightweight-embedded-viewer";async function d(d,h,l){const[a,c]=await Promise.all([e.hasFlag(m,s.NO_CALL),e.hasFlag("dc-cv-lightweight-embedded-viewer-control",s.NO_CALL)]),g=n(m),L="false"!==t.getItem("lightweight-embedded-viewer"),u=i(g.enLocaleEnabled,g.nonEnLocaleEnabled);a&&u?(r("LEVC"),o("LEV")):c&&u?(r("LEV"),o("LEVC")):(r("LEV"),r("LEVC"));const f=Number.isFinite(g.widthThreshold)?g.widthThreshold:800,w=Number.isFinite(g.heightThreshold)?g.heightThreshold:450,b="number"!=typeof d||d>=f,p="number"!=typeof h||h>=w,E=!function(e,t){if(!e||!Array.isArray(t))return!1;const o=e.toLowerCase().trim();return t.some(e=>{const t=String(e).toLowerCase().trim();return o===t||o.endsWith(`.${t}`)})}(l,g.excludedDomains);return a&&L&&u&&b&&p&&E}export{d as lightweightPDFViewerConfig};