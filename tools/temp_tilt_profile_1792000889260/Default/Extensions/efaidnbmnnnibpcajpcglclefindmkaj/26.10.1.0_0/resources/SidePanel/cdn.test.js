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
jest.mock("../../common/loggingApi.js",()=>({loggingApi:{info:jest.fn(),error:jest.fn()}})),jest.mock("../../common/util.js",()=>({getGenAIServiceVariant:jest.fn(()=>"default")})),jest.mock("../../common/experimentUtils.js",()=>({getActiveExperimentAnalyticsArray:jest.fn(()=>[])})),jest.mock("../../browser/js/content-util.js",()=>({util:{getTranslation:jest.fn(()=>"")}})),jest.mock("../../common/host-page-context.js",()=>({HOST_PAGE_TYPE:{DEFAULT:"default"}})),jest.mock("./sidePanelUtil.js",()=>({getSidePanelTabId:jest.fn(()=>1),connectSidePanelPort:jest.fn(()=>({}))}));const e={sidepanelUrl:"https://hosted.example.com/",sidePanelUUID:"uuid-1"};function t(t={}){const s={...e,...t};jest.doMock("../../common/local-storage.js",()=>({dcLocalStorage:{getItem:jest.fn(e=>s[e])}}))}const s=()=>require("./cdn.js").Cdn;describe("Cdn — extension tour decision -> ohts URL param (AC-12)",()=>{beforeEach(()=>{jest.resetModules(),document.body.innerHTML="<iframe id='sidepanel'></iframe>"}),describe("Cdn — extension pin state -> eip URL param",()=>{beforeEach(()=>{jest.resetModules(),document.body.innerHTML="<iframe id='sidepanel'></iframe>",t()}),it.each([[!0,"true"],[!1,"false"]])("forwards isExtensionPinned=%s",(e,t)=>{const o=new(s())({initTimeStamp:0,hostedHashRoute:"#/home",isExtensionPinned:e});expect(new URL(o.iframeElement.src).searchParams.get("eip")).toBe(t)}),it("omits eip for callers that do not provide a pin state",()=>{const e=new(s())({initTimeStamp:0,hostedHashRoute:"#/side-panel"});expect(new URL(e.iframeElement.src).searchParams.has("eip")).toBe(!1)})}),it("forwards ohts=true when the extension decides not to show the tour",()=>{t();const e=new(s())({initTimeStamp:0,hostedHashRoute:"#/home",shouldShowPanelTour:!1});expect(new URL(e.iframeElement.src).searchParams.get("ohts")).toBe("true")}),it("forwards ohts=false only when the extension enables the tour",()=>{t();const e=new(s())({initTimeStamp:0,hostedHashRoute:"#/home",shouldShowPanelTour:!0});expect(new URL(e.iframeElement.src).searchParams.get("ohts")).toBe("false"),expect(e.shouldShowPanelTour).toBe(!0)}),it("fails closed and still forwards ohts=true when the decision is omitted",()=>{t();const e=new(s())({initTimeStamp:0,hostedHashRoute:"#/home"});expect(new URL(e.iframeElement.src).searchParams.has("ohts")).toBe(!0),expect(new URL(e.iframeElement.src).searchParams.get("ohts")).toBe("true")})});