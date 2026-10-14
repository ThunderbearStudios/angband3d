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
import e from"../../libs/lottie-light-esm.js";import{isPanelTourEligible as o,shouldLogPanelTourUnsupportedBrowser as i,showTrefoilLoader as n,supportsPanelTourPositioning as t}from"./loaderUIHelper.js";jest.mock("../../libs/lottie-light-esm.js",()=>({__esModule:!0,default:{loadAnimation:jest.fn()}}),{virtual:!0}),describe("Panel Tour loader selection",()=>{beforeEach(()=>{document.body.innerHTML='\n            <div class="loader-container hidden">\n                <div id="lottie-animation"></div>\n            </div>\n        ',jest.clearAllMocks(),global.chrome={runtime:{getURL:jest.fn(e=>e)}}}),it("shows the existing trefoil loader",()=>{n(),expect(document.getElementById("lottie-animation").classList.contains("hidden")).toBe(!1),expect(e.loadAnimation).toHaveBeenCalledTimes(1)}),it("requires both anchor naming and position fallbacks",()=>{const e=jest.fn(e=>"anchor-name"===e);expect(t({supports:e})).toBe(!1),expect(e).toHaveBeenCalledWith("position-try-fallbacks","flip-block")}),it("supports the tour when both required CSS capabilities are available",()=>{expect(t({supports:jest.fn(()=>!0)})).toBe(!0)}),it.each([["onboarding disabled",!1,!0,!0,"",!0],["Home disabled",!0,!1,!0,"",!0],["non-Home route",!0,!0,!1,"",!0],["unsupported browser",!0,!0,!0,"",!1],["tour already shown",!0,!0,!0,!0,!0],["malformed history",!0,!0,!0,"unexpected",!0]])("fails closed for %s",(e,i,n,t,s,a)=>{expect(o({isHomeOnboardingEnabled:i,isSidePanelHomeEnabled:n,isHomeRoute:t,homeOnboardingTourShown:s,supportsPanelTourPositioning:a})).toBe(!1)}),it.each(["",!1,"false"])("shows for an eligible first Home load with %p tour history",e=>{expect(o({isHomeOnboardingEnabled:!0,isSidePanelHomeEnabled:!0,isHomeRoute:!0,homeOnboardingTourShown:e,supportsPanelTourPositioning:!0})).toBe(!0)}),it("logs an unsupported-browser diagnostic only when every other tour gate passes",()=>{expect(i({isHomeOnboardingEnabled:!0,isSidePanelHomeEnabled:!0,isHomeRoute:!0,homeOnboardingTourShown:"",supportsPanelTourPositioning:!1})).toBe(!0)}),it.each([["browser supported",!0,!0,!0,"",!0],["onboarding disabled",!1,!0,!0,"",!1],["Home disabled",!0,!1,!0,"",!1],["non-Home route",!0,!0,!1,"",!1],["tour already shown",!0,!0,!0,!0,!1]])("does not log an unsupported-browser diagnostic when %s",(e,o,n,t,s,a)=>{expect(i({isHomeOnboardingEnabled:o,isSidePanelHomeEnabled:n,isHomeRoute:t,homeOnboardingTourShown:s,supportsPanelTourPositioning:a})).toBe(!1)})});