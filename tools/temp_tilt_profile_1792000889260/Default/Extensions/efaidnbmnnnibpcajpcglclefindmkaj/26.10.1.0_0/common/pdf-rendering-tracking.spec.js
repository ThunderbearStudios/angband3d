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
jest.mock("./local-storage.js",()=>({dcSessionStorage:{getItem:jest.fn(),removeItem:jest.fn()},dcLocalStorage:{getItem:jest.fn()}})),jest.mock("./util.js",()=>({getFloodgateFlag:jest.fn().mockResolvedValue(!1)})),jest.mock("../sw_modules/direct-verb-utils.js",()=>({DIRECT_VERB_PROP:{SOURCE_TAB_ID:"sourceTabId",INACTIVE_TAB_FLOW:"inactiveTabDirectVerbProcessingEnabled",PAYWALL_SHOWN:"paywallShown",CONVERSION_ERROR_SHOWN:"conversionErrorShown",SOURCE_TAB_URL:"sourceTabUrl",PROMOTION_SOURCE:"promotionSource"},getDirectVerbProperty:jest.fn(),getDirectVerbSessionId:jest.fn().mockReturnValue("session1"),logDirectVerbPerfMetrics:jest.fn(),removeInactiveTabDirectVerbSessionFlag:jest.fn()}));const{pdfRenderingTabCloseListener:e}=require("./pdf-rendering-tracking.js"),{getDirectVerbProperty:o,removeInactiveTabDirectVerbSessionFlag:r}=require("../sw_modules/direct-verb-utils.js");describe("direct flow tab-close toast",()=>{beforeEach(()=>{jest.clearAllMocks(),global.chrome={tabs:{sendMessage:jest.fn().mockResolvedValue()}}}),it.each([[!1,!1,!1,!1],[void 0,!1,!1,!1],[!0,!1,!1,!0],[!0,!0,!1,!1],[!0,!1,!0,!1]])("inactive=%s paywall=%s error=%s sends toast=%s",async(s,t,a,c)=>{const n={sourceTabId:10,inactiveTabDirectVerbProcessingEnabled:s,paywallShown:t,conversionErrorShown:a,sourceTabUrl:"https://drive.google.com/",promotionSource:"gdrive"};o.mockImplementation((e,o)=>n[o]),await e(20),expect(r).toHaveBeenCalledWith(20),c?expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10,{content_op:"show-direct-verb-tab-close-error-toast",sourceTabUrl:n.sourceTabUrl,promotionSource:"gdrive",directVerbSessionId:"session1"}):expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()})});