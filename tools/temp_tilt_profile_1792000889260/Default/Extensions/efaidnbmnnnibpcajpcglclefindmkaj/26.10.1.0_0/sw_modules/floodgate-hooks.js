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
import{toggleExpressTouchpoints as o}from"./express/express-context-menu.js";import{toggleAddWebpageToProjectContextMenu as e}from"./add-webpage-to-project.js";import{toggleOutlookInjectContentScript as t}from"./outlook-module.js";import{viewerModuleUtils as r}from"./viewer-module-utils.js";import{communicate as m}from"./communicate.js";import{registerFloodgateHooks as s}from"./floodgate.js";export const floodgateHooks={onFloodgateCallCompleted(){o(),e(),t()},onViewerFloodgateResponse(){r.updateVariables(m.version)}};s(floodgateHooks);