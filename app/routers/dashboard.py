# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
from app.database import db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/metrics")
async def get_dashboard_metrics():
    """
    Aggregates real-time testing telemetry by evaluating ONLY officially
    saved master blueprints to filter out abandoned generation attempts.
    """
    try:
        # 1. Fetch all records from SQLite
        test_results = await db.testresult.find_many()
        execution_runs = await db.executionrun.find_many()
        total_knowledge_assets = await db.knowledgeasset.count()

        # 2. Filter for SAVED Blueprints Only
        # We only count a result if it has been assigned a title by the user.
        # This ensures the 56 unsaved cases from your history are ignored.
        unique_saved_ai = set()
        unique_saved_manual = set()
        
        for result in test_results:
            title = getattr(result, 'title', None)
            # If title is None or empty, it hasn't been saved to Repo yet
            if not title or title.strip() == "":
                continue
                
            run_id_val = getattr(result, 'runId', None)
            
            if run_id_val is not None:
                unique_saved_ai.add(title.strip())
            else:
                unique_saved_manual.add(title.strip())

        # Total count is now strictly the 26 unique titles in your Manager
        total_master_count = len(unique_saved_ai) + len(unique_saved_manual)

        # 3. Execution Health Aggregation
        running_jobs = 0
        total_passed_steps = 0
        total_steps_count = 0
        
        for run in execution_runs:
            status = getattr(run, 'status', '').lower()
            if status in ('running', 'queued'):
                running_jobs += 1
                
            total_passed_steps += getattr(run, 'passed', 0)
            total_steps_count += getattr(run, 'total', 0)

        overall_pass_rate = 100
        if total_steps_count > 0:
            overall_pass_rate = round((total_passed_steps / total_steps_count) * 100)

        return {
            "totalTestCases": total_master_count,
            "aiGeneratedTests": len(unique_saved_ai),
            "manualAuthoredTests": len(unique_saved_manual),
            "overallPassRate": overall_pass_rate,
            "runningJobs": running_jobs,
            "totalKnowledgeAssets": total_knowledge_assets
        }
        
    except Exception as e:
        print(f"❌ Dashboard Aggregate Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to calculate master metrics.")