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
const CONTENT_PATH_RE=/\/(blog|news|post|article|story)(\/|$)/i,LONG_FORM_WORD_THRESHOLD=1e3,ARTICLE_WORD_THRESHOLD=500,TEXT_DENSITY_THRESHOLD=30,MIN_HEIGHT_VIEWPORT_MULTIPLIER=1.5;export function hasMinimumHeight(){return document.documentElement.scrollHeight>=1.5*window.innerHeight}export function hasLongFormText(t){return t.wordCount>=1e3}export function hasArticleStructure(t){return t.structural.hasArticle&&t.wordCount>500}export function hasContentPathPattern(){return CONTENT_PATH_RE.test(window.location.pathname)}export function passesTextDensityGuardrail(t){if(!t)return!0;return(t.innerText?.length??0)/(Array.from(t.querySelectorAll("*")).filter(t=>1!==t.childNodes.length).length||1)>=30}export async function isEligible(){if(!hasMinimumHeight())return!1;const t=await GenAIWebpageEligibilityService.getContentScore();if(!t)return!1;return!!(hasLongFormText(t)||hasArticleStructure(t)||hasContentPathPattern())&&passesTextDensityGuardrail(t.root)}