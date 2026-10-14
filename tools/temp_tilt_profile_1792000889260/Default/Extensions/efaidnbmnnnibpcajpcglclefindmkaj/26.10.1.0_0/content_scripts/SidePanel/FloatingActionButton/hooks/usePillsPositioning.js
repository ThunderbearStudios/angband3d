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
import{useState,useEffect}from"react";export const usePillsPositioning=(t,e,n,o=!1,s=!1)=>{const[c,r]=useState(!1);return useEffect(()=>{if(t&&n.current){const t=n.current.getBoundingClientRect();let c=24;o?c=0:e&&(c=56);const u=s?32:c+72+32,i=t.top;r(i<u+20)}},[t,e,n,o,s]),c};