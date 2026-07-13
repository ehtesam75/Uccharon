/**
 * Uccharon - AI English Speaking Coach
 * Analytics dashboard, stats, charts
 *
 * NOTE: This file is a classic (non-module) script. It is loaded in a fixed
 * order alongside its sibling app-*.js files and shares one global scope with
 * them, exactly as the original single app.js did. Do not reorder the script
 * tags in index.html.
 */

'use strict';

    // ═══════════════════════════════════════════════════════
    // DASHBOARD & STATS
    // ═══════════════════════════════════════════════════════

    async function showDashboard() {
        // Delete empty conversation before navigating away
        if (state.currentConversation && state.currentMessages.length === 0) {
            void deleteConversationById(state.currentConversation.id);
        }

        DOM.welcomeScreen.style.display = 'none';
        DOM.chatArea.style.display = 'none';
        DOM.learningHistoryScreen.style.display = 'none';
        DOM.dashboardScreen.style.display = 'flex';
        updateScrollToBottomButton();

        // Remember that the user is on Stats so a refresh reopens it
        setPersistedView('stats');
        clearPersistedConversationId();

        // Close mobile sidebar
        closeMobileSidebar();

        // Clear active conversation selection
        state.currentConversation = null;
        document.querySelectorAll('.convo-item').forEach(el => el.classList.remove('active'));

        await loadDashboardData(state.dashboardRange, state.dashboardModel);
    }

    async function loadDashboardData(range, model = 'all') {
        state.dashboardRange = range;
        state.dashboardModel = model;

        // Update tabs UI
        document.querySelectorAll('.time-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.range === range);
        });

        DOM.dashLoading.style.display = 'flex';
        DOM.dashEmpty.style.display = 'none';
        DOM.dashData.style.display = 'none';

        try {
            const data = await api(`/api/stats/?range=${range}&model=${model}`);



            if (data.total_messages === 0) {
                DOM.dashLoading.style.display = 'none';
                DOM.dashEmpty.style.display = 'block';
                return;
            }

            renderDashboard(data);
            DOM.dashLoading.style.display = 'none';
            DOM.dashData.style.display = 'block';

        } catch (err) {
            console.error(err);
            DOM.dashLoading.style.display = 'none';
            showToast('Failed to load analytics', 'error');
        }
    }

    function renderDashboard(data) {
        // Summary Cards
        DOM.dashTodayProgress.textContent = `${data.today_words}/${data.today_goal}`;
        animateCounter(DOM.dashStreak, data.streak);
        animateCounter(DOM.dashMaxStreak, data.max_streak);
        animateCounter(DOM.dashTotalMessages, data.total_messages);
        animateCounter(DOM.dashTotalConvos, data.total_conversations);
        animateCounter(DOM.dashOverallScore, data.averages.overall, true);

        // Score Breakdowns (Averages)
        renderScoreGrid(DOM.dashAvgScores, [
            { label: 'Grammar', value: data.averages.grammar },
            { label: 'Vocabulary', value: data.averages.vocabulary },
            { label: 'Naturalness', value: data.averages.naturalness },
            { label: 'Expression', value: data.averages.expression },
            { label: 'Mechanics', value: data.averages.mechanics }
        ]);

        // Score Breakdowns (Bests)
        renderScoreGrid(DOM.dashBestScores, [
            { label: 'Grammar', value: data.best_scores.grammar },
            { label: 'Vocabulary', value: data.best_scores.vocabulary },
            { label: 'Naturalness', value: data.best_scores.naturalness },
            { label: 'Expression', value: data.best_scores.expression },
            { label: 'Mechanics', value: data.best_scores.mechanics }
        ]);

        // Charts
        renderCharts(data);
    }

    function animateCounter(element, target, isDecimal = false) {
        const start = 0;
        const duration = 1000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing (easeOutExpo)
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            const current = start + (target - start) * easeProgress;

            element.textContent = isDecimal ? current.toFixed(1) : Math.round(current);

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        requestAnimationFrame(update);
    }

    function renderScoreGrid(container, scores) {
        container.innerHTML = '';
        scores.forEach(s => {
            container.innerHTML += `
                <div class="score-row">
                    <span class="score-label">${s.label}</span>
                    <div class="score-bar-container">
                        <div class="score-bar" data-width="${(s.value / 10) * 100}%" style="width:0"></div>
                    </div>
                    <span class="score-value">${s.value}${s.value % 1 === 0 ? '.0' : ''}</span>
                </div>
            `;
        });

        setTimeout(() => {
            container.querySelectorAll('.score-bar').forEach(bar => {
                bar.style.width = bar.dataset.width;
            });
        }, 100);
    }

    // Charting Configuration and Rendering
    const chartTheme = {
        get colors() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            return {
                text: isDark ? '#f0f0f8' : '#1a1a2e',
                grid: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                accent: isDark ? 'rgba(108, 92, 231, 0.8)' : 'rgba(95, 61, 196, 0.8)',
                accentBg: isDark ? 'rgba(108, 92, 231, 0.2)' : 'rgba(95, 61, 196, 0.2)',
                secondary: isDark ? 'rgba(0, 206, 201, 0.8)' : 'rgba(12, 166, 161, 0.8)',
            };
        }
    };

    function updateChartColors() {
        if (!state.radarChart || !state.lineChart) return;

        const colors = chartTheme.colors;

        // Update Radar Chart
        state.radarChart.options.scales.r.grid.color = colors.grid;
        state.radarChart.options.scales.r.angleLines.color = colors.grid;
        state.radarChart.options.scales.r.pointLabels.color = colors.text;
        state.radarChart.options.scales.r.ticks.backdropColor = 'transparent';
        state.radarChart.options.scales.r.ticks.color = colors.text;

        // Update Line Chart
        state.lineChart.options.scales.x.grid.color = colors.grid;
        state.lineChart.options.scales.y.grid.color = colors.grid;
        state.lineChart.options.scales.x.ticks.color = colors.text;
        state.lineChart.options.scales.y.ticks.color = colors.text;

        state.radarChart.update();
        state.lineChart.update();
    }

    function renderCharts(data) {
        if (!window.Chart) return;
        const colors = chartTheme.colors;

        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = colors.text;

        // Destroy existing charts
        if (state.radarChart) state.radarChart.destroy();
        if (state.lineChart) state.lineChart.destroy();

        // Radar Chart
        const radarCtx = document.getElementById('radar-chart');
        if (radarCtx) {
            state.radarChart = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: ['Grammar', 'Vocabulary', 'Naturalness', 'Expression', 'Mechanics'],
                    datasets: [{
                        label: 'Average Score',
                        data: [
                            data.averages.grammar,
                            data.averages.vocabulary,
                            data.averages.naturalness,
                            data.averages.expression,
                            data.averages.mechanics
                        ],
                        backgroundColor: colors.accentBg,
                        borderColor: colors.accent,
                        pointBackgroundColor: colors.accent,
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: colors.accent,
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        r: {
                            min: 0,
                            max: 10,
                            ticks: { stepSize: 2, display: false, backdropColor: 'transparent' },
                            grid: { color: colors.grid },
                            angleLines: { color: colors.grid },
                            pointLabels: { font: { size: 12, weight: 600 }, color: colors.text }
                        }
                    }
                }
            });
        }

        // Line Chart
        const lineCtx = document.getElementById('line-chart');
        const progressDesc = document.getElementById('progress-over-time-desc');
        if (progressDesc) {
            progressDesc.textContent = state.dashboardRange === 'daily' ? 'Hourly score trends' : 'Daily score trends';
        }

        if (lineCtx && data.daily_scores) {
            const labels = data.daily_scores.map(d => {
                if (state.dashboardRange === 'daily') {
                    return d.date; // E.g., '14:00'
                }
                const date = new Date(d.date);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            });
            const overallData = data.daily_scores.map(d => d.overall);

            state.lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Overall Score',
                        data: overallData,
                        borderColor: colors.secondary,
                        spanGaps: true,
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                            gradient.addColorStop(0, isDark() ? 'rgba(0, 206, 201, 0.4)' : 'rgba(12, 166, 161, 0.4)');
                            gradient.addColorStop(1, isDark() ? 'rgba(0, 206, 201, 0.0)' : 'rgba(12, 166, 161, 0.0)');
                            return gradient;
                        },
                        borderWidth: 3,
                        pointBackgroundColor: colors.secondary,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: isDark() ? 'rgba(18, 18, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                            titleColor: isDark() ? '#fff' : '#000',
                            bodyColor: isDark() ? '#fff' : '#000',
                            borderColor: isDark() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            borderWidth: 1,
                            padding: 10
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 10,
                            grid: { color: colors.grid, drawBorder: false },
                            ticks: { color: colors.text, padding: 10 }
                        },
                        x: {
                            grid: { display: false, drawBorder: false },
                            ticks: { color: colors.text, maxTicksLimit: 7 }
                        }
                    },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                }
            });
        }
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function initDashboard() {
        DOM.statsBtn.addEventListener('click', showDashboard);

        DOM.timeRangeTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('time-tab')) {
                loadDashboardData(e.target.dataset.range, state.dashboardModel);
            }
        });


    }

