let socket = null;
let currentUser = null;

// Check authentication on page load
async function checkAuth() {
    try {
        const response = await fetch('/api/check-session');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/login.html';
            return false;
        }
        
        currentUser = data.user;
        document.getElementById('username-display').textContent = currentUser.username;
        document.getElementById('logged-in-user').textContent = currentUser.username;
        document.getElementById('account-username').textContent = currentUser.username;
        document.getElementById('account-role').textContent = currentUser.role === 'admin' ? 'Administrator' : 'User';
        
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
    }
}

// Logout function
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Initialize Socket.IO connection
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateMirrorStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateMirrorStatus(false);
    });
    
    socket.on('initial-data', (data) => {
        console.log('Received initial data:', data);
        renderAnnouncements(data.announcements || []);
        renderEvents(data.events || []);
        updatePreview(data.announcements || [], data.events || []);
    });
    
    socket.on('mirror-update', (update) => {
        console.log('Mirror update:', update);
        refreshData();
    });
}

// Update mirror status
function updateMirrorStatus(connected) {
    const statusSpan = document.getElementById('mirror-status');
    if (statusSpan) {
        statusSpan.textContent = connected ? 'Connected ✅' : 'Disconnected ❌';
        statusSpan.style.color = connected ? '#4caf50' : '#f44336';
    }
}

// Show tab
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

