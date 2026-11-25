#!/usr/bin/env node
/**
 * tools/patch_basis_csp_safe.js
 *
 * Replaces Emscripten embind's 2 dynamic `newFunc(Function, ...)` codegen helpers
 * in `basis_transcoder.js` with strict-CSP zero-eval closure equivalents (`-s DYNAMIC_EXECUTION=0`).
 * Never requires `'unsafe-eval'` in Content-Security-Policy.
 */
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js');
const DST = path.join(ROOT, 'server/public/assets/basis/basis_transcoder.js');

const TARGET_CRAFT = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!=="void";var closureArgs=[humanName,throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,argTypes[0],argTypes[1]];for(var i=0;i<argCount-2;++i){closureArgs.push(argTypes[i+2])}if(!needsDestructorStack){for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){closureArgs.push(argTypes[i].destructorFunction)}}}let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);args.push(invokerFnBody);var invokerFn=newFunc(Function,args)(...closureArgs);return createNamedFunction(humanName,invokerFn)}`;
const REPL_CRAFT = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc,isAsync){var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=usesDestructorStack(argTypes);var returns=argTypes[0].name!=="void";var expectedArgCount=argCount-2;var retType=argTypes[0];var classParam=argTypes[1];var invokerFn=function(){if(arguments.length!==expectedArgCount){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expectedArgCount)}var destructors=needsDestructorStack?[]:null;var wiredArgs=[cppTargetFunc];var thisWired;if(isClassMethodFunc){thisWired=classParam["toWireType"](destructors,this);wiredArgs.push(thisWired)}for(var i=0;i<expectedArgCount;++i){wiredArgs.push(argTypes[i+2]["toWireType"](destructors,arguments[i]))}var rv=cppInvokerFunc.apply(null,wiredArgs);if(needsDestructorStack){runDestructors(destructors)}else{for(var j=isClassMethodFunc?1:2;j<argTypes.length;++j){if(argTypes[j].destructorFunction!==null){var val=j===1?thisWired:wiredArgs[(isClassMethodFunc?2:1)+(j-2)];argTypes[j].destructorFunction(val)}}}if(returns){return retType["fromWireType"](rv)}};return createNamedFunction(humanName,invokerFn)}`;

const TARGET_EMVAL = `var __emval_get_method_caller=(argCount,argTypes,kind)=>{var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var functionBody=\`return function (obj, func, destructorsRef, args) {\\n\`;var offset=0;var argsList=[];if(kind===0){argsList.push("obj")}var params=["retType"];var args=[retType];for(var i=0;i<argCount;++i){argsList.push("arg"+i);params.push("argType"+i);args.push(types[i]);functionBody+=\`  var arg\${i} = argType\${i}.readValueFromPointer(args\${offset?"+"+offset:""});\\n\`;offset+=types[i]["argPackAdvance"]}var invoker=kind===1?"new func":"func.call";functionBody+=\`  var rv = \${invoker}(\${argsList.join(", ")});\\n\`;if(!retType.isVoid){params.push("emval_returnValue");args.push(emval_returnValue);functionBody+="  return emval_returnValue(retType, destructorsRef, rv);\\n"}functionBody+="};\\n";params.push(functionBody);var invokerFunction=newFunc(Function,params)(...args);var functionName=\`methodCaller<(\${types.map(t=>t.name).join(", ")}) => \${retType.name}>\`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};`;
const REPL_EMVAL = `var __emval_get_method_caller=(argCount,argTypes,kind)=>{var types=emval_lookupTypes(argCount,argTypes);var retType=types.shift();argCount--;var invokerFunction=function(obj,func,destructorsRef,args){var offset=0;var callArgs=[];for(var i=0;i<argCount;++i){callArgs.push(types[i].readValueFromPointer(args+offset));offset+=types[i]["argPackAdvance"]}var rv=kind===1?Reflect.construct(func,callArgs):(kind===0?func.apply(obj,callArgs):func.call(...callArgs));if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};var functionName=\`methodCaller<(\${types.map(t=>t.name).join(", ")}) => \${retType.name}>\`;return emval_addMethodCaller(createNamedFunction(functionName,invokerFunction))};`;

function main() {
    assert(fs.existsSync(SRC), `Missing source basis_transcoder.js: ${SRC}`);
    let code = fs.readFileSync(SRC, 'utf8');
    assert(code.includes(TARGET_CRAFT), 'craftInvokerFunction target snippet not found in basis_transcoder.js');
    assert(code.includes(TARGET_EMVAL), '__emval_get_method_caller target snippet not found in basis_transcoder.js');

    code = code.replace(TARGET_CRAFT, REPL_CRAFT).replace(TARGET_EMVAL, REPL_EMVAL);
    assert.strictEqual(code.includes('newFunc(Function'), false, 'newFunc(Function) still present after patch');

    fs.mkdirSync(path.dirname(DST), { recursive: true });
    fs.writeFileSync(DST, code, 'utf8');
    execFileSync(process.execPath, ['--check', DST], { stdio: 'pipe' });
    console.log(`[patch_basis_csp_safe] PASS (${Buffer.byteLength(code)} bytes, 0 newFunc(Function) calls)`);
}

main();
