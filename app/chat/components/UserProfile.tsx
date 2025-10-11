'use client';

import React, { useState, useEffect } from 'react';
import { UserIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  picture?: string;
  isVerified: boolean;
}

interface UserProfileProps {
  compact?: boolean;
  showLogout?: boolean;
}

export default function UserProfile({ compact = false, showLogout = true }: UserProfileProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserProfile();
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
      } else {
        setError('Failed to load profile');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  if (loading) {
    return (
      <div className={`${compact ? 'p-2' : 'p-4'} flex items-center space-x-2`}>
        <div className="animate-pulse">
          <div className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} bg-gray-300 rounded-full`}></div>
        </div>
        {!compact && (
          <div className="animate-pulse">
            <div className="h-4 bg-gray-300 rounded w-24"></div>
          </div>
        )}
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className={`${compact ? 'p-2' : 'p-4'} text-red-500 text-sm`}>
        {error || 'Failed to load profile'}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center space-x-2 p-2">
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.fullName}
            className="h-6 w-6 rounded-full"
          />
        ) : (
          <div className="h-6 w-6 bg-blue-500 rounded-full flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="text-sm font-medium text-gray-700 truncate">
          {user.fullName || user.email}
        </span>
        {user.isVerified && (
          <span className="text-xs text-green-600" title="Verified">✓</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center space-x-3">
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.fullName}
            className="h-12 w-12 rounded-full"
          />
        ) : (
          <div className="h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-white" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">
            {user.fullName || 'User'}
          </h3>
          <p className="text-sm text-gray-600">{user.email}</p>
          {user.isVerified && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              ✓ Verified
            </span>
          )}
        </div>
      </div>

      {showLogout && (
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      )}
    </div>
  );
}