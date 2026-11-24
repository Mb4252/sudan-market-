(function(){
  // تصحيح سجل GitHub Actions: استخدام hostname بدلاً من process.env.REPO
  function getRepoName() {
    try {
      const hostname = window.location.hostname;
      // استخراج اسم المستودع من رابط GitHub Pages: username.github.io/repo-name
      if (hostname.includes('github.io')) {
        const parts = hostname.split('.');
        // مثال: myuser.github.io/myrepo -> myrepo
        return parts[0]; // أو يمكن استخراج الجزء الأخير قبل github.io
      }
      return '';
    } catch(e) {
      return '';
    }
  }

  // جلب سجلات GitHub Actions مباشرة عبر API
  async function fetchGitHubActions() {
    const owner = 'your-username'; // استبدل باسم المستخدم
    const repo = getRepoName() || 'your-repo'; // استبدل باسم المستودع
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`);
      if (!res.ok) throw new Error('GitHub API error');
      const data = await res.json();
      return data.workflow_runs || [];
    } catch(e) {
      console.warn('تعذر جلب سجلات GitHub Actions:', e.message);
      return [];
    }
  }

  // دالة مساعدة لتطهير النصوص
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.getRepoName = getRepoName;
  window.fetchGitHubActions = fetchGitHubActions;
  window.escapeHtml = escapeHtml;
})();