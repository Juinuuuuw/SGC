// js/mobile.js
// Comportamento do menu lateral (drawer) em dispositivos móveis.
// Este script deve ser carregado APÓS o script.js principal.

(function () {
  const MOBILE_BREAKPOINT = 900;

  const sidebar       = document.querySelector('.sidebar');
  const toggleBtn     = document.getElementById('toggle-sidebar-btn');
  const overlay       = document.getElementById('sidebar-overlay');
  const closeBtn      = document.getElementById('mobile-close-sidebar');
  const allMenuItems  = document.querySelectorAll('.sidebar nav ul li[data-section]');

  if (!sidebar || !toggleBtn || !overlay) return;

  // ── Helpers ───────────────────────────────────────────
  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function openSidebar() {
    sidebar.classList.add('mobile-open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden'; // impede scroll do fundo
  }

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('mobile-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // ── Eventos ───────────────────────────────────────────

  // Botão hambúrguer: em mobile usa drawer; em desktop mantém comportamento original
  toggleBtn.addEventListener('click', (e) => {
    if (!isMobile()) return; // deixa o handler original do script.js agir em desktop
    e.stopPropagation();
    toggleSidebar();
  });

  // Botão "×" dentro da sidebar
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSidebar);
  }

  // Overlay escurece o fundo: fechar ao tocar fora
  overlay.addEventListener('click', closeSidebar);

  // Fechar sidebar ao navegar para uma seção (UX mobile)
  allMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      if (isMobile()) {
        // Pequeno delay para a navegação acontecer visivelmente antes de fechar
        setTimeout(closeSidebar, 120);
      }
    });
  });

  // Ao redimensionar de mobile para desktop, limpar estado
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      closeSidebar();
    }
  });

  // ── Swipe para fechar (toque) ──────────────────────────
  let touchStartX = 0;

  sidebar.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  sidebar.addEventListener('touchend', (e) => {
    const deltaX = e.changedTouches[0].screenX - touchStartX;
    // Deslizar para esquerda > 60px fecha o menu
    if (deltaX < -60 && isMobile()) {
      closeSidebar();
    }
  }, { passive: true });

})();
