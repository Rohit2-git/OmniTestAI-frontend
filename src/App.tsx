import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Repository } from './components/Repository';
import { Generator } from './components/Generator';
import { Executor } from './components/Executor';
import { Analytics } from './components/Analytics';
import { KnowledgeBase } from './components/KnowledgeBase';
import { TestDataManager } from './components/TestDataManager';
import { UserManagement } from './components/UserManagement';
import { TokenUsage } from './components/TokenUsage';

function AppContent() {
  const { user } = useAuth();
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
        return (
          <ProtectedRoute allowedRoles={['admin', 'qa_engineer', 'developer']}>
            <Generator />
          </ProtectedRoute>
        );
      case 'knowledge':
        return <KnowledgeBase />;
      case 'test-data':
        return <TestDataManager />;
      case 'executor':
        return (
          <ProtectedRoute allowedRoles={['admin', 'qa_engineer', 'developer', 'qa_reviewer']}>
            <Executor
              selectedTestIdsForRun={selectedTestIdsForRun}
              clearSelectedTests={clearSelectedTests}
              readOnly={user?.role === 'qa_reviewer'}
            />
          </ProtectedRoute>
        );
      case 'analytics':
        return <Analytics />;
      case 'token-usage':
        return (
          <ProtectedRoute allowedRoles={['admin']}>
            <TokenUsage />
          </ProtectedRoute>
        );
      case 'admin':
        return (
          <ProtectedRoute allowedRoles={['admin', 'qa_engineer']}>
            <UserManagement />
          </ProtectedRoute>
        );
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

function AppWithUserContext() {
  const { user } = useAuth();
  return (
    <AppProvider userRole={user?.role}>
      <AppContent />
    </AppProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <AppWithUserContext />
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;