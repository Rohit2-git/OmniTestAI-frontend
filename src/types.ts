export interface Application {
  id: string;
  name: string;
  description: string;
  platform: 'web' | 'mobile' | 'api';
  url: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

export interface TestCaseStep {
  id: string;
  instruction: string;
  expected: string;
}

export interface TestCase {
  id: string;
  appId: string;
  title: string;
  description: string;
  steps: TestCaseStep[];
  priority: 'low' | 'medium' | 'high';
  source?: 'manual' | 'ai-jira' | 'ai-acceptance';
  sourceReference?: string;
  section: string; // e.g. "Auth", "Checkout", "Profile"
  createdAt: string;
}

export interface KnowledgeAsset {
  id: string;
  appId: string;
  name: string;
  type: 'doc' | 'link' | 'image' | 'pdf';
  summary: string;
  url?: string;
  tags: string[];
  createdAt: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'step' | 'success' | 'error' | 'warning';
  message: string;
}

export interface SimulationScreenshot {
  stepIndex: number;
  viewName: string;
  imageType: 'login' | 'dashboard' | 'search' | 'cart' | 'checkout' | 'payment_success' | 'profile' | 'settings' | 'error';
  highlightSelector?: string;
  highlightText?: string;
}

export interface ExecutionRun {
  id: string;
  appId: string;
  testCaseIds: string[];
  status: 'passed' | 'failed' | 'running';
  nlInstruction?: string;
  logs: LogEntry[];
  screenshots?: SimulationScreenshot[];
  metrics: {
    durationMs: number;
    stepsCount: number;
    passedCount: number;
  };
  executedAt: string;
}
