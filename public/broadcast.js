(function() {
    'use strict'

    const BROADCAST_CHANNEL = 'sudanMarketBroadcast'

    class Broadcast {
        constructor() {
            this.channel = new BroadcastChannel(BROADCAST_CHANNEL)
            this.setupEventListeners()
        }

        setupEventListeners() {
            this.channel.onmessage = (event) => {
                if (window.store.isValidDate(new Date(event.data.timestamp))) {
                    window.store.add(event.data)
                }
            }
        }

        send(post) {
            try {
                this.channel.postMessage(post)
            } catch (error) {
                console.error('خطأ في بث عبر BroadcastChannel:', error)
            }
        }
    }

    // إنشاء Instance
    window.broadcast = new Broadcast()

})();