const ESC = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
window.escapeHtml = function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ESC[c]); };
