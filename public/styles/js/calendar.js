// public/js/calendar.js
function toggleSection(element) {
  const section = element.closest('.calendar-section');
  section.classList.toggle('collapsed');
}

function showAllFutureWeeks() {
  // Implementation for showing all future weeks
  console.log('Show all future weeks');
}

// Store selected user in localStorage
document.addEventListener('DOMContentLoaded', function() {
  const userSelect = document.getElementById('currentUser');
  
  if (userSelect) {
    // Load saved user
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      userSelect.value = savedUser;
    }
    
    // Save on change
    userSelect.addEventListener('change', function() {
      localStorage.setItem('currentUser', this.value);
      
      // Add user to all links
      updateLinksWithUser(this.value);
    });
    
    // Initial update
    if (userSelect.value) {
      updateLinksWithUser(userSelect.value);
    }
  }
});

function updateLinksWithUser(userName) {
  if (!userName) return;
  
  // Update all relevant links with user parameter
  const links = document.querySelectorAll('a[href*="/nominate/"], a[href*="/vote/"]');
  links.forEach(link => {
    const url = new URL(link.href, window.location.origin);
    url.searchParams.set('user', userName);
    link.href = url.toString();
  });
}
