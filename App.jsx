import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// API Configuration
const API_BASE_URL = 'https://e5h6i7cnmzmv.manus.space';
const socket = io(API_BASE_URL);

function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUserType, setSelectedUserType] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [currentView, setCurrentView] = useState('login');
  const [authToken, setAuthToken] = useState(localStorage.getItem('authToken'));
  
  // Data State
  const [activeIncidents, setActiveIncidents] = useState([]);
  const [callTypes, setCallTypes] = useState([]);
  const [units, setUnits] = useState([]);
  const [unitsByType, setUnitsByType] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form States
  const [showCreateCall, setShowCreateCall] = useState(false);
  const [showEditCall, setShowEditCall] = useState(false);
  const [editingIncident, setEditingIncident] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingIncident, setClearingIncident] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [showManageCallTypes, setShowManageCallTypes] = useState(false);
  const [showManageUnits, setShowManageUnits] = useState(false);
  const [newCallType, setNewCallType] = useState({ name: '', priority: 1 });
  const [editingUnit, setEditingUnit] = useState(null);

  // Field Reporting States
  const [fieldNote, setFieldNote] = useState('');
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [unitNumber, setUnitNumber] = useState('');
  const [userStatus, setUserStatus] = useState('Available');

  // API Helper Functions
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      setError(error.message);
      throw error;
    }
  };

  // Authentication Functions
  const handleLogin = async () => {
    if (!selectedUserType || !selectedUnit) {
      setError('Please select both user type and unit');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Map frontend user types to backend unit types
      const userTypeMapping = {
        'Fire Marshal Unit': 'fire_marshal',
        'Dispatch Unit': 'dispatch',
        'Admin User': 'admin'
      };

      const response = await apiCall('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          unit_id: selectedUnit,
          user_type: userTypeMapping[selectedUserType]
        })
      });

      setAuthToken(response.token);
      localStorage.setItem('authToken', response.token);
      setCurrentUser(response.user);
      setCurrentView('dashboard');
      
      // Join Socket.IO room for real-time updates
      socket.emit('join', { unit_id: selectedUnit, user_type: userTypeMapping[selectedUserType] });
      
    } catch (error) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    localStorage.removeItem('authToken');
    setCurrentUser(null);
    setCurrentView('login');
    setSelectedUserType('');
    setSelectedUnit('');
    socket.emit('leave');
  };

  // Data Loading Functions
  const loadUnits = async () => {
    try {
      const response = await apiCall('/api/units');
      setUnits(response);
    } catch (error) {
      console.error('Failed to load units:', error);
    }
  };

  const loadUnitsByType = async (userType) => {
    console.log('loadUnitsByType called with:', userType);
    if (!userType) return;
    
    // Map frontend user types to backend unit types
    const userTypeMapping = {
      'Fire Marshal Unit': 'fire_marshal',
      'Dispatch Unit': 'dispatch',
      'Admin User': 'admin'
    };
    
    const backendUserType = userTypeMapping[userType];
    console.log('Mapped to backend type:', backendUserType);
    if (!backendUserType) return;
    
    try {
      const response = await apiCall(`/api/units/by-type/${backendUserType}`);
      console.log('Units loaded:', response.length, 'units');
      setUnitsByType(response);
    } catch (error) {
      console.error('Failed to load units by type:', error);
    }
  };

  const loadIncidents = async () => {
    try {
      const response = await apiCall('/api/incidents');
      setActiveIncidents(response);
    } catch (error) {
      console.error('Failed to load incidents:', error);
    }
  };

  const loadCallTypes = async () => {
    try {
      const response = await apiCall('/api/call-types');
      setCallTypes(response);
    } catch (error) {
      console.error('Failed to load call types:', error);
    }
  };

  // Incident Management Functions
  const createIncident = async (incidentData) => {
    try {
      const response = await apiCall('/api/incidents', {
        method: 'POST',
        body: JSON.stringify(incidentData)
      });
      
      setActiveIncidents(prev => [...prev, response]);
      setShowCreateCall(false);
      
      // Emit real-time update
      socket.emit('incident_created', response);
      
    } catch (error) {
      setError('Failed to create incident');
    }
  };

  const updateIncident = async (incidentId, updateData) => {
    try {
      const response = await apiCall(`/api/incidents/${incidentId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });
      
      setActiveIncidents(prev => 
        prev.map(incident => 
          incident.id === incidentId ? response : incident
        )
      );
      
      // Emit real-time update
      socket.emit('incident_updated', response);
      
    } catch (error) {
      setError('Failed to update incident');
    }
  };

  const deleteIncident = async (incidentId) => {
    try {
      await apiCall(`/api/incidents/${incidentId}`, {
        method: 'DELETE'
      });
      
      setActiveIncidents(prev => 
        prev.filter(incident => incident.id !== incidentId)
      );
      
      // Emit real-time update
      socket.emit('incident_deleted', { id: incidentId });
      
    } catch (error) {
      setError('Failed to delete incident');
    }
  };

  const respondToIncident = async (incidentId, unitNumber) => {
    try {
      const response = await apiCall(`/api/incidents/${incidentId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          unit_number: unitNumber,
          user_id: currentUser.id
        })
      });
      
      setActiveIncidents(prev => 
        prev.map(incident => 
          incident.id === incidentId ? response : incident
        )
      );
      
      setUserStatus('Responding');
      
      // Emit real-time update
      socket.emit('unit_responded', response);
      
    } catch (error) {
      setError('Failed to respond to incident');
    }
  };

  const updateUnitStatus = async (incidentId, status) => {
    try {
      const response = await apiCall(`/api/incidents/${incidentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: status,
          user_id: currentUser.id
        })
      });
      
      setActiveIncidents(prev => 
        prev.map(incident => 
          incident.id === incidentId ? response : incident
        )
      );
      
      setUserStatus(status);
      
      // Emit real-time update
      socket.emit('status_updated', response);
      
    } catch (error) {
      setError('Failed to update status');
    }
  };

  const addTimelineEntry = async (incidentId, entry) => {
    try {
      const response = await apiCall(`/api/incidents/${incidentId}/timeline`, {
        method: 'POST',
        body: JSON.stringify({
          ...entry,
          user_id: currentUser.id
        })
      });
      
      setActiveIncidents(prev => 
        prev.map(incident => 
          incident.id === incidentId 
            ? { ...incident, timeline: [...(incident.timeline || []), response] }
            : incident
        )
      );
      
      // Emit real-time update
      socket.emit('timeline_updated', { incident_id: incidentId, entry: response });
      
    } catch (error) {
      setError('Failed to add timeline entry');
    }
  };

  // Admin Functions
  const createCallType = async () => {
    if (!newCallType.name.trim()) {
      setError('Call type name is required');
      return;
    }

    try {
      const response = await apiCall('/api/call-types', {
        method: 'POST',
        body: JSON.stringify(newCallType)
      });
      
      setCallTypes(prev => [...prev, response]);
      setNewCallType({ name: '', priority: 1 });
      
    } catch (error) {
      setError('Failed to create call type');
    }
  };

  const deleteCallType = async (callTypeId) => {
    try {
      await apiCall(`/api/call-types/${callTypeId}`, {
        method: 'DELETE'
      });
      
      setCallTypes(prev => prev.filter(ct => ct.id !== callTypeId));
      
    } catch (error) {
      setError('Failed to delete call type');
    }
  };

  const updateUnit = async (unitId, updateData) => {
    try {
      const response = await apiCall(`/api/units/${unitId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });
      
      setUnits(prev => 
        prev.map(unit => 
          unit.id === unitId ? response : unit
        )
      );
      
    } catch (error) {
      setError('Failed to update unit');
    }
  };

  // Socket.IO Event Handlers
  useEffect(() => {
    socket.on('incident_created', (incident) => {
      setActiveIncidents(prev => [...prev, incident]);
    });

    socket.on('incident_updated', (incident) => {
      setActiveIncidents(prev => 
        prev.map(i => i.id === incident.id ? incident : i)
      );
    });

    socket.on('incident_deleted', (data) => {
      setActiveIncidents(prev => 
        prev.filter(i => i.id !== data.id)
      );
    });

    socket.on('unit_responded', (incident) => {
      setActiveIncidents(prev => 
        prev.map(i => i.id === incident.id ? incident : i)
      );
    });

    socket.on('status_updated', (incident) => {
      setActiveIncidents(prev => 
        prev.map(i => i.id === incident.id ? incident : i)
      );
    });

    socket.on('timeline_updated', (data) => {
      setActiveIncidents(prev => 
        prev.map(incident => 
          incident.id === data.incident_id 
            ? { ...incident, timeline: [...(incident.timeline || []), data.entry] }
            : incident
        )
      );
    });

    return () => {
      socket.off('incident_created');
      socket.off('incident_updated');
      socket.off('incident_deleted');
      socket.off('unit_responded');
      socket.off('status_updated');
      socket.off('timeline_updated');
    };
  }, []);

  // Load initial data
  useEffect(() => {
    loadUnits();
    loadCallTypes();
    
    if (authToken && currentUser) {
      loadIncidents();
    }
  }, [authToken, currentUser]);

  // Load units by type when user type changes
  useEffect(() => {
    if (selectedUserType) {
      loadUnitsByType(selectedUserType);
    }
  }, [selectedUserType]);

  // Auto-login if token exists
  useEffect(() => {
    if (authToken && !currentUser) {
      // Validate token and get user info
      apiCall('/api/user')
        .then(user => {
          setCurrentUser(user);
          setCurrentView('dashboard');
        })
        .catch(() => {
          localStorage.removeItem('authToken');
          setAuthToken(null);
        });
    }
  }, [authToken]);

  // Helper Functions
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 1: return '#ff4444';
      case 2: return '#ff8800';
      case 3: return '#ffcc00';
      default: return '#666';
    }
  };

  const getPriorityText = (priority) => {
    switch (priority) {
      case 1: return 'High';
      case 2: return 'Medium';
      case 3: return 'Low';
      default: return 'Unknown';
    }
  };

  // Event Handlers
  const handleCreateCall = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const incidentData = {
      type: formData.get('incidentType'),
      location: formData.get('location'),
      address: formData.get('address'),
      priority: parseInt(formData.get('priority')),
      units_requested: parseInt(formData.get('unitsRequested')),
      pertinent_details: formData.get('pertinentDetails'),
      created_by: currentUser.unit_id
    };
    
    createIncident(incidentData);
  };

  const handleEditCall = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const updateData = {
      type: formData.get('incidentType'),
      location: formData.get('location'),
      address: formData.get('address'),
      priority: parseInt(formData.get('priority')),
      units_requested: parseInt(formData.get('unitsRequested')),
      pertinent_details: formData.get('pertinentDetails')
    };
    
    updateIncident(editingIncident.id, updateData);
    setShowEditCall(false);
    setEditingIncident(null);
  };

  const handleClearCall = () => {
    if (clearingIncident) {
      deleteIncident(clearingIncident.id);
      setShowClearConfirm(false);
      setClearingIncident(null);
    }
  };

  const handleRespond = () => {
    if (!unitNumber.trim()) {
      setError('Please enter your unit number');
      return;
    }
    
    respondToIncident(selectedIncident.id, unitNumber);
    setUnitNumber('');
  };

  const handleAddFieldNote = () => {
    if (!fieldNote.trim()) return;
    
    addTimelineEntry(selectedIncident.id, {
      type: 'note',
      content: fieldNote
    });
    
    setFieldNote('');
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const photoData = e.target.result;
        setUploadedPhoto(photoData);
        
        addTimelineEntry(selectedIncident.id, {
          type: 'photo',
          content: photoData
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResourceRequest = (resourceType) => {
    const resourceIcons = {
      'FIRE': '🚒',
      'ADDITIONAL_UNIT': '👮',
      'EMS': '🚑'
    };
    
    addTimelineEntry(selectedIncident.id, {
      type: 'resource',
      content: `${resourceType} requested`,
      icon: resourceIcons[resourceType]
    });
  };

  const downloadPhoto = (photoData, filename = 'incident-photo.jpg') => {
    const link = document.createElement('a');
    link.href = photoData;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Functions
  const renderLogin = () => (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>⚠️ FirstAlert Pro</h1>
          <p>Emergency Response System</p>
          <div className="welcome-message">
            Welcome Dallas County Fire Marshal user!
          </div>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="login-form">
          <div className="form-group">
            <label>User Type</label>
            <select 
              value={selectedUserType} 
              onChange={(e) => {
                console.log('User type selected:', e.target.value);
                setSelectedUserType(e.target.value);
              }}
              disabled={loading}
            >
              <option value="">Select User Type</option>
              <option value="Fire Marshal Unit">Fire Marshal Unit</option>
              <option value="Dispatch Unit">Dispatch Unit</option>
              <option value="Admin User">Admin User</option>
            </select>
          </div>
          
              {selectedUserType && (
                <div className="form-group">
                  <label>Select Unit</label>
                  <select 
                    value={selectedUnit} 
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Select Unit</option>
                    {unitsByType.map(unit => (
                      <option key={unit.unit_id} value={unit.unit_id}>
                        {unit.unit_id} - {unit.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
          
          <button 
            onClick={handleLogin} 
            disabled={!selectedUserType || !selectedUnit || loading}
            className="login-button"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h1>⚠️ FirstAlert Pro</h1>
          <div className="user-info">
            <span className="user-name">{currentUser?.display_name}</span>
            <span className={`status-badge status-${userStatus.toLowerCase()}`}>
              {userStatus}
            </span>
          </div>
        </div>
        
        <div className="header-right">
          {currentUser?.user_type === 'Dispatch Unit' && (
            <button 
              onClick={() => setShowCreateCall(true)}
              className="create-call-button"
            >
              Create Call
            </button>
          )}
          
          {currentUser?.user_type === 'Admin User' && (
            <div className="admin-controls">
              <button 
                onClick={() => setShowManageCallTypes(true)}
                className="admin-button"
              >
                Manage Call Types
              </button>
              <button 
                onClick={() => setShowManageUnits(true)}
                className="admin-button"
              >
                Manage Units
              </button>
            </div>
          )}
          
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="dashboard-content">
        <div className="incidents-section">
          <h2>Active Incidents</h2>
          
          {activeIncidents.length === 0 ? (
            <div className="no-incidents">
              No active incidents
            </div>
          ) : (
            <div className="incidents-grid">
              {activeIncidents.map(incident => (
                <div key={incident.id} className="incident-card">
                  <div className="incident-header">
                    <div className="incident-type">{incident.type}</div>
                    <div 
                      className="priority-badge"
                      style={{ backgroundColor: getPriorityColor(incident.priority) }}
                    >
                      Priority {incident.priority} - {getPriorityText(incident.priority)}
                    </div>
                  </div>
                  
                  <div className="incident-details">
                    <div className="location">📍 {incident.location}</div>
                    <div className="address">{incident.address}</div>
                    <div className="time">🕐 {formatDate(incident.created_at)}</div>
                    <div className="units">👥 {incident.units_requested} units requested</div>
                    {incident.pertinent_details && (
                      <div className="details">ℹ️ {incident.pertinent_details}</div>
                    )}
                  </div>
                  
                  {incident.responding_units && incident.responding_units.length > 0 && (
                    <div className="responding-units">
                      <strong>Responding:</strong> {incident.responding_units.join(', ')}
                    </div>
                  )}
                  
                  {/* Activity Timeline for each incident */}
                  {incident.timeline && incident.timeline.length > 0 && (
                    <div className="activity-timeline-compact">
                      <div className="timeline-header">Recent Activity</div>
                      <div className="timeline-items">
                        {incident.timeline.slice(-3).map((item, index) => (
                          <div key={index} className="timeline-item-compact">
                            <span className="timeline-time">{formatTime(item.timestamp)}</span>
                            <span className="timeline-content">
                              {item.type === 'resource' && item.icon && (
                                <span className="resource-icon">{item.icon}</span>
                              )}
                              {item.content}
                            </span>
                            <span className="timeline-user">- {item.user}</span>
                          </div>
                        ))}
                        {incident.timeline.length > 3 && (
                          <div className="timeline-more">
                            +{incident.timeline.length - 3} more activities
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="incident-actions">
                    {currentUser?.user_type === 'Fire Marshal Unit' && (
                      <button 
                        onClick={() => setSelectedIncident(incident)}
                        className="respond-button"
                      >
                        View Details
                      </button>
                    )}
                    
                    {currentUser?.user_type === 'Dispatch Unit' && (
                      <div className="dispatch-actions">
                        <button 
                          onClick={() => {
                            setClearingIncident(incident);
                            setShowClearConfirm(true);
                          }}
                          className="clear-button"
                        >
                          Clear Call
                        </button>
                        <button 
                          onClick={() => {
                            setEditingIncident(incident);
                            setShowEditCall(true);
                          }}
                          className="edit-button"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderIncidentDetail = () => (
    <div className="incident-detail">
      <div className="detail-header">
        <button 
          onClick={() => setSelectedIncident(null)}
          className="back-button"
        >
          ← Back to Dashboard
        </button>
        <h2>{selectedIncident.type}</h2>
        <div 
          className="priority-badge"
          style={{ backgroundColor: getPriorityColor(selectedIncident.priority) }}
        >
          Priority {selectedIncident.priority} - {getPriorityText(selectedIncident.priority)}
        </div>
      </div>
      
      <div className="detail-content">
        <div className="incident-info">
          <div className="info-item">
            <strong>Location:</strong> {selectedIncident.location}
          </div>
          <div className="info-item">
            <strong>Address:</strong> {selectedIncident.address}
          </div>
          <div className="info-item">
            <strong>Time:</strong> {formatDate(selectedIncident.created_at)}
          </div>
          <div className="info-item">
            <strong>Units Requested:</strong> {selectedIncident.units_requested}
          </div>
          {selectedIncident.pertinent_details && (
            <div className="info-item">
              <strong>Details:</strong> {selectedIncident.pertinent_details}
            </div>
          )}
        </div>
        
        {/* Response Actions for Fire Marshal */}
        {currentUser?.user_type === 'Fire Marshal Unit' && (
          <div className="response-actions">
            <div className="unit-input">
              <input
                type="text"
                placeholder="Enter your unit number (e.g., Engine 1)"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
              />
              <button onClick={handleRespond} className="respond-button">
                Respond to Call
              </button>
            </div>
            
            <div className="status-buttons">
              <button 
                onClick={() => updateUnitStatus(selectedIncident.id, 'On Scene')}
                className="status-button on-scene"
              >
                On Scene
              </button>
              <button 
                onClick={() => updateUnitStatus(selectedIncident.id, 'Clear')}
                className="status-button clear"
              >
                Clear
              </button>
            </div>
          </div>
        )}
        
        {/* Field Reporting Section */}
        <div className="field-reporting">
          <h3>Field Reporting</h3>
          
          {/* Field Notes */}
          <div className="field-section">
            <h4>Field Notes</h4>
            <div className="note-input">
              <textarea
                placeholder="Enter field notes..."
                value={fieldNote}
                onChange={(e) => setFieldNote(e.target.value)}
              />
              <button onClick={handleAddFieldNote} className="add-note-button">
                Add Note
              </button>
            </div>
          </div>
          
          {/* Photo Upload */}
          <div className="field-section">
            <h4>Photo Upload</h4>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="photo-upload"
            />
          </div>
          
          {/* Resource Requests */}
          <div className="field-section">
            <h4>Request Resources</h4>
            <div className="resource-buttons">
              <button 
                onClick={() => handleResourceRequest('FIRE')}
                className="resource-button fire"
              >
                🚒 Fire
              </button>
              <button 
                onClick={() => handleResourceRequest('ADDITIONAL_UNIT')}
                className="resource-button police"
              >
                👮 Additional Unit
              </button>
              <button 
                onClick={() => handleResourceRequest('EMS')}
                className="resource-button ems"
              >
                🚑 EMS
              </button>
            </div>
          </div>
          
          {/* Activity Timeline */}
          <div className="field-section">
            <h4>Activity Timeline</h4>
            <div className="timeline">
              {selectedIncident.timeline && selectedIncident.timeline.length > 0 ? (
                selectedIncident.timeline.map((item, index) => (
                  <div key={index} className="timeline-item">
                    <div className="timeline-time">
                      {formatDate(item.timestamp)}
                    </div>
                    <div className="timeline-content">
                      {item.type === 'photo' ? (
                        <div className="photo-item">
                          <img src={item.content} alt="Incident photo" className="timeline-photo" />
                          {(currentUser?.user_type === 'Dispatch Unit' || currentUser?.user_type === 'Admin User') && (
                            <button 
                              onClick={() => downloadPhoto(item.content, `incident-${selectedIncident.id}-photo-${index}.jpg`)}
                              className="download-photo-button"
                            >
                              Download JPEG
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-item">
                          {item.type === 'resource' && item.icon && (
                            <span className="resource-icon">{item.icon}</span>
                          )}
                          {item.content}
                        </div>
                      )}
                    </div>
                    <div className="timeline-user">
                      {item.user || currentUser?.unit_id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-timeline">No activity recorded yet</div>
              )}
            </div>
          </div>
          
          {/* Unit Times */}
          <div className="field-section">
            <h4>Unit Times</h4>
            <div className="unit-times">
              <div className="time-item">
                <strong>En Route:</strong> {userStatus === 'Responding' ? formatTime(new Date()) : '--:--'}
              </div>
              <div className="time-item">
                <strong>Arrival:</strong> {userStatus === 'On Scene' ? formatTime(new Date()) : '--:--'}
              </div>
              <div className="time-item">
                <strong>Clear:</strong> {userStatus === 'Clear' ? formatTime(new Date()) : '--:--'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Modal Components
  const renderCreateCallModal = () => (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Create New Call</h3>
          <button 
            onClick={() => setShowCreateCall(false)}
            className="close-button"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleCreateCall} className="call-form">
          <div className="form-group">
            <label>Incident Type</label>
            <select name="incidentType" required>
              <option value="">Select Type</option>
              {callTypes.map(type => (
                <option key={type.id || type} value={type.name || type}>
                  {type.name || type}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Location/Landmark</label>
            <input type="text" name="location" required />
          </div>
          
          <div className="form-group">
            <label>Full Address</label>
            <input type="text" name="address" required />
          </div>
          
          <div className="form-group">
            <label>Priority Level</label>
            <select name="priority" required>
              <option value="1">1 - High</option>
              <option value="2">2 - Medium</option>
              <option value="3">3 - Low</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Number of Units Requested</label>
            <input type="number" name="unitsRequested" min="1" max="10" required />
          </div>
          
          <div className="form-group">
            <label>Pertinent Details</label>
            <textarea name="pertinentDetails" rows="3"></textarea>
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={() => setShowCreateCall(false)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Create Call
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderEditCallModal = () => (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit Call</h3>
          <button 
            onClick={() => {
              setShowEditCall(false);
              setEditingIncident(null);
            }}
            className="close-button"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleEditCall} className="call-form">
          <div className="form-group">
            <label>Incident Type</label>
            <select name="incidentType" defaultValue={editingIncident?.type} required>
              <option value="">Select Type</option>
              {callTypes.map(type => (
                <option key={type.id || type} value={type.name || type}>
                  {type.name || type}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Location/Landmark</label>
            <input type="text" name="location" defaultValue={editingIncident?.location} required />
          </div>
          
          <div className="form-group">
            <label>Full Address</label>
            <input type="text" name="address" defaultValue={editingIncident?.address} required />
          </div>
          
          <div className="form-group">
            <label>Priority Level</label>
            <select name="priority" defaultValue={editingIncident?.priority} required>
              <option value="1">1 - High</option>
              <option value="2">2 - Medium</option>
              <option value="3">3 - Low</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Number of Units Requested</label>
            <input 
              type="number" 
              name="unitsRequested" 
              min="1" 
              max="10" 
              defaultValue={editingIncident?.units_requested} 
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Pertinent Details</label>
            <textarea 
              name="pertinentDetails" 
              rows="3" 
              defaultValue={editingIncident?.pertinent_details}
            ></textarea>
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={() => {
              setShowEditCall(false);
              setEditingIncident(null);
            }}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderClearConfirmModal = () => (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>Confirm Clear Call</h3>
        </div>
        
        <div className="modal-content">
          <p>Are you sure you want to clear this call?</p>
          <p><strong>{clearingIncident?.type}</strong> at {clearingIncident?.location}</p>
        </div>
        
        <div className="form-actions">
          <button onClick={() => {
            setShowClearConfirm(false);
            setClearingIncident(null);
          }}>
            Cancel
          </button>
          <button onClick={handleClearCall} className="danger">
            Clear Call
          </button>
        </div>
      </div>
    </div>
  );

  const renderManageCallTypesModal = () => (
    <div className="modal-overlay">
      <div className="modal large">
        <div className="modal-header">
          <h3>Manage Call Types</h3>
          <button 
            onClick={() => setShowManageCallTypes(false)}
            className="close-button"
          >
            ×
          </button>
        </div>
        
        <div className="modal-content">
          <div className="add-call-type">
            <h4>Add New Call Type</h4>
            <div className="form-row">
              <input
                type="text"
                placeholder="Call type name"
                value={newCallType.name}
                onChange={(e) => setNewCallType(prev => ({ ...prev, name: e.target.value }))}
              />
              <select
                value={newCallType.priority}
                onChange={(e) => setNewCallType(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
              >
                <option value="1">Priority 1 - High</option>
                <option value="2">Priority 2 - Medium</option>
                <option value="3">Priority 3 - Low</option>
              </select>
              <button onClick={createCallType} className="primary">
                Add Call Type
              </button>
            </div>
          </div>
          
          <div className="call-types-list">
            <h4>Existing Call Types</h4>
            {callTypes.map(type => (
              <div key={type.id || type} className="call-type-item">
                <span className="type-name">{type.name || type}</span>
                {type.priority && (
                  <span className="type-priority">Priority {type.priority}</span>
                )}
                <button 
                  onClick={() => deleteCallType(type.id)}
                  className="delete-button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderManageUnitsModal = () => (
    <div className="modal-overlay">
      <div className="modal large">
        <div className="modal-header">
          <h3>Manage Units</h3>
          <button 
            onClick={() => setShowManageUnits(false)}
            className="close-button"
          >
            ×
          </button>
        </div>
        
        <div className="modal-content">
          <div className="units-list">
            <h4>Fire Marshal Units</h4>
            {units.filter(unit => unit.user_type === 'Fire Marshal Unit').map(unit => (
              <div key={unit.id} className="unit-item">
                <input
                  type="text"
                  value={editingUnit?.id === unit.id ? editingUnit.display_name : unit.display_name}
                  onChange={(e) => setEditingUnit({ ...unit, display_name: e.target.value })}
                  onBlur={() => {
                    if (editingUnit?.id === unit.id) {
                      updateUnit(unit.id, { display_name: editingUnit.display_name });
                      setEditingUnit(null);
                    }
                  }}
                  onFocus={() => setEditingUnit(unit)}
                />
              </div>
            ))}
            
            <h4>Dispatch Units</h4>
            {units.filter(unit => unit.user_type === 'Dispatch Unit').map(unit => (
              <div key={unit.id} className="unit-item">
                <input
                  type="text"
                  value={editingUnit?.id === unit.id ? editingUnit.display_name : unit.display_name}
                  onChange={(e) => setEditingUnit({ ...unit, display_name: e.target.value })}
                  onBlur={() => {
                    if (editingUnit?.id === unit.id) {
                      updateUnit(unit.id, { display_name: editingUnit.display_name });
                      setEditingUnit(null);
                    }
                  }}
                  onFocus={() => setEditingUnit(unit)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // Main Render
  return (
    <div className="App">
      {currentView === 'login' && renderLogin()}
      {currentView === 'dashboard' && !selectedIncident && renderDashboard()}
      {selectedIncident && renderIncidentDetail()}
      
      {/* Modals */}
      {showCreateCall && renderCreateCallModal()}
      {showEditCall && renderEditCallModal()}
      {showClearConfirm && renderClearConfirmModal()}
      {showManageCallTypes && renderManageCallTypesModal()}
      {showManageUnits && renderManageUnitsModal()}
    </div>
  );
}

export default App;

