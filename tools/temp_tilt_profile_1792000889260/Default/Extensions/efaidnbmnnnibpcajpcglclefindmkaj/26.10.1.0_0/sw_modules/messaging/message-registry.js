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
const i=new Map;const r=new Set(["string","number","boolean","object","null","array"]);function e(i,o,t=""){if(!o||"object"!=typeof o||Array.isArray(o))throw new Error(`invalid schema for op: ${i}`);Object.entries(o).forEach(([o,n])=>{const a=t?`${t}.${o}`:o;if(!n||"object"!=typeof n||"boolean"!=typeof n.required||"string"!=typeof n.type)throw new Error(`invalid schema for op: ${i} (field: ${a})`);if(!r.has(n.type))throw new Error(`invalid schema for op: ${i} (field: ${a}, unknown type: ${n.type})`);if(void 0!==n.schema){if("object"!==n.type)throw new Error(`invalid schema for op: ${i} (field: ${a}, 'schema' is only valid on type "object")`);e(i,n.schema,a)}})}export function assertNoDuplicate(r,e){const o=i.get(r);if(!o)return;if(void 0===e?void 0!==o.plain:o.byDiscriminator.has(e))throw new Error(`duplicate op: ${r}`)}export function register(r){assertNoDuplicate(r.op,r.discriminatorField),e(r.op,r.schema);const o=function(r){let e=i.get(r);return e||(e={plain:void 0,byDiscriminator:new Map},i.set(r,e)),e}(r.op);void 0===r.discriminatorField?o.plain=r:o.byDiscriminator.set(r.discriminatorField,r)}export function getContract(r,e){const o=i.get(r);if(o)return void 0!==e&&o.byDiscriminator.has(e)?o.byDiscriminator.get(e):o.plain}export function listRegisteredOps(){return Array.from(i.keys())}