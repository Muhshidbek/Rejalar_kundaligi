document.addEventListener('DOMContentLoaded', () => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker qabul qilindi'))
                .catch(err => console.log('Service Worker xatolik:', err));
        });
    }

    // Set current date & Greeting
    const dateDisplay = document.getElementById('date-display');
    const greetingDisplay = document.getElementById('greeting-display');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();

    // Greeting Logic
    const hour = today.getHours();
    if (hour >= 5 && hour < 12) {
        greetingDisplay.textContent = "Xayrli tong ☀️";
    } else if (hour >= 12 && hour < 18) {
        greetingDisplay.textContent = "Xayrli kun 🌤️";
    } else {
        greetingDisplay.textContent = "Xayrli kech 🌙";
    }

    // Capitalize first letter logic
    let dateStr = today.toLocaleDateString('uz-UZ', options);
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    dateDisplay.textContent = dateStr;

    // Elements
    const taskInput = document.getElementById('task-input');
    const addBtn = document.getElementById('add-btn');
    const taskList = document.getElementById('task-list');
    const toast = document.getElementById('toast');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const mainView = document.getElementById('main-view');
    const statsView = document.getElementById('stats-view');

    // Custom Select Elements
    const customSelect = document.getElementById('stats-filter-custom');
    const selectSelected = customSelect.querySelector('.select-selected');
    const selectItems = customSelect.querySelector('.select-items');
    let currentFilterValue = 'week';

    // Chart Instance
    let progressChart = null;
    let historyChart = null;

    // State
    // Format "YYYY-MM-DD"
    const todayStr = today.toISOString().split('T')[0];

    // daily = shablon tasks, date-specific = bugungi tasks
    let dailyTasks = JSON.parse(localStorage.getItem('kunlik_shablonlar')) || [];
    let todaysTasks = JSON.parse(localStorage.getItem(`rejalar_${todayStr}`)) || null;

    // If no tasks exist for today, copy from daily template
    if (todaysTasks === null) {
        todaysTasks = dailyTasks.map(t => ({
            id: Date.now().toString() + Math.random(),
            templateId: t.id,
            text: t.text,
            status: 'pending', // Replace boolean completed
            isDailyOrigin: true
        }));
        saveTodaysTasks();
    } else {
        // Migration script for old boolean to enum status
        let modified = false;
        todaysTasks.forEach(t => {
            if (t.status === undefined) {
                t.status = t.completed ? 'completed' : 'pending';
                modified = true;
            }
        });

        // Auto-cleanup orphan daily tasks that got stuck due to previous bugs
        const todayTemplateIds = todaysTasks.filter(t => t.isDailyOrigin).map(t => t.templateId);
        const todayTexts = todaysTasks.map(t => t.text);

        const initialLen = dailyTasks.length;
        dailyTasks = dailyTasks.filter(dt => todayTemplateIds.includes(dt.id) || todayTexts.includes(dt.text));

        if (dailyTasks.length !== initialLen) {
            saveDailyTasks();
        }

        if (modified) saveTodaysTasks();
    }

    // Handle Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            if (tab === 'main') {
                mainView.classList.remove('hidden');
                statsView.classList.add('hidden');
            } else {
                mainView.classList.add('hidden');
                statsView.classList.remove('hidden');
                updateHistoryChart();
            }
        });
    });

    // Custom Select Logic
    selectSelected.addEventListener('click', function (e) {
        e.stopPropagation();
        this.classList.toggle('select-arrow-active');
        selectItems.classList.toggle('select-hide');
    });

    const itemDivs = selectItems.querySelectorAll('div');
    itemDivs.forEach(item => {
        item.addEventListener('click', function (e) {
            // Update selected text
            selectSelected.innerHTML = this.innerHTML;

            // Mark as selected style
            itemDivs.forEach(div => div.classList.remove('same-as-selected'));
            this.classList.add('same-as-selected');

            // Close dropdown
            selectSelected.classList.remove('select-arrow-active');
            selectItems.classList.add('select-hide');

            // Update filter value and chart
            currentFilterValue = this.getAttribute('data-value');
            updateHistoryChart();
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.custom-select')) {
            selectSelected.classList.remove('select-arrow-active');
            selectItems.classList.add('select-hide');
        }
    });

    function initChart() {
        const ctx = document.getElementById('progressChart').getContext('2d');
        progressChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Bajarildi', 'Qoldi'],
                datasets: [{
                    data: [0, 0, 1],
                    backgroundColor: [
                        '#10b981', // green - done
                        '#f59e0b', // yellow - partial
                        'rgba(0, 0, 0, 0.05)' // empty - pending
                    ],
                    borderWidth: 0,
                    cutout: '75%',
                    borderRadius: 20
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }

    // Audio Feedback
    const popSound = new Audio('data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExEAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
    // Using a simple beep fallback since real base64 is too long, we'll synthesize it instead:
    const playPop = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) { }
    };

    function updateDashboard() {
        const tasksToCalculate = todaysTasks;

        const total = tasksToCalculate.length;
        const completed = tasksToCalculate.filter(t => t.status === 'completed').length;
        const partial = tasksToCalculate.filter(t => t.status === 'partial').length;
        const pending = total - completed - partial;

        document.getElementById('total-tasks').textContent = total;
        document.getElementById('completed-tasks').textContent = completed;
        document.getElementById('partial-tasks').textContent = partial;
        document.getElementById('pending-tasks').textContent = pending;

        const weightedTotal = completed + (partial * 0.5);
        const percent = total === 0 ? 0 : Math.round((weightedTotal / total) * 100);
        document.getElementById('progress-percent').textContent = `${percent}%`;

        if (!progressChart) {
            initChart();
        }

        if (total > 0 && total === completed && !window.confettiFiredToday) {
            window.confettiFiredToday = true;
            if (window.confetti) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        } else if (total !== completed) {
            window.confettiFiredToday = false;
        }

        if (total === 0) {
            progressChart.data.datasets[0].data = [0, 0, 1];
            progressChart.data.datasets[0].backgroundColor = ['#10b981', '#f59e0b', 'rgba(0, 0, 0, 0.05)'];
        } else {
            progressChart.data.datasets[0].data = [completed, partial, pending];
            progressChart.data.datasets[0].backgroundColor = ['#10b981', '#f59e0b', '#ef4444'];
        }
        progressChart.update();
    }

    // Initial render
    renderTasks();

    // Event listeners
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    function addTask() {
        const text = taskInput.value.trim();
        if (!text) return;

        const taskType = document.querySelector('input[name="task-type"]:checked').value;
        const templateId = Date.now().toString();

        const newTask = {
            id: Date.now().toString() + Math.random(),
            templateId: taskType === 'daily' ? templateId : null,
            text: text,
            status: 'pending',
            isDailyOrigin: taskType === 'daily'
        };

        if (taskType === 'daily') {
            // Save to template
            dailyTasks.unshift({
                id: templateId,
                text: text,
                status: 'pending'
            });
            saveDailyTasks();
        }

        todaysTasks.unshift(newTask);
        saveTodaysTasks();

        renderTasks();
        taskInput.value = '';
        showToast("Reja qo'shildi! 🚀");
    }

    // Function to handle global context toggles (Pending -> Partial -> Completed -> Pending)
    window.toggleTask = function (id) {
        todaysTasks = todaysTasks.map(task => {
            if (task.id === id) {
                let newStatus = 'pending';
                if (task.status === 'pending') newStatus = 'partial';
                else if (task.status === 'partial') newStatus = 'completed';

                return { ...task, status: newStatus };
            }
            return task;
        });
        saveTodaysTasks();
        renderTasks();

        const t = todaysTasks.find(x => x.id === id);
        if (t && t.status === 'completed') {
            playPop();
            showToast("Ajoyib! Bajarildi ✅");
        } else if (t && t.status === 'partial') {
            showToast("Yarim yo'ldasiz! ⏳");
        }
    }

    window.editTask = function (id) {
        const task = todaysTasks.find(t => t.id === id);
        if (!task) return;

        const newText = prompt("Vazifani o'zgartirish:", task.text);
        if (newText !== null && newText.trim() !== '') {
            task.text = newText.trim();

            // Also update template if daily
            if (task.templateId) {
                const tmpl = dailyTasks.find(t => t.id === task.templateId);
                if (tmpl) {
                    tmpl.text = newText.trim();
                    saveDailyTasks();
                }
            }
            saveTodaysTasks();
            renderTasks();
            showToast("Saqlandi 💾");
        }
    }

    window.deleteTask = function (id) {
        const itemElement = document.querySelector(`[data-id="${id}"]`);

        // Synchronous state mutation to guarantee deletion before any tab switch
        const taskToDelete = todaysTasks.find(t => t.id === id);

        if (taskToDelete) {
            // Remove from template as well if it originated from a template
            if (taskToDelete.isDailyOrigin) {
                if (taskToDelete.templateId) {
                    dailyTasks = dailyTasks.filter(t => t.id !== taskToDelete.templateId);
                } else {
                    // Fallback for older tasks without a templateId
                    dailyTasks = dailyTasks.filter(t => t.text !== taskToDelete.text);
                }
                saveDailyTasks();
            }

            todaysTasks = todaysTasks.filter(task => task.id !== id);
            saveTodaysTasks();
        }

        const processDeleteDOM = () => {
            renderTasks();
            showToast("O'chirildi 🗑️");
            // If stats view is active during deletion, update chart and grid as well
            if (!document.getElementById('stats-view').classList.contains('hidden')) {
                updateHistoryChart();
            }
        };

        if (itemElement) {
            itemElement.style.transform = 'translateX(100%)';
            itemElement.style.opacity = '0';
            setTimeout(processDeleteDOM, 300);
        } else {
            processDeleteDOM();
        }
    }

    function saveTodaysTasks() {
        localStorage.setItem(`rejalar_${todayStr}`, JSON.stringify(todaysTasks));
    }

    function saveDailyTasks() {
        localStorage.setItem('kunlik_shablonlar', JSON.stringify(dailyTasks));
    }

    function renderTasks() {
        taskList.innerHTML = '';

        if (todaysTasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                    </svg>
                    <p>Hozircha bugun uchun rejalar yo'q.<br>Yangi reja qo'shing!</p>
                </div>
            `;
            updateDashboard();
            return;
        }

        // Sort: incomplete first, completed last
        const sortedTasks = [...todaysTasks].sort((a, b) => {
            const statusWeight = { 'pending': 0, 'partial': 1, 'completed': 2 };
            if (statusWeight[a.status] === statusWeight[b.status]) {
                return b.id - a.id; // Newest first
            }
            return statusWeight[a.status] - statusWeight[b.status];
        });

        sortedTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.status}`;
            li.dataset.id = task.id;

            let iconHtml = `<polyline points="20 6 9 17 4 12"></polyline>`; // Checkmark
            if (task.status === 'partial') {
                iconHtml = `<line x1="5" y1="12" x2="19" y2="12"></line>`; // Dash
            }

            li.innerHTML = `
                <div class="checkbox" onclick="toggleTask('${task.id}')" role="button" aria-label="Bajarildi">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${iconHtml}</svg>
                </div>
                <div class="task-content">
                    <span class="task-text" onclick="toggleTask('${task.id}')">${escapeHtml(task.text)}</span>
                    ${task.isDailyOrigin ? '<span class="task-badge">Doimiy</span>' : ''}
                </div>
                <div class="task-actions">
                    <button class="edit-btn" onclick="editTask('${task.id}')" aria-label="Tahrirlash">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="delete-btn" onclick="deleteTask('${task.id}')" aria-label="O'chirish">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
                    </button>
                </div>
            `;

            taskList.appendChild(li);
        });

        updateDashboard();
    }

    let toastTimeout;
    function showToast(message) {
        clearTimeout(toastTimeout);
        toast.textContent = message;
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Statistics Features ---
    function updateHistoryChart() {
        const filter = currentFilterValue;

        let allKeys = Object.keys(localStorage).filter(k => k.startsWith('rejalar_'));
        allKeys.sort(); // sort by date

        // Parse dates
        let dateData = allKeys.map(k => {
            const dateStr = k.replace('rejalar_', '');
            const tasksParsed = JSON.parse(localStorage.getItem(k));
            const total = tasksParsed.length;
            let completed = 0;
            let partial = 0;

            tasksParsed.forEach(t => {
                if (t.status === undefined) t.status = t.completed ? 'completed' : 'pending';
                if (t.status === 'completed') completed++;
                if (t.status === 'partial') partial++;
            });
            // weighted
            return { dateStr, total, completed, partial, weightedCompleted: completed + (partial * 0.5) };
        });

        const todayTimestamp = new Date(todayStr).getTime();

        // Filter Data
        let filteredData = dateData;
        if (filter === 'week') {
            const weekAgo = new Date(todayTimestamp - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filteredData = dateData.filter(d => d.dateStr > weekAgo);
        } else if (filter === 'month') {
            const monthAgo = new Date(todayTimestamp - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            filteredData = dateData.filter(d => d.dateStr > monthAgo);
        }

        // Aggregate statistics
        let totalCompleted = 0;
        let totalWeighted = 0;
        let totalCreated = 0;

        const labels = [];
        const completionData = [];

        filteredData.forEach(d => {
            const shortDate = d.dateStr.slice(5).replace('-', '/'); // format MM/DD
            labels.push(shortDate);
            const percentage = d.total === 0 ? 0 : Math.round((d.weightedCompleted / d.total) * 100);
            completionData.push(percentage);
            totalCompleted += d.completed;
            totalWeighted += d.weightedCompleted;
            totalCreated += d.total;
        });

        // Calculate Streak (Consecutive days with at least 1 tracked & completed task)
        let currentStreak = 0;
        let msInDay = 24 * 60 * 60 * 1000;
        let streakTimestamp = todayTimestamp;

        while (true) {
            const dateStrCheck = new Date(streakTimestamp).toISOString().split('T')[0];
            const dataForDay = dateData.find(d => d.dateStr === dateStrCheck);

            // Allow skipping today if it's 0, but check yesterday. Otherwise streak breaks if > 0 missing.
            if (dataForDay && dataForDay.total > 0 && dataForDay.completed > 0) {
                currentStreak++;
                streakTimestamp -= msInDay;
            } else if (dateStrCheck === todayStr && (!dataForDay || dataForDay.completed === 0)) {
                // Ignore today if we just started, check yesterday
                streakTimestamp -= msInDay;
            } else {
                break;
            }
        }
        document.getElementById('current-streak').textContent = `${currentStreak} 🔥`;

        document.getElementById('history-completed').textContent = totalCompleted;
        const avgPercent = totalCreated === 0 ? 0 : Math.round((totalWeighted / totalCreated) * 100);
        document.getElementById('history-percent').textContent = `${avgPercent}%`;

        // Render Chart
        renderHistoryChart(labels, completionData);
        renderHabitGrid();
    }

    function renderHabitGrid() {
        const gridContainer = document.getElementById('habit-grid');
        if (!gridContainer) return;
        gridContainer.innerHTML = '';

        if (dailyTasks.length === 0) {
            gridContainer.innerHTML = '<span class="habit-cell habit-name">Doimiy ishlar (shablonlar) mavjud emas</span>';
            return;
        }

        const dateObj = new Date(todayStr);
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth();
        // Days in current month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const currentDay = dateObj.getDate();

        // Prepare structure: columns = 1 (name) + daysInMonth
        gridContainer.style.gridTemplateColumns = `auto repeat(${daysInMonth}, 24px)`;

        // Header Row (1..31)
        const headerRow = document.createElement('div');
        headerRow.className = 'habit-row';
        headerRow.innerHTML = `<div class="habit-cell"></div>`;
        for (let i = 1; i <= daysInMonth; i++) {
            headerRow.innerHTML += `<div class="habit-cell">${i}</div>`;
        }
        gridContainer.appendChild(headerRow);

        // Map templateId -> habit history for the month
        // Read keys for this month only "rejalar_YYYY-MM-"
        const prefix = `rejalar_${year}-${String(month + 1).padStart(2, '0')}`;
        let allKeys = Object.keys(localStorage).filter(k => k.startsWith(prefix));

        // Construct matrix: habitMatrix[templateId][day_1_to_31] = status
        const habitMatrix = {};
        dailyTasks.forEach(dt => habitMatrix[dt.id] = {});

        allKeys.forEach(k => {
            const dayStr = k.slice(-2);
            const dayInt = parseInt(dayStr, 10);
            const tasksParsed = JSON.parse(localStorage.getItem(k));

            tasksParsed.forEach(t => {
                if (t.isDailyOrigin && habitMatrix[t.templateId] !== undefined) {
                    if (t.status === undefined) t.status = t.completed ? 'completed' : 'pending';
                    habitMatrix[t.templateId][dayInt] = t.status;
                }
            });
        });

        // Add Habit Rows
        dailyTasks.forEach(template => {
            const row = document.createElement('div');
            row.className = 'habit-row';

            row.innerHTML = `<div class="habit-cell habit-name">${escapeHtml(template.text)}</div>`;

            for (let d = 1; d <= daysInMonth; d++) {
                let cellClass = 'future';
                if (d <= currentDay) {
                    const status = habitMatrix[template.id][d] || 'pending';
                    cellClass = `st-${status}`;
                }

                row.innerHTML += `<div class="habit-cell habit-day ${cellClass}"></div>`;
            }
            gridContainer.appendChild(row);
        });
    }

    function renderHistoryChart(labels, data) {
        const ctx = document.getElementById('historyChart').getContext('2d');

        if (historyChart) {
            historyChart.destroy();
        }

        historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Samaradorlik (%)',
                    data: data,
                    borderColor: '#5c6bc0',
                    backgroundColor: 'rgba(92, 107, 192, 0.15)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { color: 'rgba(0,0,0,0.5)' },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(0,0,0,0.5)' },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(31, 41, 55, 0.95)',
                        padding: 10,
                        titleFont: { size: 14, family: 'Outfit' },
                        bodyFont: { size: 14, family: 'Outfit' },
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return `Samaradorlik: ${context.parsed.y}%`;
                            }
                        }
                    }
                }
            }
        });
    }

});
