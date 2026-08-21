/* V61: explicit visual treatment for Considerable Severe Thunderstorm Warnings. */
(() => {
  const apply = () => {
    document.querySelectorAll('#alertsBox .alert.severe').forEach(card => {
      const text = card.textContent || '';
      if (!/considerable/i.test(text)) return;
      card.classList.add('alert-considerable');
      card.style.setProperty('border-color', '#f97316', 'important');
      card.style.setProperty('box-shadow', '0 0 0 1px rgba(249,115,22,.25) inset', 'important');
      const titleRow = card.querySelector('.alert-title-row');
      if (titleRow && !titleRow.querySelector('.v61-considerable')) {
        const label = document.createElement('span');
        label.className = 'alert-priority v61-considerable';
        label.textContent = 'CONSIDERABLE';
        label.style.setProperty('color', '#f97316', 'important');
        label.style.fontWeight = '900';
        titleRow.appendChild(label);
      }
      const icon = card.querySelector('.alert-icon');
      if (icon) icon.style.setProperty('background', '#f97316', 'important');
    });
  };
  new MutationObserver(apply).observe(document.getElementById('alertsBox') || document.body, {childList:true,subtree:true});
  apply();
})();
