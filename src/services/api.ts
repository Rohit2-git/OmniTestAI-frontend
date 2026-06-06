const BASE_URL = 'http://localhost:8000';

export const apiService = {
  /**
   * Translates plain natural language or pasted text into a virtual document text blob,
   * binds the active app identity, and forwards it to the core router fields.
   */
  generateTestPack: async (textContext: string, appId?: string): Promise<any> => {
    const blob = new Blob([textContext], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'requirements.txt');
    
    if (appId) {
      formData.append('app_id', appId);
    }

    const response = await fetch(`${BASE_URL}/tests/generate`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Server responded with status: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Maps multiple staged context files (User Stories, Wireframe captures, or guidelines)
   * to backend router payload fields, appending app_id parameters for grounding references.
   */
  generateTestPackFromFiles: async (
    stagedFiles: Array<{ file: File; type: 'file' | 'wireframe' | 'context' }>, 
    appId?: string
  ): Promise<any> => {
    const formData = new FormData();

    if (appId) {
      formData.append('app_id', appId);
    }

    stagedFiles.forEach(item => {
      if (item.type === 'file') {
        formData.append('file', item.file); 
      } else if (item.type === 'wireframe') {
        formData.append('wireframe', item.file); 
      } else if (item.type === 'context') {
        formData.append('context_file', item.file); 
      }
    });

    const response = await fetch(`${BASE_URL}/tests/generate`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Generation engine error: ${response.status}`);
    }
    return response.json();
  },

  /**
   * a] Execute Single Test (Interactive Headful Mode)
   * Sends raw script string arrays straight into the launcher.
   */
  executeSingleTest: async (runId: number, baseUrl: string, steps: string[]): Promise<any> => {
    const response = await fetch(`${BASE_URL}/execute/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        run_id: runId, 
        base_url: baseUrl,
        is_single: true,
        steps: steps // Pipes active strings directly from UI layout memory
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Single headful execution failed: ${response.status}`);
    }
    return response.json();
  },

  /**
   * b] Execute Bulk Test Run (Headless Pipeline + Screenshot Chronology)
   */
  executeTestRun: async (runId: number, baseUrl: string): Promise<any> => {
    const response = await fetch(`${BASE_URL}/execute/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        run_id: runId, 
        base_url: baseUrl,
        is_single: false 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Bulk pipeline execution failed: ${response.status}`);
    }
    return response.json();
  },

  /**
   * c] NL Executor (Autonomous Headless Stream + Screenshots)
   */
  executeNLSteps: async (url: string, steps: string[]): Promise<any> => {
    const response = await fetch(`${BASE_URL}/execute/nl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url, 
        steps,
        is_single: false 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `NL execution failed with status: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Deletes a test execution suite record entry from database persistence
   */
  deleteRunRecord: async (runId: number): Promise<any> => {
    const response = await fetch(`${BASE_URL}/results/${runId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Deletion endpoint error: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Fetches context knowledge base assets associated with a specific appId
   */
  getKnowledgeAssets: async (appId: string): Promise<any> => {
    const response = await fetch(`${BASE_URL}/knowledge/${appId}`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`Failed fetching knowledge base elements: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Dispatches a fresh structured context asset payload directly to the server repository
   */
  addKnowledgeAsset: async (assetPayload: any): Promise<any> => {
    const response = await fetch(`${BASE_URL}/knowledge/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assetPayload),
    });
    if (!response.ok) {
      throw new Error(`Failed saving asset documentation to server context: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Deletes an asset record from project context permanently
   */
  deleteKnowledgeAsset: async (assetId: number): Promise<any> => {
    const response = await fetch(`${BASE_URL}/knowledge/${assetId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed deleting asset from remote database stack: ${response.status}`);
    }
    return response.json();
  },

  /**
   * CONNECTED: Fetches live telemetry aggregate counters from the backend database
   * to feed real-time values into the primary Center dashboard cards.
   */
  getLiveDashboardMetrics: async (): Promise<any> => {
    const response = await fetch(`${BASE_URL}/dashboard/metrics`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`Metrics aggregation terminal failure: ${response.status}`);
    }
    return response.json();
  },

  /**
   * ADDED MECHANIC: Fetches comprehensive historical run logs and assertion statuses
   * from the backend relative database stack to supply the Insights view.
   */
  getExecutionHistory: async (runId: number): Promise<any> => {
    const response = await fetch(`${BASE_URL}/results/${runId}/execution`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch history details for run reference ID: ${runId}`);
    }
    return response.json();
  }
};