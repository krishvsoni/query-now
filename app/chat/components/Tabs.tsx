'use client';

import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  component: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export default function Tabs({ tabs, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const activeTabData = tabs.find(tab => tab.id === activeTab);

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-primary/20 bg-gradient-to-r from-card/50 to-card/30 backdrop-blur-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group relative flex items-center space-x-2 px-6 py-4 text-sm font-semibold border-b-2 transition-all duration-300
                ${isActive 
                  ? 'border-primary text-foreground bg-gradient-to-br from-primary/20 to-accent/10' 
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-primary/5 hover:border-primary/50'
                }
              `}
            >
              <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent"></div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTabData?.component}
      </div>
    </div>
  );
}
