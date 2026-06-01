import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import type { LogEntry} from '../types';
import { 
  Play,  
  RotateCcw, 
  Terminal as TerminalIcon, 
  Globe
} from 'lucide-react';
import { apiService } from '../services/api'; // Imported live bridge client

interface ExecutorProps {
  selectedTestIdsForRun: string[];
  clearSelectedTests: () => void;
}

interface SimActionStep {
  log: string;
  logType: 'info' | 'step' | 'success' | 'warning' | 'error';
  browserState: string;
  highlightSelector?: string;
  highlightText?: string;
  value?: string;
  duration?: number;
}

export const Executor: React.FC<ExecutorProps> = ({ 
  selectedTestIdsForRun, 
}) => {
  const { applications, testCases, activeAppId } = useApp();
  const [nlCommand, setNlCommand] = useState('');
  
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeed] = useState<number>(1);
  const [simLogs, setSimLogs] = useState<LogEntry[]>([]);
  
  const activeApp = applications.find(app => app.id === activeAppId);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const simulationTimerRef = useRef<any | null>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simLogs]);

  useEffect(() => {
    if (selectedTestIdsForRun.length > 0) {
      const selectedTitles = selectedTestIdsForRun
        .map(id => testCases.find(tc => tc.id === id)?.title)
        .filter(Boolean)
        .join(', ');
      setNlCommand(`Execute suite: [${selectedTitles}]`);
    }
  }, [selectedTestIdsForRun, testCases]);

  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    };
  }, []);

  const handleCancelSimulation = () => {
    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);
    setIsSimulating(false);
    setSimLogs([]);
  };

  const getAppUrl = () => activeApp ? activeApp.url : 'https://saucedemo.com';

  const startSimulation = async () => {
    if (!activeAppId) return;
    
    setIsSimulating(true);
    setSimLogs([]);
    
    const time = () => new Date().toTimeString().split(' ')[0];
    pushLogDirect('info', 'Contacting local Stagehand automation worker agent...');

    // Extract target actions
    let activeStepsTextArray: string[] = [];
    if (selectedTestIdsForRun.length > 0) {
      selectedTestIdsForRun.forEach(id => {
        const tc = testCases.find(t => t.id === id);
        if (tc) tc.steps.forEach(s => activeStepsTextArray.push(s.instruction));
      });
    } else {
      activeStepsTextArray = [nlCommand];
    }

    try {
      // Execute the live natural language script loop inside Stagehand
      const executionResult = await apiService.executeNLSteps(getAppUrl(), activeStepsTextArray);
      
      let stepsQueue: SimActionStep[] = [];
      executionResult.results.forEach((res: any) => {
        stepsQueue.push({
          log: `[STAGEHAND] Action step: "${res.step}"`,
          logType: res.status === 'PASSED' ? 'info' : 'error',
          browserState: 'catalog'
        });
        stepsQueue.push({
          log: `[RESULT] Status execution pointer: ${res.status}. (${res.detail})`,
          logType: res.status === 'PASSED' ? 'success' : 'error',
          browserState: 'catalog'
        });
      });      
      let idx = 0;
      simulationTimerRef.current = setInterval(() => {
        if (idx >= stepsQueue.length) {
          clearInterval(simulationTimerRef.current);
          setIsSimulating(false);
          return;
        }
        const currentStep = stepsQueue[idx];
        setSimLogs(prev => [...prev, { timestamp: time(), type: currentStep.logType, message: currentStep.log }]);
        idx++;
      }, 1000 / simSpeed);

    } catch (err: any) {
      pushLogDirect('error', `Stagehand Framework Error: ${err.message}`);
      setIsSimulating(false);
    }
  };

  const pushLogDirect = (type: any, msg: string) => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    setSimLogs(prev => [...prev, { timestamp: timeStr, type, message: msg }]);
  };

  return (
    <div className="executor-view">
      <div className="view-header">
        <h1>Execution Console</h1>
        <p>Interpret natural language instructions, compile step hierarchies, and visually observe the agent executing actions on the target application.</p>
      </div>

      {!activeAppId ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', marginTop: '1.5rem' }}>
          <p>Please select an application to enable execution tools.</p>
        </div>
      ) : (
        <div className="executor-layout">
          <div className="executor-controls-logs">
            <div className="glass-card">
              <span className="selector-label" style={{ display: 'block', marginBottom: '0.55rem' }}>Natural Language Execution Script</span>
              <div className="prompt-bar-wrapper">
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Add product retro runners, apply code SAVE15 and verify checkout..."
                  value={nlCommand}
                  onChange={(e) => setNlCommand(e.target.value)}
                  disabled={isSimulating}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                />
                {!isSimulating ? (
                  <button type="button" className="btn btn-accent" onClick={startSimulation} disabled={!nlCommand.trim()}>
                    <Play size={16} />
                    <span>Run Suite</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="button" className="btn btn-danger" onClick={handleCancelSimulation}>
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="console-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TerminalIcon size={16} />
                  <span>Execution Logs</span>
                </div>
              </div>
              <div className="console-container" style={{ flex: 1, maxHeight: '350px', overflowY: 'auto' }}>
                {simLogs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>Console ready. Provide a natural language command or select a test case to execute.</p>
                ) : (
                  simLogs.map((log, index) => (
                    <div key={index} className="console-log-line">
                      <span className="console-timestamp">[{log.timestamp}]</span>
                      <span className={`console-type-${log.type}`}>{log.type.toUpperCase()}:</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>

          <div className="executor-sim-pane">
            <div className="browser-simulator">
              <div className="browser-navbar">
                <div style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#cbd5e1' }}></span>
                </div>
                <div className="browser-address">
                  <Globe size={12} />
                  <span>{getAppUrl()}</span>
                </div>
              </div>
              <div className="browser-viewport" style={{ backgroundColor: '#1e293b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>[STAGEHAND AUTOMATION SESSION]</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                    Agent running headless browser loop against endpoint URL targets. Check console output lines on the left panel for deep diagnostics.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};