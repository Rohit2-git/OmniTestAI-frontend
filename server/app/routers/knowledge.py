# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List, Optional
from app.database import db

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

class AssetCreate(BaseModel):
    appId: str
    name: str
    type: str
    summary: str
    tags: List[str]
    url: Optional[str] = None

@router.post("/")
async def create_asset(asset: AssetCreate):
    try:
        tags_str = ",".join(asset.tags) if asset.tags else ""
        
        return await db.knowledgeasset.create(data={
            "appId": asset.appId,
            "name": asset.name,
            "type": asset.type,
            "summary": asset.summary,
            "tags": tags_str,
            "url": asset.url
        })
    except Exception as e:
        print(f"CRITICAL WRITE ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database write failure: {str(e)}")

@router.get("/{app_id}")
async def get_assets(app_id: str):
    try:
        # 1. FIXED: Removed the invalid 'order_by' keyword argument to satisfy the Python Prisma Client compiler
        assets = await db.knowledgeasset.find_many(
            where={"appId": str(app_id)}
        )
        
        formatted_assets = []
        for asset in assets:
            raw_tags = getattr(asset, 'tags', '')
            
            if isinstance(raw_tags, str) and raw_tags.strip():
                parsed_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            else:
                parsed_tags = []

            # Safe extraction of base schema properties
            asset_id = getattr(asset, 'id')
            app_id_val = getattr(asset, 'appId')
            name = getattr(asset, 'name')
            asset_type = getattr(asset, 'type')
            summary = getattr(asset, 'summary')
            url = getattr(asset, 'url', None)
            created_at_raw = getattr(asset, 'createdAt', None)
            created_at_iso = created_at_raw.isoformat() if created_at_raw and hasattr(created_at_raw, 'isoformat') else None

            formatted_assets.append({
                "id": asset_id,
                "appId": app_id_val,
                "name": name,
                "type": asset_type,
                "summary": summary,
                "url": url,
                "tags": parsed_tags,
                "createdAt": created_at_iso
            })
            
        # Sort in memory: newest entries display first on the card interface stack
        formatted_assets.reverse()
        return formatted_assets
        
    except Exception as e:
        print(f"\n❌ [CRITICAL ENGINE EXCEPTION] Failed inside get_assets route handler: {str(e)}\n")
        raise HTTPException(
            status_code=500, 
            detail=f"Backend layout compiler error: {str(e)}"
        )

@router.delete("/{asset_id}")
async def delete_asset(asset_id: int):
    try:
        await db.knowledgeasset.delete(where={"id": int(asset_id)})
        return {"status": "success", "message": "Asset safely unlinked from knowledge space."}
    except Exception as e:
        print(f"CRITICAL DELETE ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database target deletion error: {str(e)}")