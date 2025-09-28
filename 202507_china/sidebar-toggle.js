// Sidebar toggle logic for gallery site
// Collapses/expands sidebar and auto-collapses on link click (mobile)
document.addEventListener('DOMContentLoaded', function() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('menu-toggle');
  const eventSelect = document.getElementById('eventSelect');
  const container = document.querySelector('.container');

  function setSidebarCollapsed(collapsed) {
    if (window.innerWidth <= 700) {
      sidebar.classList.remove('collapsed');
      if (collapsed) {
        sidebar.classList.remove('open');
        container.classList.add('sidebar-collapsed');
      } else {
        sidebar.classList.add('open');
        container.classList.remove('sidebar-collapsed');
      }
    } else {
      sidebar.classList.toggle('collapsed', collapsed);
      container.classList.toggle('sidebar-collapsed', collapsed);
    }
  }

  // Initial state: collapsed
  setSidebarCollapsed(true);

  toggleBtn.addEventListener('click', function() {
    if (window.innerWidth <= 700) {
      const isOpen = sidebar.classList.contains('open');
      setSidebarCollapsed(isOpen);
    } else {
      const isCollapsed = sidebar.classList.contains('collapsed');
      setSidebarCollapsed(!isCollapsed);
    }
  });

  // Collapse sidebar when selecting an option
  eventSelect.addEventListener('change', function() {
    setSidebarCollapsed(true);
  });

  // Also collapse on tab link click (for mobile)
  sidebar.addEventListener('click', function(e) {
    if (window.innerWidth <= 700 && e.target.tagName === 'A') {
      setSidebarCollapsed(true);
    }
  });

  // Ensure sidebar is collapsed on resize
  window.addEventListener('resize', function() {
    setSidebarCollapsed(true);
  });
});
