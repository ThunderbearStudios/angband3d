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
import{getContract as e}from"./message-registry.js";import{MODE as o,DECISION as n}from"./messaging-constants.js";import{validateSchema as t,permit as s,resolveTier as i,evaluateContract as r,describeTargetEndpoint as a}from"./mediation-helpers.js";export{t as validateSchema,s as permit};export async function mediate({busId:t,op:s,envelopeFields:d,request:c,sender:p,endpoint:m,discriminatorField:l,resolveModeFn:u,reportRejectionFn:E,onModeResolved:R}){const A=e(s,l);if(!A)return{decision:n.UNMIGRATED};const D=await u(t,s);if(R?.(D),D===o.UNMIGRATED)return{decision:n.UNMIGRATED};const I=await i(t,p),{passes:T,reason:f}=r(A,I,c,d,m);return T||E({bus:t,op:s,tier:I??null,endpoint:m??a(A.targetEndpoint),reason:f,timestamp:Date.now()}),D===o.DARK_LAUNCH?{decision:n.DARK_LAUNCH_PASS}:T?{decision:n.PERMITTED}:{decision:n.REJECTED,reason:f}}export async function snapshot(n){const{resolveMode:t}=await import("./op-migration-state.js");return Promise.all(n.map(async({busId:n,op:s,discriminatorField:i})=>{const r=e(s,i);if(!r||r.bus!==n)return{busId:n,op:s,mode:o.UNMIGRATED,contract:null};const{allowedSenderTiers:a,schema:d,targetEndpoint:c}=r;return{busId:n,op:s,mode:await t(n,s),contract:{allowedSenderTiers:a,schema:d,targetEndpoint:c}}}))}