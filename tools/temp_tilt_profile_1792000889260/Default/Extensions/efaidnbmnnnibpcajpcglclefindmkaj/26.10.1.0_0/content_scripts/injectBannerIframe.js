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
function injectBannerInFrame(n){"use strict";const e=n.showToast?"50px":"100px",t=n.showToast?"450px":"100%";let o=document.getElementById("__acrobatBanner__");o?"none"===o.style.display&&"visible"===n.frame_visibility&&(o.style.display="block"):(o=document.createElement("iframe"),o.id="__acrobatBanner__",o.style.cssText=`\n            border: 0;\n            z-index: 2147483647;\n            position: fixed;\n            bottom: ${n.showToast?"25px":"0px"};\n            width: ${t};\n            height: ${e};\n            display: ${"hidden"===n.frame_visibility?"none":"block"};\n            margin: auto;\n            background: transparent;\n            color-scheme: auto;\n        `,n.showToast&&(o.style.right="calc(50% - 200px)",o.style.borderRadius="4px"),o.src=chrome.runtime.getURL(n.showToast?"browser/js/successToast.html":"browser/js/download-banner.html"),document.documentElement.appendChild(o))}function handleDismissBanner(n){if("dismissBanner"!==n?.content_op)return;let e=document.getElementById("__acrobatBanner__");e&&(e.remove(),e=null)}function handleLoadDownloadBanner(n){"load-downloadBanner"===n?.panel_op&&injectBannerInFrame(n)}void 0!==chrome.runtime&&(window.acrobatExtensionMessaging.registerContentScriptMessageHandler("content_op",["dismissBanner"],handleDismissBanner,{endpoint:"inject-banner-iframe"}),window.acrobatExtensionMessaging.registerContentScriptMessageHandler("panel_op",["load-downloadBanner"],handleLoadDownloadBanner,{endpoint:"inject-banner-iframe"}));