// Render announcements
function renderAnnouncements(announcements) {
    const container = document.getElementById('announcements-list');
    if (!container) return;
    
    if (announcements.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No announcements yet. Add your first announcement above!</p>';
        return;
    }
    
    container.innerHTML = announcements.map(ann => `
        <div class="item-card ${ann.priority === 'high' ? 'high-priority' : ann.priority === 'urgent' ? 'urgent-priority' : ''}">
            <h3>${escapeHtml(ann.title)}</h3>
            <p>${escapeHtml(ann.content)}</p>
            <div class="date">
                📅 ${new Date(ann.date).toLocaleDateString()}
                ${ann.createdBy ? ` | 👤 By: ${ann.createdBy}` : ''}
            </div>
            <div class="actions">
                <button class="edit-btn" onclick="editAnnouncement(${ann.id})">✏️ Edit</button>
                <button class="delete-btn" onclick="deleteAnnouncement(${ann.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Render events
function renderEvents(events) {
    const container = document.getElementById('events-list');
    if (!container) return;
    
    if (events.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999;">No events scheduled.</p>';
        return;
    }
    
    const sortedEvents = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    container.innerHTML = sortedEvents.map(event => `
        <div class="item-card" style="border-left-color: ${event.color || '#c5a059'}">
            <h3>${escapeHtml(event.title)}</h3>
            <p>${event.description ? escapeHtml(event.description) : ''}</p>
            <div class="date">
                📅 ${new Date(event.date).toLocaleString()}
                ${event.createdBy ? ` | 👤 By: ${event.createdBy}` : ''}
            </div>
            <div class="actions">
                <button class="delete-btn" onclick="deleteEvent(${event.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Update mirror preview
function updatePreview(announcements, events) {
    const previewAnn = document.getElementById('preview-announcements');
    const previewEvents = document.getElementById('preview-events');
    
    if (previewAnn) {
        if (announcements.length === 0) {
            previewAnn.innerHTML = '<h3>📢 Announcements</h3><p>No announcements</p>';
        } else {
            previewAnn.innerHTML = `
                <h3>📢 Recent Announcements</h3>
                ${announcements.slice(0, 5).map(ann => `
                    <div class="preview-card">
                        <h4>${escapeHtml(ann.title)}</h4>
                        <p>${escapeHtml(ann.content)}</p>
                        <small>${new Date(ann.date).toLocaleDateString()}</small>
                    </div>
                `).join('')}
            `;
        }
    }
    
    if (previewEvents) {
        if (events.length === 0) {
            previewEvents.innerHTML = '<h3>📅 Upcoming Events</h3><p>No events</p>';
        } else {
            const upcomingEvents = [...events]
                .filter(e => new Date(e.date) >= new Date())
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(0, 5);
            
            previewEvents.innerHTML = `
                <h3>📅 Upcoming Events</h3>
                ${upcomingEvents.map(event => `
                    <div class="preview-card">
                        <h4>${escapeHtml(event.title)}</h4>
                        <p>${event.description ? escapeHtml(event.description) : ''}</p>
                        <small>${new Date(event.date).toLocaleString()}</small>
                    </div>
                `).join('')}
            `;
        }
    }
}

// Add announcement
document.getElementById('announcement-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('ann-title').value;
    const content = document.getElementById('ann-content').value;
    const priority = document.getElementById('ann-priority').value;
    
    try {
        const response = await fetch('/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content, priority })
        });
        
        if (response.ok) {
            alert('✅ Announcement published successfully!');
            document.getElementById('announcement-form').reset();
            refreshData();
        } else {
            const error = await response.json();
            alert('❌ Error: ' + (error.error || 'Failed to publish'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Failed to publish announcement');
    }
});

// Add event
document.getElementById('event-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('event-title').value;
    const date = document.getElementById('event-date').value;
    const description = document.getElementById('event-desc').value;
    const color = document.getElementById('event-color').value;
    
    try {
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, date, description, color })
        });
        
        if (response.ok) {
            alert('✅ Event added successfully!');
            document.getElementById('event-form').reset();
            refreshData();
        } else {
            const error = await response.json();
            alert('❌ Error: ' + (error.error || 'Failed to add event'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Failed to add event');
    }
});

// Change password
document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    
    if (newPassword !== confirmPassword) {
        alert('❌ New passwords do not match!');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('❌ Password must be at least 6 characters!');
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (response.ok) {
            alert('✅ Password changed successfully!');
            document.getElementById('change-password-form').reset();
        } else {
            const error = await response.json();
            alert('❌ Error: ' + (error.error || 'Failed to change password'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Failed to change password');
    }
});

// Delete announcement
async function deleteAnnouncement(id) {
    if (confirm('⚠️ Are you sure you want to delete this announcement?')) {
        try {
            const response = await fetch(`/api/announcements/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                refreshData();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete announcement');
        }
    }
}

// Delete event
async function deleteEvent(id) {
    if (confirm('⚠️ Are you sure you want to delete this event?')) {
        try {
            const response = await fetch(`/api/events/${id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                refreshData();
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to delete event');
        }
    }
}

// Edit announcement
function editAnnouncement(id) {
    const newTitle = prompt('✏️ Enter new title:');
    const newContent = prompt('✏️ Enter new content:');
    
    if (newTitle && newContent) {
        fetch(`/api/announcements/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle, content: newContent })
        }).then(() => refreshData());
    }
}

// Refresh data
async function refreshData() {
    try {
        const response = await fetch('/api/announcements');
        const data = await response.json();
        renderAnnouncements(data.announcements || []);
        renderEvents(data.events || []);
        updatePreview(data.announcements || [], data.events || []);
        
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    } catch (error) {
        console.error('Error refreshing data:', error);
    }
}

// Calendar settings
document.getElementById('calendar-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const calendarUrl = document.getElementById('calendar-url').value;
    const calendarName = document.getElementById('calendar-name').value;
    
    try {
        const response = await fetch('/api/config/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calendarUrl, calendarName })
        });
        
        if (response.ok) {
            alert('✅ Calendar settings updated! Smart Mirror will refresh shortly.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('❌ Failed to update calendar settings');
    }
});

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        initSocket();
        refreshData();
        
        // Auto-refresh every 30 seconds
        setInterval(refreshData, 30000);
        
        // Setup logout button
        document.getElementById('logout-btn')?.addEventListener('click', logout);
    }
});