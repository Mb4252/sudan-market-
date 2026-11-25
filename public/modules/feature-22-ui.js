class Feature22UI {
  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'feature-22-container';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="feature-22">
        <h2>ميزة 22</h2>
        <div id="feature-22-content"></div>
      </div>
    `;
    document.body.appendChild(this.container);
  }

  updateContent(data) {
    document.getElementById('feature-22-content').textContent = data;
  }
}

window.feature22UI = new Feature22UI();