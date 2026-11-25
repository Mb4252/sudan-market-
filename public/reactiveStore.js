(() => {
  const store = {
    state: {
      posts: [],               // [{id, text, price, store, product, ts}]
      filters: { price: null, store: null },
      connectionStatus: "disconnected" // أو "connected"
    },
    _subscribers: new Set(),
    subscribe(cb) {
      this._subscribers.add(cb);
      // إرجاع دالة إلغاء الاشتراك
      return () => this._subscribers.delete(cb);
    },
    _notify() {
      this._subscribers.forEach(cb => {
        try { cb(this.state); } catch (e) { console.error(e); }
      });
    },
    update(partial) {
      this.state = { ...this.state, ...partial };
      this._notify();
    },
    getState() {
      return this.state;
    }
  };
  window.reactiveStore = store;
})();