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
   * Triggers Stagehand AI execution runs against web targets matching a list of instructions
   */
  executeNLSteps: async (url: string, steps: string[]): Promise<any> => {
    const response = await fetch(`${BASE_URL}/execute/nl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, steps }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Execution failed with status: ${response.status}`);
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
   * CONNECTED: Fetches live telemetry aggregate counters from the backend SQLite database
   * to feed real-time values into the primary Command Center dashboard cards.
   */
  getLiveDashboardMetrics: async (): Promise<any> => {
    const response = await fetch(`${BASE_URL}/dashboard/metrics`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`Metrics aggregation terminal failure: ${response.status}`);
    }
    return response.json();
  }
};