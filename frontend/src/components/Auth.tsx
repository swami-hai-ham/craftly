import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../config';

type User = {
  username: string;
  isLoggedIn: boolean;
};

export function Auth() {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Check if user is already saved in localStorage on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      } catch (err) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('Sending login request to:', `${BACKEND_URL}/auth/login`);
      const response = await axios.post(`${BACKEND_URL}/auth/login`, {
        username,
        password
      });
      
      console.log('Login response:', response.data);
      
      if (response.data.success) {
        const loggedInUser = {
          username,
          isLoggedIn: true
        };
        setUser(loggedInUser);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        setShowModal(false);
        setUsername('');
        setPassword('');
      } else {
        setError(response.data.message || 'Invalid credentials');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Login failed. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('Sending register request to:', `${BACKEND_URL}/auth/register`);
      const response = await axios.post(`${BACKEND_URL}/auth/register`, {
        username,
        password
      });
      
      console.log('Register response:', response.data);
      
      if (response.data.success) {
        setActiveTab('login');
        setUsername('');
        setPassword('');
        alert('Registration successful! You can now log in with your credentials.');
      } else {
        setError(response.data.message || 'Registration failed');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.response?.data?.message || 'Registration failed. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <div className="relative">
      {!user?.isLoggedIn ? (
        <button
          onClick={() => setShowModal(true)}
          className="text-gray-100 hover:text-gray-300 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 cursor-pointer"
          style={{ pointerEvents: 'auto' }}
        >
          Login
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-gray-300">Hello, {user.username}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-gray-300 cursor-pointer"
            style={{ pointerEvents: 'auto' }}
          >
            Logout
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ pointerEvents: 'auto' }}>
          <div className="bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-4">
                <button
                  className={`px-4 py-2 cursor-pointer ${
                    activeTab === 'login'
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-gray-400'
                  }`}
                  onClick={() => {
                    setActiveTab('login');
                    setError('');
                  }}
                  style={{ pointerEvents: 'auto' }}
                >
                  Login
                </button>
                <button
                  className={`px-4 py-2 cursor-pointer ${
                    activeTab === 'register'
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-gray-400'
                  }`}
                  onClick={() => {
                    setActiveTab('register');
                    setError('');
                  }}
                  style={{ pointerEvents: 'auto' }}
                >
                  Register
                </button>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-200 cursor-pointer"
                style={{ pointerEvents: 'auto' }}
              >
                ✕
              </button>
            </div>

            {error && <div className="bg-red-900 text-red-200 px-4 py-2 rounded mb-4">{error}</div>}

            {activeTab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-gray-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full cursor-pointer ${isLoading ? 'bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2 rounded transition-colors`}
                  style={{ pointerEvents: isLoading ? 'none' : 'auto' }}
                >
                  {isLoading ? 'Logging in...' : 'Login'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="reg-username" className="block text-gray-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    id="reg-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
                <div>
                  <label htmlFor="reg-password" className="block text-gray-300 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="reg-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                    style={{ pointerEvents: 'auto' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full cursor-pointer ${isLoading ? 'bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2 rounded transition-colors`}
                  style={{ pointerEvents: isLoading ? 'none' : 'auto' }}
                >
                  {isLoading ? 'Registering...' : 'Register'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 