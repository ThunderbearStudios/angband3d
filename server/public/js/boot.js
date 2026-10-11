'use strict';
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        // Stop propagation for Hengband language selector wrap
        const langWrap = document.querySelector('.splash-lang-select-wrap');
        if (langWrap) {
            langWrap.addEventListener('click', e => e.stopPropagation());
        }

        // Demo recorder load
        if (window.location.search && window.location.search.includes('record_walkthrough=1')) {
            const s = document.createElement('script');
            s.src = '/js/demo-recorder.js?v=' + Date.now();
            document.body.appendChild(s);
        }
    });
})();
