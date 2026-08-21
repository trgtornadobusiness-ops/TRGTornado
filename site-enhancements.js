/* TRG shared navigation + alert routing + hard ticker sanitation V74 */
(()=>{
function nav(){const n=document.querySelector('header nav');if(!n||n.querySelector('a[href="tropical.html"]'))return;const a=document.createElement('a');a.href='tropical.html';a.textContent='Tropics';const radar=n.querySelector('a[href="maps.html"]');radar?n.insertBefore(a,radar):n.appendChild(a)}
function clicks(){document.addEventListener('click',e=>{const t=e.target.closest?.('.ticker-item[data-alert-id],a.alert');if(!t)return;const id=t.dataset.alertId||(()=>{try{return new URL(t.href,location.href).searchParams.get('alert')}catch{return null}})();if(id){e.preventDefault();e.stopImmediatePropagation();location.href='maps.html?alert='+encodeURIComponent(id)}},true)}
function clean(){const root=document.getElementById('alertTicker');if(!root)return;root.querySelectorAll('.ticker-item').forEach(n=>{const text=(n.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();if(text.includes('FLOOD')&&!text.includes('FLASH FLOOD'))n.remove()})}
function init(){nav();clicks();clean();const root=document.getElementById('alertTicker');if(root){new MutationObserver(clean).observe(root,{childList:true,subtree:true});setInterval(clean,250)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
