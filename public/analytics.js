(function() {
    'use strict';

    // Initialize analytics when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize charts
        const ctxVolume = document.getElementById('chartVolume').getContext('2d');
        const ctxPrice = document.getElementById('chartPrice').getContext('2d');

        // Create charts
        window.volumeChart = new Chart(ctxVolume, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'عدد المنشورات',
                    data: [],
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        }