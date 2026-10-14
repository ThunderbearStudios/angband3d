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
import e from"fs";import r from"path";import{parse as t}from"@babel/parser";it("keeps every static readability dependency web-accessible to content scripts",()=>{const s=r.resolve(__dirname,"../.."),i=JSON.parse(e.readFileSync(r.join(s,"manifest.template.json"),"utf8")).web_accessible_resources.flatMap(e=>e.resources),a=new Set,o=n=>{if(a.has(n))return;a.add(n);const c=r.relative(s,n).split(r.sep).join("/");if(expect(i).toContain(c),"libs/readability.js"===c)return;const l=e.readFileSync(n,"utf8");t(l,{sourceType:"module"}).program.body.filter(e=>"ImportDeclaration"===e.type).forEach(e=>{o(r.resolve(r.dirname(n),e.source.value))})};o(r.join(s,"resources/SidePanel/sidePanelUtil.js"))});