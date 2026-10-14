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
jest.mock("./util.js",()=>({sendAnalytics:jest.fn(),sendErrorLog:jest.fn(),getElementFromParent:(t,e)=>e?.getElementsByClassName(t[0])?.[0]??null}));const{showToast:showToast}=require("./toast-service.js");describe("toast service",()=>{let t,e;beforeEach(()=>{document.body.innerHTML="",t=[],e=global.fetch,global.fetch=jest.fn(()=>new Promise(e=>t.push(e)))}),afterEach(()=>{global.fetch=e}),it("shows only the newest toast when concurrent toast requests complete out of order",async()=>{const e=showToast("gmail","Converting to PDF"),o=showToast("gmail","Conversion failed",{variant:"error"}),s={text:async()=>'<div class="acrobat-toast"><div class="acrobat-toast-message"></div></div>'};t[1](s),await o,t[0](s),await e;const a=document.querySelectorAll("#acrobat-toast-container");expect(a).toHaveLength(1),expect(a[0].textContent).toContain("Conversion failed"),expect(a[0].classList.contains("acrobat-toast-error")).toBe(!0)})});