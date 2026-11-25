(function() {
    'use strict';

    window.ReactiveStore = {
        state: {},
        subscribers: new Map(),
        
        setState: function(newState) {
            this.state = { ...this.state, ...newState };
            this.notifySubscribers();
        },
        
        getState: function() {
            return { ...this.state };
        },
        
        subscribe: function(key, callback) {
            if (!this.subscribers.has(key)) {
                this.subscribers.set(key, new Set());
            }
            
            this.subscribers.get(key).add(callback);
            
            // Return unsubscribe function
            return () => {
                this.subscribers.get(key).delete(callback);
                if (this.subscribers.get(key).size === 0) {
                    this.subscribers.delete(key);
                }
            };
        },
        
        notifySubscribers: function() {
            this.subscribers.forEach((callbacks, key) => {
                if (this.state.hasOwnProperty(key)) {
                    callbacks.forEach(callback => callback(this.state[key]));
                }
            });
        }
    };

    console.log('ReactiveStore initialized');
})();