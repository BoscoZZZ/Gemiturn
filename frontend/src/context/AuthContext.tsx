import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { authAPI } from '../services/api';

// Define types
interface User {
  id: number;
  username: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// API base URL
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002/api';

// Mock user for demo
const MOCK_USER: User = {
  id: 1,
  username: 'admin',
  email: 'admin@gemiturn.com',
  role: 'admin'
};

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          console.log('Token found in localStorage:', token);
          
          // 尝试解析令牌
          try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              console.log('Token payload:', payload);
              console.log('Token subject (sub):', payload.sub);
              console.log('Token type:', typeof payload.sub);
              
              // 检查令牌是否即将过期（如果过期时间小于5分钟）
              const currentTime = Math.floor(Date.now() / 1000);
              if (payload.exp && payload.exp - currentTime < 300) {
                console.log('Token is about to expire, attempting to refresh');
                
                // 尝试刷新令牌
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                  try {
                    const response = await authAPI.refreshToken(refreshToken);
                    const { access_token } = response.data;
                    
                    // 保存新的访问令牌
                    localStorage.setItem('token', access_token);
                    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
                    console.log('Token refreshed successfully');
                  } catch (refreshError) {
                    console.error('Failed to refresh token:', refreshError);
                    // 刷新失败，清除登录状态
                    localStorage.removeItem('token');
                    localStorage.removeItem('refresh_token');
                    delete axios.defaults.headers.common['Authorization'];
                    setIsAuthenticated(false);
                    setIsLoading(false);
                    return;
                  }
                }
              }
            } else {
              console.error('Invalid token format - not enough segments');
            }
          } catch (e) {
            console.error('Error decoding token:', e);
          }
          
          // 设置默认认证头
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          console.log('Set Authorization header:', axios.defaults.headers.common['Authorization']);
          
          // 在开发环境下使用模拟用户
          if (process.env.NODE_ENV === 'development') {
            console.log('Development mode: using mock user');
            setUser(MOCK_USER);
            setIsAuthenticated(true);
          } else {
            // 在生产环境下获取用户信息
            try {
              const response = await authAPI.getMe();
              setUser(response.data);
              setIsAuthenticated(true);
            } catch (error) {
              console.error('Failed to get user info:', error);
              localStorage.removeItem('token');
              localStorage.removeItem('refresh_token');
              delete axios.defaults.headers.common['Authorization'];
              setIsAuthenticated(false);
            }
          }
        } catch (error) {
          console.error('Authentication error:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          delete axios.defaults.headers.common['Authorization'];
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
      
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);
  
  // Login function
  const login = async (username: string, password: string) => {
    try {
      console.log('Attempting login with:', { username });
      
      // Try to use real API login
      try {
        console.log('Using API login');
        const response = await authAPI.login(username, password);
        
        console.log('Login response:', response.data);
        
        const { access_token, refresh_token, user } = response.data;
        
        // Check and validate token format
        if (!access_token || typeof access_token !== 'string') {
          console.error('Invalid token format: token is missing or not a string', access_token);
          throw new Error('Invalid authentication token format');
        }
        
        // Log the token for debugging (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log('JWT token received:', access_token);
          if (refresh_token) {
            console.log('Refresh token received');
          }
        }
        
        // Validate token structure
        const tokenParts = access_token.split('.');
        if (tokenParts.length !== 3) {
          console.error('Invalid token format: token does not have three segments', access_token);
          throw new Error('Invalid authentication token format: not enough segments');
        }
        
        // Parse token payload for debugging
        try {
          const payload = JSON.parse(atob(tokenParts[1]));
          console.log('Token payload:', payload);
          
          // Verify required claims
          const missingClaims = [];
          if (!payload.sub) missingClaims.push('sub');
          if (!payload.exp) missingClaims.push('exp');
          if (!payload.iat) missingClaims.push('iat');
          
          if (missingClaims.length > 0) {
            console.error(`Token missing required claims: ${missingClaims.join(', ')}`);
          }
        } catch (e) {
          console.error('Error decoding token payload:', e);
          // Continue anyway - this is just debugging
        }
        
        // Save tokens and setup auth header
        localStorage.setItem('token', access_token);
        if (refresh_token) {
          localStorage.setItem('refresh_token', refresh_token);
        }
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        console.log('Set Authorization header after login:', axios.defaults.headers.common['Authorization']);
        
        setUser(user);
        setIsAuthenticated(true);
        setIsLoading(false);
      } catch (error) {
        console.error('API login failed:', error);
        
        // 仅在开发环境下使用模拟登录作为后备
        if (process.env.NODE_ENV === 'development' && username === 'admin' && password === 'admin123') {
          console.warn('Falling back to mock login in development');
          
          // 使用与后端相同格式的JWT令牌
          // 这个token包含了所有必要的字段：sub, exp, iat, type, fresh, jti
          const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmcmVzaCI6ZmFsc2UsImlhdCI6MTc0MTM4NTI2NywianRpIjoiZTI1ZGI0N2UtMzRlMS00YzM4LWE5NDgtYTc5YzFmNWQyZGIwIiwidHlwZSI6ImFjY2VzcyIsInN1YiI6IjEiLCJuYmYiOjE3NDEzODUyNjcsImV4cCI6MTc0MTM4ODg2Nywicm9sZSI6ImFkbWluIn0.Gal0zxUBPf1ayN28H3J63r7ewgbHazGhwsylQBjuy0M';
          const mockRefreshToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmcmVzaCI6ZmFsc2UsImlhdCI6MTc0MTM4NTI2NywianRpIjoiZTI1ZGI0N2UtMzRlMS00YzM4LWE5NDgtYTc5YzFmNWQyZGIwIiwidHlwZSI6InJlZnJlc2giLCJzdWIiOiIxIiwibmJmIjoxNzQxMzg1MjY3LCJleHAiOjE3NDQwMTMyNjcsInJvbGUiOiJhZG1pbiJ9.Gal0zxUBPf1ayN28H3J63r7ewgbHazGhwsylQBjuy0M';
          
          // 解析token payload进行验证
          try {
            const tokenParts = mockToken.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            console.log('Mock token payload:', payload);
          } catch (e) {
            console.error('Error decoding mock token:', e);
          }
          
          // 保存令牌
          localStorage.setItem('token', mockToken);
          localStorage.setItem('refresh_token', mockRefreshToken);
          // 设置认证头
          axios.defaults.headers.common['Authorization'] = `Bearer ${mockToken}`;
          console.log('Set mock Authorization header:', axios.defaults.headers.common['Authorization']);
          
          setUser(MOCK_USER);
          setIsAuthenticated(true);
          setIsLoading(false);
        } else {
          // 在生产环境或非管理员用户登录失败时抛出错误
          throw error;
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setIsAuthenticated(false);
      setIsLoading(false);
      throw error;
    }
  };
  
  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setIsAuthenticated(false);
  };
  
  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}; 