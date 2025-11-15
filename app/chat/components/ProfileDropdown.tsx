'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User, LogOut, ChevronDown } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  picture?: string;
  isVerified: boolean;
}

export default function ProfileDropdown() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/user/profile');
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const data = await response.json();
      if (data.success) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-pulse">
          <div className="h-8 w-8 bg-primary/20 rounded-full"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-xl hover:bg-primary/10 transition-all border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.fullName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
        )}
        <span className="text-sm font-semibold text-foreground hidden sm:inline">
          {user.fullName || user.email}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-primary/30 bg-gradient-to-br from-card/95 to-card/90 backdrop-blur-xl shadow-2xl z-50">
          <div className="p-4 border-b border-primary/20">
            <div className="flex items-center space-x-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.fullName}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/40 to-accent/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {user.fullName || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            {user.isVerified && (
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
                  ✓ Verified
                </span>
              </div>
            )}
          </div>

          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-primary/10 transition-all font-semibold"
            >
              <LogOut className="w-4 h-4 text-primary" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
