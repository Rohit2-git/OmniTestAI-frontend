import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Repository } from './components/Repository';
import { Generator } from './components/Generator';
import { Executor } from './components/Executor';
import { Analytics } from './components/Analytics';
import { KnowledgeBase } from './components/KnowledgeBase';

function AppContent() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedTestIdsForRun, setSelectedTestIdsForRun] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const clearSelectedTests = () => {
    setSelectedTestIdsForRun([]);
  };

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'repository':
        return (
          <Repository
            setActiveTab={setActiveTab}
            setSelectedTestIdsForRun={setSelectedTestIdsForRun}
          />
        );
      case 'generator':
        return <Generator />;
      case 'knowledge':
        return <KnowledgeBase />;
      case 'executor':
        return (
          <Executor
            selectedTestIdsForRun={selectedTestIdsForRun}
            clearSelectedTests={clearSelectedTests}
          />
        );
      case 'analytics':
        return <Analytics />;
      default:
        return <Dashboard setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
      />
      <main className="main-content">
        {renderActiveTabContent()}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
