(function() {
    'use strict'

    class Radar {
        constructor() {
            this.data = []
            this.setupStoreListener()
        }

        setupStoreListener() {
            window.store.on('storeUpdated', (event) => {
                this.data = event.detail.posts
                this.processData()
            })
        }

        processData() {
            const cities = this.getUniqueCities()
            const cityData = this.calculateCityData(cities)
            window.store.emit('radarDataUpdated', { cities: cityData })
        }

        getUniqueCities() {
            const cities = new Set()
            this.data.forEach(post => cities.add(post.city))
            return Array.from(cities)
        }

        calculateCityData(cities) {
            return cities.reduce((acc, city) => {
                const cityPosts = this.data.filter(post => post.city === city)
                const avgPrice = cityPosts.reduce((sum, post) => sum + post.price, 0) / cityPosts.length
                acc[city] = { avgPrice, count: cityPosts.length }
                return acc
            }, {})
        }
    }

    // إنشاء Instance
    window.radar = new Radar()

})();