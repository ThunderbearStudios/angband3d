const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const violations = [];
    await page.evaluateOnNewDocument(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
            window.cspViolations = window.cspViolations || [];
            window.cspViolations.push(e.violatedDirective + ' ' + e.originalPolicy);
            console.error('CSP Violation: ', e.violatedDirective, e.originalPolicy);
        });
    });

    page.on('console', msg => {
        if (msg.text().includes('CSP Violation')) {
            violations.push(msg.text());
        }
    });

    try {
        await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0' });
        console.log('Loaded index');
        // Click on a realm to load wasm
        await page.click('button[data-realm="vanilla"]'); // wait, the realm buttons are somewhere.
        // Let's just navigate to /wasm/angband.js directly and see if it loads or what. Wait, it's a JS file.
        // Better: Wait for game to initialize
        await new Promise(r => setTimeout(r, 2000));

    } catch (e) {
        console.error(e);
    }
    console.log('Violations:', violations);
    
    // Check if wasm-unsafe-eval was enough
    await browser.close();
})();
