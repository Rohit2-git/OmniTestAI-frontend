import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Application, TestCase, ExecutionRun, KnowledgeAsset } from '../types';
import { apiService } from '../services/api';

interface AppContextType {
  applications: Application[];
  testCases: TestCase[];
  history: ExecutionRun[];
  knowledgeAssets: KnowledgeAsset[];
  activeAppId: string | null;
  setActiveAppId: (id: string | null) => void;
  addApplication: (app: Omit<Application, 'id' | 'createdAt'>) => Application;
  updateApplication: (app: Application) => void;
  deleteApplication: (id: string) => void;
  addTestCase: (tc: Omit<TestCase, 'id' | 'createdAt'>) => TestCase;
  updateTestCase: (tc: TestCase) => void;
  deleteTestCase: (id: string) => void;
  addExecutionRun: (run: ExecutionRun) => void;
  addKnowledgeAsset: (asset: Omit<KnowledgeAsset, 'id' | 'createdAt'>) => KnowledgeAsset;
  deleteKnowledgeAsset: (id: string) => void;
  // Persistent generation studio history cache
  generationBatches: any[];
  setGenerationBatches: React.Dispatch<React.SetStateAction<any[]>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [applications, setApplications] = useState<Application[]>(() => {
    const saved = localStorage.getItem('ai_agent_applications');
    return saved ? JSON.parse(saved) : []; 
  });

  const [testCases, setTestCases] = useState<TestCase[]>(() => {
    const saved = localStorage.getItem('ai_agent_testcases');
    return saved ? JSON.parse(saved) : []; 
  });

  const [history, setHistory] = useState<ExecutionRun[]>(() => {
    const saved = localStorage.getItem('ai_agent_history');
    return saved ? JSON.parse(saved) : []; 
  });

  const [knowledgeAssets, setKnowledgeAssets] = useState<KnowledgeAsset[]>(() => {
    const saved = localStorage.getItem('ai_agent_knowledge_assets');
    return saved ? JSON.parse(saved) : []; 
  });

  const [activeAppId, setActiveAppId] = useState<string | null>(() => {
    const saved = localStorage.getItem('ai_agent_active_appid');
    if (saved) return saved;
    return applications.length > 0 ? applications[0].id : null;
  });

  // FIXED & FULLY REPLACED: Generation cache initialized straight out of localStorage memory to survive reloads
  const [generationBatches, setGenerationBatches] = useState<any[]>(() => {
    const saved = localStorage.getItem('ai_agent_temp_batches');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => { localStorage.setItem('ai_agent_applications', JSON.stringify(applications)); }, [applications]);
  useEffect(() => { localStorage.setItem('ai_agent_testcases', JSON.stringify(testCases)); }, [testCases]);
  useEffect(() => { localStorage.setItem('ai_agent_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('ai_agent_knowledge_assets', JSON.stringify(knowledgeAssets)); }, [knowledgeAssets]);
  useEffect(() => { if (activeAppId) localStorage.setItem('ai_agent_active_appid', activeAppId); }, [activeAppId]);

  // NEW DYNAMIC EFFECT TRACKER: Synchronizes generation states into cache boundaries on every write mutation
  useEffect(() => {
    localStorage.setItem('ai_agent_temp_batches', JSON.stringify(generationBatches));
  }, [generationBatches]);

  const addApplication = (appData: Omit<Application, 'id' | 'createdAt'>) => {
    const newApp: Application = { ...appData, id: `app-${Date.now()}`, createdAt: new Date().toISOString() };
    setApplications(prev => [newApp, ...prev]);
    if (!activeAppId) setActiveAppId(newApp.id);
    return newApp;
  };

  const updateApplication = (updatedApp: Application) => {
    setApplications(prev => prev.map(app => app.id === updatedApp.id ? updatedApp : app));
  };

  const deleteApplication = (id: string) => {
    setApplications(prev => prev.filter(app => app.id !== id));
    setTestCases(prev => prev.filter(tc => tc.appId !== id));
    setHistory(prev => prev.filter(run => run.appId !== id));
    setKnowledgeAssets(prev => prev.filter(asset => asset.appId !== id));
    if (activeAppId === id) {
      const remaining = applications.filter(app => app.id !== id);
      setActiveAppId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const addTestCase = (tcData: Omit<TestCase, 'id' | 'createdAt'>) => {
    const newTestCase: TestCase = {
      ...tcData,
      id: `tc-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      createdAt: new Date().toISOString()
    };
    setTestCases(prev => [...prev, newTestCase]);
    return newTestCase;
  };

  const updateTestCase = (updatedTestCase: TestCase) => {
    setTestCases(prev => prev.map(tc => tc.id === updatedTestCase.id ? updatedTestCase : tc));
  };

  const deleteTestCase = async (id: string) => {
    setTestCases(prev => prev.filter(tc => tc.id !== id));
    const numericId = parseInt(id.replace(/^\D+/g, ''), 10);
    if (!isNaN(numericId)) {
      try {
        await apiService.deleteRunRecord(numericId);
      } catch (err) {
        console.error("Backend single sync delete execution failure context:", err);
      }
    }
  };

  const addExecutionRun = (run: ExecutionRun) => { setHistory(prev => [run, ...prev]); };
  const addKnowledgeAsset = (assetData: Omit<KnowledgeAsset, 'id' | 'createdAt'>) => {
    const newAsset: KnowledgeAsset = { ...assetData, id: `kb-${Date.now()}`, createdAt: new Date().toISOString() };
    setKnowledgeAssets(prev => [newAsset, ...prev]);
    return newAsset;
  };
  const deleteKnowledgeAsset = (id: string) => { setKnowledgeAssets(prev => prev.filter(asset => asset.id !== id)); };

  return (
    <AppContext.Provider value={{
      applications, testCases, history, knowledgeAssets, activeAppId, setActiveAppId,
      addApplication, updateApplication, deleteApplication, addTestCase, updateTestCase,
      deleteTestCase, addExecutionRun, addKnowledgeAsset, deleteKnowledgeAsset,
      generationBatches, setGenerationBatches
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};